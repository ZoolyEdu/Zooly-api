// Histórico de tentativas: testes de INTEGRAÇÃO com MongoDB real em memória (replica set),
// passando pela API HTTP completa. Os índices únicos e as transações são os de verdade.
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import app from "../src/app.js";
import Aluno from "../src/models/Aluno.js";
import Atividade from "../src/models/Atividade.js";
import Escola from "../src/models/Escola.js";
import MovimentacaoMoeda from "../src/models/MovimentacaoMoeda.js";
import Professor from "../src/models/Professor.js";
import ProgressoAtividade from "../src/models/ProgressoAtividade.js";
import TentativaAtividade from "../src/models/TentativaAtividade.js";
import Turma from "../src/models/Turma.js";
import {
  migrarTentativas,
  reverterMigracaoTentativas,
  validarTentativas,
} from "../src/services/migracaoTentativas.js";
import { iniciarBancoMemoria } from "./apoio/bancoMemoria.js";

const segredo = "segredo-somente-teste-tentativas";
const { ObjectId } = mongoose.Types;
let banco;
let servidor;
let baseUrl;
let jwtAnterior;
let d; // dados semeados em cada teste

function token(tipo, id) {
  return jwt.sign({ tipo, nome: "Teste" }, segredo, {
    subject: String(id),
    expiresIn: "5m",
  });
}

async function chamar(caminho, { metodo = "GET", tokenAcesso, corpo } = {}) {
  const resposta = await fetch(`${baseUrl}${caminho}`, {
    method: metodo,
    headers: {
      ...(tokenAcesso ? { Authorization: `Bearer ${tokenAcesso}` } : {}),
      ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
  });
  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto ? JSON.parse(texto) : null };
}

const comoAluno = (aluno = d.alunoA) => token("aluno", aluno._id);
const comoProfessor = (professor = d.professorA) =>
  token("professor", professor._id);

const iniciar = (atividade = d.atividade1, tk = comoAluno()) =>
  chamar(`/progresso/atividades/${atividade._id}/iniciar`, {
    metodo: "POST",
    tokenAcesso: tk,
  });
const responder = (respostas, atividade = d.atividade1, tk = comoAluno()) =>
  chamar(`/progresso/atividades/${atividade._id}/respostas`, {
    metodo: "PUT",
    tokenAcesso: tk,
    corpo: { respostas },
  });
const concluir = (atividade = d.atividade1, tk = comoAluno()) =>
  chamar(`/progresso/atividades/${atividade._id}/concluir`, {
    metodo: "PATCH",
    tokenAcesso: tk,
  });
const historicoAluno = (atividade = d.atividade1, tk = comoAluno()) =>
  chamar(`/progresso/atividades/${atividade._id}/tentativas`, {
    tokenAcesso: tk,
  });
const historicoProfessor = (
  aluno = d.alunoA,
  tk = comoProfessor(),
  query = "",
) =>
  chamar(`/desempenho/alunos/${aluno._id}/tentativas${query}`, {
    tokenAcesso: tk,
  });

// Respostas certas/erradas da atividade 1 (duas questões).
const respostasCertas = () =>
  d.atividade1.questoes.map((questao) => ({
    questaoId: String(questao._id),
    alternativasSelecionadas: [String(questao.respostasCorretas[0])],
  }));
const respostasErradas = () =>
  d.atividade1.questoes.map((questao) => ({
    questaoId: String(questao._id),
    alternativasSelecionadas: [
      String(
        questao.alternativas.find(
          (alt) => String(alt._id) !== String(questao.respostasCorretas[0]),
        )._id,
      ),
    ],
  }));

async function jogarCompleta(respostas, atividade = d.atividade1) {
  const inicio = await iniciar(atividade);
  assert.ok([200, 201].includes(inicio.status), JSON.stringify(inicio.corpo));
  assert.equal((await responder(respostas, atividade)).status, 200);
  const fim = await concluir(atividade);
  assert.equal(fim.status, 200, JSON.stringify(fim.corpo));
  return { inicio: inicio.corpo, fim: fim.corpo };
}

function questao(enunciado, certa, errada) {
  const idCerta = new ObjectId();
  return {
    _id: new ObjectId(),
    tipo: "multipla_escolha",
    enunciado,
    pontos: 5,
    alternativas: [
      { _id: idCerta, texto: certa },
      { _id: new ObjectId(), texto: errada },
    ],
    respostasCorretas: [idCerta],
  };
}

async function semear() {
  const escola = await Escola.create({
    nome: "Escola Tentativas",
    codigoPermanente: "TENT-ESCOLA",
    municipio: "Registro",
    endereco: "Rua Teste, 1",
    email: "escola@tentativas.example",
    contato: "(00) 0000-0000",
  });
  const [professorA, professorB] = await Professor.create([
    {
      nome: "Professora A",
      email: "a@tentativas.example",
      senha: "hash-nao-usado-nos-testes",
      escolas: [escola._id],
    },
    {
      nome: "Professor B",
      email: "b@tentativas.example",
      senha: "hash-nao-usado-nos-testes",
      escolas: [escola._id],
    },
  ]);
  const turmaBase = {
    periodo: "Manhã",
    mascote: "sarue",
    anoEscolar: new Date().getFullYear(),
    escola: escola._id,
    senhaAcessoHash: "hash-nao-usado-nos-testes",
  };
  const [turmaA, turmaB] = await Turma.create([
    {
      ...turmaBase,
      nome: "Turma A",
      codigoPermanente: "TENT-A",
      professorResponsavel: professorA._id,
    },
    {
      ...turmaBase,
      nome: "Turma B",
      codigoPermanente: "TENT-B",
      professorResponsavel: professorB._id,
    },
  ]);
  const [alunoA, alunoA2, alunoB] = await Aluno.create([
    { ra: "0000000000001", nomeCompleto: "Ana Teste", turma: turmaA._id },
    { ra: "0000000000002", nomeCompleto: "Beto Teste", turma: turmaA._id },
    { ra: "0000000000003", nomeCompleto: "Caio Teste", turma: turmaB._id },
  ]);
  const base = {
    status: "publicada",
    publicadoEm: new Date(),
    missao: { etapas: ["ler_texto", "responder_perguntas"] },
    historia: { tipo: "propria", texto: "Uma história curta." },
  };
  const [atividade1, atividade2, atividadeB] = await Atividade.create([
    {
      ...base,
      professorCriador: professorA._id,
      turma: turmaA._id,
      titulo: "Missão 1",
      ordem: 1,
      recompensaMoedas: 30,
      questoes: [
        questao("Quem passeou pelo rio?", "A capivara", "O elefante"),
        questao("Qual palavra começa com C?", "Capivara", "Rio"),
      ],
    },
    {
      ...base,
      professorCriador: professorA._id,
      turma: turmaA._id,
      titulo: "Missão 2",
      ordem: 2,
      recompensaMoedas: 15,
      questoes: [questao("Qual é vogal?", "A", "B")],
    },
    {
      ...base,
      professorCriador: professorB._id,
      turma: turmaB._id,
      titulo: "Missão da turma B",
      ordem: 1,
      recompensaMoedas: 10,
      questoes: [questao("Que som a gota faz?", "Ploc", "Miau")],
    },
  ]);
  return {
    professorA,
    professorB,
    turmaA,
    alunoA,
    alunoA2,
    alunoB,
    atividade1,
    atividade2,
    atividadeB,
  };
}

const ganhosDe = (aluno = d.alunoA) =>
  MovimentacaoMoeda.countDocuments({ aluno: aluno._id, tipo: "ganho" });
const hojeEmSaoPaulo = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(),
  );

before(async () => {
  jwtAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = segredo;
  banco = await iniciarBancoMemoria("zooly_teste_tentativas");
  servidor = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => servidor.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${servidor.address().port}/api`;
});

beforeEach(async () => {
  await banco.limpar();
  d = await semear();
});

after(async () => {
  if (servidor) await new Promise((resolve) => servidor.close(resolve));
  if (banco) await banco.encerrar();
  if (jwtAnterior === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = jwtAnterior;
});

describe("tentativas do aluno", () => {
  test("primeira tentativa concluída é a oficial, dá moedas e fica congelada no progresso", async () => {
    const inicio = await iniciar();
    assert.equal(inicio.status, 201);
    assert.equal(inicio.corpo.tentativa.numeroTentativa, 1);
    assert.equal(inicio.corpo.tentativa.status, "em_andamento");
    assert.equal(inicio.corpo.tentativa.oficial, false);
    assert.equal(inicio.corpo.tentativaRetomada, false);

    const resposta = await responder(respostasCertas());
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo.tentativa.respostas.length, 2);

    const fim = await concluir();
    assert.equal(fim.status, 200);
    assert.equal(fim.corpo.tentativa.oficial, true);
    assert.equal(fim.corpo.tentativa.status, "concluida");
    assert.equal(fim.corpo.movimentacao.quantidade, 30);
    assert.equal(fim.corpo.saldo, 30);
    assert.equal(fim.corpo.progresso.status, "concluida");
    assert.equal(
      String(fim.corpo.progresso.tentativaOficial),
      String(fim.corpo.tentativa.id),
    );
    assert.deepEqual(
      fim.corpo.progresso.respostas.map((r) => r.alternativasSelecionadas),
      respostasCertas().map((r) => r.alternativasSelecionadas),
    );
  });

  test("segunda e terceira tentativas preservam as anteriores e não mudam desempenho nem moedas", async () => {
    await jogarCompleta(respostasCertas());
    const progressoOficial = await ProgressoAtividade.findOne({
      aluno: d.alunoA._id,
    }).lean();
    const desempenhoAntes = await historicoDesempenho();
    const semanalAntes = await relatorioSemanal();
    assert.equal(desempenhoAntes.indicadores.percentualAcerto, 100);

    const segunda = await jogarCompleta(respostasErradas());
    assert.equal(segunda.inicio.tentativa.numeroTentativa, 2);
    assert.equal(segunda.fim.tentativa.oficial, false);
    assert.equal(segunda.fim.movimentacao, null);
    assert.equal(segunda.fim.saldo, 30);

    const terceira = await jogarCompleta([respostasErradas()[0]]);
    assert.equal(terceira.fim.tentativa.numeroTentativa, 3);
    assert.equal(terceira.fim.movimentacao, null);
    assert.equal(await ganhosDe(), 1);

    // Respostas de cada tentativa preservadas, sem sobrescrita.
    const historico = await historicoAluno();
    assert.equal(historico.status, 200);
    assert.equal(historico.corpo.totalTentativas, 3);
    const [t1, t2, t3] = historico.corpo.tentativas;
    assert.deepEqual(
      [t1.oficial, t2.oficial, t3.oficial],
      [true, false, false],
    );
    assert.deepEqual(
      t1.respostas.map((r) => r.alternativasSelecionadas),
      respostasCertas().map((r) => r.alternativasSelecionadas),
    );
    assert.deepEqual(
      t2.respostas.map((r) => r.alternativasSelecionadas),
      respostasErradas().map((r) => r.alternativasSelecionadas),
    );
    assert.equal(t3.respostas.length, 1);
    assert.equal(String(historico.corpo.tentativaOficial), String(t1.id));

    // O progresso (base do desempenho) continua igual ao da tentativa oficial.
    const progressoDepois = await ProgressoAtividade.findOne({
      aluno: d.alunoA._id,
    }).lean();
    assert.deepEqual(progressoDepois.respostas, progressoOficial.respostas);
    assert.equal(
      progressoDepois.respostasRegistradasEm.getTime(),
      progressoOficial.respostasRegistradasEm.getTime(),
    );
    assert.equal(
      progressoDepois.concluidaEm.getTime(),
      progressoOficial.concluidaEm.getTime(),
    );
    assert.deepEqual(await historicoDesempenho(), desempenhoAntes);
    assert.deepEqual(await relatorioSemanal(), semanalAntes);
  });

  test("tentativa em andamento é retomada com as respostas já enviadas", async () => {
    const primeira = await iniciar();
    await responder([respostasCertas()[0]]);
    const retomada = await iniciar();
    assert.equal(retomada.status, 200);
    assert.equal(retomada.corpo.tentativaRetomada, true);
    assert.equal(retomada.corpo.tentativa.id, primeira.corpo.tentativa.id);
    assert.equal(retomada.corpo.tentativa.respostas.length, 1);

    // Depois da conclusão, a próxima abertura é uma nova tentativa (repetição).
    await concluir();
    const repeticao = await iniciar();
    assert.equal(repeticao.corpo.tentativaRetomada, false);
    assert.equal(repeticao.corpo.tentativa.numeroTentativa, 2);
    const retomadaRepeticao = await iniciar();
    assert.equal(
      retomadaRepeticao.corpo.tentativa.id,
      repeticao.corpo.tentativa.id,
    );
    assert.equal(await TentativaAtividade.countDocuments(), 2);
  });

  test("aberturas simultâneas criam uma única tentativa em andamento", async () => {
    const respostas = await Promise.all(
      Array.from({ length: 6 }, () => iniciar()),
    );
    assert.ok(respostas.every((r) => [200, 201].includes(r.status)));
    assert.equal(new Set(respostas.map((r) => r.corpo.tentativa.id)).size, 1);
    assert.equal(await ProgressoAtividade.countDocuments(), 1);
    assert.equal(await TentativaAtividade.countDocuments(), 1);

    await responder(respostasCertas());
    await concluir();
    const repeticoes = await Promise.all(
      Array.from({ length: 6 }, () => iniciar()),
    );
    assert.equal(new Set(repeticoes.map((r) => r.corpo.tentativa.id)).size, 1);
    assert.equal(
      await TentativaAtividade.countDocuments({ status: "em_andamento" }),
      1,
    );
    assert.equal(await TentativaAtividade.countDocuments(), 2);
  });

  test("conclusões simultâneas e repetidas geram uma única oficial e uma única recompensa", async () => {
    await iniciar();
    await responder(respostasCertas());
    const conclusoes = await Promise.all(
      Array.from({ length: 6 }, () => concluir()),
    );
    assert.ok(conclusoes.every((r) => r.status === 200));
    assert.equal(
      conclusoes.filter((r) => r.corpo.movimentacao !== null).length,
      1,
    );
    assert.equal(await ganhosDe(), 1);
    assert.equal(await TentativaAtividade.countDocuments({ oficial: true }), 1);

    // Requisição duplicada depois do fim: idempotente.
    const duplicada = await concluir();
    assert.equal(duplicada.status, 200);
    assert.equal(duplicada.corpo.movimentacao, null);
    assert.equal(duplicada.corpo.saldo, 30);
    assert.equal(duplicada.corpo.tentativa.numeroTentativa, 1);

    // Repetição concluída em paralelo também não gera moedas nem nova oficial.
    await iniciar();
    await Promise.all(Array.from({ length: 4 }, () => concluir()));
    assert.equal(await ganhosDe(), 1);
    assert.equal(await TentativaAtividade.countDocuments({ oficial: true }), 1);
    assert.equal(
      await TentativaAtividade.countDocuments({ status: "concluida" }),
      2,
    );
  });

  test("tentativa concluída não aceita respostas novas", async () => {
    await jogarCompleta(respostasCertas());
    const tardia = await responder(respostasErradas());
    assert.equal(tardia.status, 409);
    const [oficial] = (await historicoAluno()).corpo.tentativas;
    assert.deepEqual(
      oficial.respostas.map((r) => r.alternativasSelecionadas),
      respostasCertas().map((r) => r.alternativasSelecionadas),
    );
  });

  test("índices únicos barram duas tentativas abertas, números repetidos e duas oficiais", async () => {
    const progresso = await ProgressoAtividade.create({
      aluno: d.alunoA._id,
      atividade: d.atividade1._id,
    });
    const base = {
      aluno: d.alunoA._id,
      atividade: d.atividade1._id,
      progresso: progresso._id,
    };
    await TentativaAtividade.create({ ...base, numeroTentativa: 1 });
    await assert.rejects(
      TentativaAtividade.create({ ...base, numeroTentativa: 2 }),
      { code: 11000 },
    );
    await assert.rejects(
      TentativaAtividade.create({
        ...base,
        numeroTentativa: 1,
        status: "concluida",
        concluidaEm: new Date(),
      }),
      { code: 11000 },
    );
    const concluida = { ...base, status: "concluida", concluidaEm: new Date() };
    await TentativaAtividade.create({
      ...concluida,
      numeroTentativa: 3,
      oficial: true,
    });
    await assert.rejects(
      TentativaAtividade.create({
        ...concluida,
        numeroTentativa: 4,
        oficial: true,
      }),
      { code: 11000 },
    );
    await assert.rejects(
      TentativaAtividade.create({ ...base, numeroTentativa: 5, oficial: true }),
      { name: "ValidationError" },
    );
  });
});

describe("consulta do histórico e autorização", () => {
  test("aluno vê só o próprio histórico, sem gabarito, e não acessa outra turma", async () => {
    await jogarCompleta(respostasErradas());
    const proprio = await historicoAluno();
    assert.equal(proprio.status, 200);
    const texto = JSON.stringify(proprio.corpo);
    assert.ok(!texto.includes("respostasCorretas"));
    assert.ok(!texto.includes("correta"));

    // A identidade vem do token: outro aluno da turma recebe o próprio histórico (vazio).
    const colega = await historicoAluno(d.atividade1, comoAluno(d.alunoA2));
    assert.equal(colega.status, 200);
    assert.deepEqual(colega.corpo.tentativas, []);

    assert.equal(
      (await historicoAluno(d.atividade1, comoAluno(d.alunoB))).status,
      403,
    );
    assert.equal(
      (await historicoAluno(d.atividade1, comoProfessor())).status,
      403,
    );
    assert.equal((await historicoAluno(d.atividade1, null)).status, 401);
    assert.equal(
      (
        await chamar("/progresso/atividades/id-invalido/tentativas", {
          tokenAcesso: comoAluno(),
        })
      ).status,
      400,
    );
  });

  test("professor responsável vê tentativas com correção; outros perfis são barrados", async () => {
    await jogarCompleta(respostasCertas());
    await jogarCompleta(respostasErradas());

    const resposta = await historicoProfessor();
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo.aluno.ra, "0000000000001");
    assert.equal(resposta.corpo.atividades.length, 1);
    const [missao] = resposta.corpo.atividades;
    assert.equal(missao.atividade.titulo, "Missão 1");
    assert.equal(missao.totalTentativas, 2);
    const [oficial, repeticao] = missao.tentativas;
    assert.equal(String(missao.tentativaOficial), String(oficial.id));
    assert.equal(oficial.oficial, true);
    assert.equal(oficial.percentualAcerto, 100);
    assert.deepEqual(
      oficial.respostas.map((r) => r.correta),
      [true, true],
    );
    assert.equal(repeticao.oficial, false);
    assert.equal(repeticao.acertos, 0);
    assert.equal(repeticao.erros, 2);
    assert.equal(oficial.respostas[0].enunciado, "Quem passeou pelo rio?");

    const filtrado = await historicoProfessor(
      d.alunoA,
      comoProfessor(),
      `?atividadeId=${d.atividade2._id}`,
    );
    assert.equal(filtrado.status, 200);
    assert.deepEqual(filtrado.corpo.atividades, []);

    assert.equal(
      (await historicoProfessor(d.alunoA, comoProfessor(d.professorB))).status,
      403,
    );
    assert.equal((await historicoProfessor(d.alunoA, comoAluno())).status, 403);
    assert.equal(
      (
        await historicoProfessor(
          d.alunoA,
          comoProfessor(),
          `?atividadeId=${d.atividadeB._id}`,
        )
      ).status,
      404,
    );
    assert.equal(
      (await historicoProfessor(d.alunoA, comoProfessor(), "?atividadeId=x"))
        .status,
      400,
    );
    assert.equal(
      (await historicoProfessor({ _id: new ObjectId() })).status,
      404,
    );
  });
});

describe("compatibilidade com os endpoints existentes", () => {
  test("respostas mantêm os campos usados pelo Zooly-game e pelo Zooly-web", async () => {
    const inicio = await iniciar();
    for (const campo of ["_id", "aluno", "atividade", "status", "iniciadaEm"])
      assert.ok(campo in inicio.corpo.progresso, `iniciar: ${campo}`);

    const resposta = await responder(respostasCertas());
    assert.equal(resposta.corpo.progresso.respostas.length, 2);
    assert.ok(resposta.corpo.progresso.respostasRegistradasEm);

    const fim = await concluir();
    for (const campo of ["progresso", "movimentacao", "saldo"])
      assert.ok(campo in fim.corpo, `concluir: ${campo}`);

    const lista = await chamar("/progresso", { tokenAcesso: comoAluno() });
    assert.equal(lista.status, 200);
    for (const campo of ["atividade", "status", "concluidaEm", "updatedAt"])
      assert.ok(campo in lista.corpo.progresso[0], `GET /progresso: ${campo}`);

    const mapa = await chamar(`/progresso/turma/${d.turmaA._id}/mapa`, {
      tokenAcesso: comoAluno(),
    });
    assert.deepEqual(
      mapa.corpo.mapaMissoes.map((m) => [
        m.titulo,
        m.concluida,
        m.desbloqueada,
      ]),
      [
        ["Missão 1", true, true],
        ["Missão 2", false, true],
      ],
    );

    const individual = await chamar(
      `/progresso/atividades/${d.atividade1._id}`,
      { tokenAcesso: comoAluno() },
    );
    assert.equal(individual.corpo.progresso.status, "concluida");

    const desempenho = await chamar(`/desempenho/alunos/${d.alunoA._id}`, {
      tokenAcesso: comoProfessor(),
    });
    assert.equal(desempenho.status, 200);
    assert.equal(desempenho.corpo.indicadores.atividadesConcluidas, 1);
    assert.equal(desempenho.corpo.indicadores.respostasRegistradas, 2);
  });

  test("progresso anterior ao histórico (sem migração) é adotado como tentativa 1 oficial", async () => {
    const concluidaEm = new Date("2026-10-05T12:00:00Z");
    const respostasLegadas = respostasCertas().map((r) => ({
      questaoId: new ObjectId(r.questaoId),
      alternativasSelecionadas: r.alternativasSelecionadas.map(
        (id) => new ObjectId(id),
      ),
    }));
    await ProgressoAtividade.collection.insertOne({
      aluno: d.alunoA._id,
      atividade: d.atividade1._id,
      status: "concluida",
      iniciadaEm: new Date("2026-10-05T11:50:00Z"),
      concluidaEm,
      respostas: respostasLegadas,
      respostasRegistradasEm: concluidaEm,
    });
    await MovimentacaoMoeda.create({
      aluno: d.alunoA._id,
      tipo: "ganho",
      quantidade: 30,
      motivo: "Conclusão de atividade",
      atividade: d.atividade1._id,
    });

    const repeticao = await iniciar();
    assert.equal(repeticao.status, 200);
    assert.equal(repeticao.corpo.tentativa.numeroTentativa, 2);
    await responder(respostasErradas());
    const fim = await concluir();
    assert.equal(fim.corpo.movimentacao, null);
    assert.equal(await ganhosDe(), 1);

    const [legada] = (await historicoAluno()).corpo.tentativas;
    assert.equal(legada.oficial, true);
    assert.equal(new Date(legada.concluidaEm).getTime(), concluidaEm.getTime());
    const progresso = await ProgressoAtividade.findOne({
      aluno: d.alunoA._id,
    }).lean();
    assert.deepEqual(progresso.respostas, respostasLegadas);
    assert.equal(
      progresso.respostasRegistradasEm.getTime(),
      concluidaEm.getTime(),
    );
  });
});

describe("migração dos progressos existentes", () => {
  async function inserirLegados() {
    const respostas = respostasCertas().map((r) => ({
      questaoId: new ObjectId(r.questaoId),
      alternativasSelecionadas: r.alternativasSelecionadas.map(
        (id) => new ObjectId(id),
      ),
    }));
    const datas = {
      iniciadaEm: new Date("2026-09-01T10:00:00Z"),
      createdAt: new Date("2026-09-01T10:00:00Z"),
      updatedAt: new Date("2026-09-01T10:10:00Z"),
    };
    await ProgressoAtividade.collection.insertMany([
      {
        ...datas,
        aluno: d.alunoA._id,
        atividade: d.atividade1._id,
        status: "concluida",
        concluidaEm: new Date("2026-09-01T10:10:00Z"),
        respostas,
        respostasRegistradasEm: new Date("2026-09-01T10:09:00Z"),
      },
      {
        ...datas,
        aluno: d.alunoA2._id,
        atividade: d.atividade1._id,
        status: "iniciada",
        concluidaEm: null,
        respostas: [respostas[0]],
        respostasRegistradasEm: new Date("2026-09-01T10:05:00Z"),
      },
      {
        ...datas,
        aluno: d.alunoB._id,
        atividade: d.atividadeB._id,
        status: "iniciada",
        concluidaEm: null,
        respostas: [],
        respostasRegistradasEm: null,
      },
    ]);
    return ProgressoAtividade.find().sort({ _id: 1 }).lean();
  }

  test("simulação não grava; aplicação cria tentativas, valida e é idempotente", async () => {
    const originais = await inserirLegados();

    const simulacao = await migrarTentativas();
    assert.equal(simulacao.modo, "simulacao");
    assert.deepEqual(simulacao.tentativasACriar, {
      concluidas: 1,
      emAndamento: 2,
    });
    assert.equal(await TentativaAtividade.countDocuments(), 0);
    assert.equal((await validarTentativas()).length, 3);

    const aplicacao = await migrarTentativas({ aplicar: true });
    assert.equal(aplicacao.tentativasCriadas, 3);
    assert.equal(aplicacao.progressosVinculados, 1);
    assert.deepEqual(await validarTentativas(), []);

    const oficial = await TentativaAtividade.findOne({ oficial: true }).lean();
    assert.equal(oficial.origem, "progresso_existente");
    assert.deepEqual(oficial.respostas, originais[0].respostas);
    assert.equal(
      oficial.concluidaEm.getTime(),
      originais[0].concluidaEm.getTime(),
    );
    assert.equal(
      oficial.iniciadaEm.getTime(),
      originais[0].iniciadaEm.getTime(),
    );
    assert.equal(
      oficial.respostasRegistradasEm.getTime(),
      originais[0].respostasRegistradasEm.getTime(),
    );
    assert.equal(
      await TentativaAtividade.countDocuments({ status: "em_andamento" }),
      2,
    );

    // Progressos originais intactos (só ganham o vínculo tentativaOficial).
    const depois = await ProgressoAtividade.find().sort({ _id: 1 }).lean();
    depois.forEach((progresso, indice) => {
      const { tentativaOficial, ...resto } = progresso;
      assert.deepEqual(resto, originais[indice]);
      assert.equal(
        String(tentativaOficial ?? null),
        indice === 0 ? String(oficial._id) : "null",
      );
    });

    const segunda = await migrarTentativas({ aplicar: true });
    assert.equal(segunda.tentativasCriadas, 0);
    assert.equal(segunda.jaComHistorico, 3);
    assert.equal(await TentativaAtividade.countDocuments(), 3);

    // O aluno retoma a tentativa migrada e o desempenho continua coerente.
    const retomada = await iniciar(d.atividade1, comoAluno(d.alunoA2));
    assert.equal(retomada.corpo.tentativaRetomada, true);
    assert.equal(retomada.corpo.tentativa.respostas.length, 1);
  });

  test("reversão remove só as tentativas migradas e preserva os progressos", async () => {
    const originais = await inserirLegados();
    await migrarTentativas({ aplicar: true });
    // Uma tentativa nova do jogo depois da migração não é removida.
    await jogarCompleta(respostasErradas());

    const simulacao = await reverterMigracaoTentativas();
    assert.equal(simulacao.tentativasARemover, 3);
    assert.equal(simulacao.tentativasDoJogoMantidas, 1);
    assert.equal(await TentativaAtividade.countDocuments(), 4);

    const reversao = await reverterMigracaoTentativas({ aplicar: true });
    assert.equal(reversao.tentativasRemovidas, 3);
    assert.equal(reversao.vinculosRemovidos, 1);
    assert.equal(await TentativaAtividade.countDocuments(), 1);

    const depois = await ProgressoAtividade.find().sort({ _id: 1 }).lean();
    for (const [indice, progresso] of depois.entries()) {
      const { tentativaOficial, ...resto } = progresso;
      assert.equal(tentativaOficial ?? null, null);
      assert.deepEqual(resto, originais[indice]);
    }
  });
});

async function historicoDesempenho() {
  const resposta = await chamar(`/desempenho/alunos/${d.alunoA._id}`, {
    tokenAcesso: comoProfessor(),
  });
  assert.equal(resposta.status, 200);
  return resposta.corpo;
}

async function relatorioSemanal() {
  const resposta = await chamar(
    `/desempenho/turmas/${d.turmaA._id}/semanal?data=${hojeEmSaoPaulo()}`,
    { tokenAcesso: comoProfessor() },
  );
  assert.equal(resposta.status, 200);
  return resposta.corpo.indicadores;
}
