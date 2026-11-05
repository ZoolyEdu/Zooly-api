// Banco de Histórias: testes de INTEGRAÇÃO com MongoDB real em memória (replica set),
// passando pela API HTTP completa (seed, CRUD, autorização, atividades, gabarito e tentativas).
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import app from "../src/app.js";
import { HISTORIAS_INICIAIS } from "../src/config/historiasIniciais.js";
import Aluno from "../src/models/Aluno.js";
import Atividade from "../src/models/Atividade.js";
import Escola from "../src/models/Escola.js";
import Historia from "../src/models/Historia.js";
import MovimentacaoMoeda from "../src/models/MovimentacaoMoeda.js";
import Professor from "../src/models/Professor.js";
import ProgressoAtividade from "../src/models/ProgressoAtividade.js";
import TentativaAtividade from "../src/models/TentativaAtividade.js";
import Turma from "../src/models/Turma.js";
import { validarEntradaHistoria } from "../src/services/historiaService.js";
import { semearHistoriasIniciais } from "../src/services/seedHistorias.js";
import { iniciarBancoMemoria } from "./apoio/bancoMemoria.js";

const segredo = "segredo-somente-teste-banco-historias";
const { ObjectId } = mongoose.Types;
let banco;
let servidor;
let baseUrl;
let jwtAnterior;
let d;

const token = (tipo, id) =>
  jwt.sign({ tipo, nome: "Teste" }, segredo, {
    subject: String(id),
    expiresIn: "5m",
  });
const profA = () => token("professor", d.professorA._id);
const profB = () => token("professor", d.professorB._id);
const aluno = () => token("aluno", d.aluno._id);

async function chamar(caminho, { metodo = "GET", tk, corpo } = {}) {
  const resposta = await fetch(`${baseUrl}${caminho}`, {
    method: metodo,
    headers: {
      ...(tk ? { Authorization: `Bearer ${tk}` } : {}),
      ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
  });
  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto ? JSON.parse(texto) : null };
}

const historiaValida = (extra = {}) => ({
  titulo: "A tartaruga da ilha",
  descricao: "Uma tartaruga volta para a praia onde nasceu.",
  conteudo:
    "A tartaruga Tita nadou muito, muito longe. Um dia, voltou para a praia onde nasceu e encontrou tudo limpinho.",
  tema: "Animais do mar",
  faixaEtaria: { minima: 5, maxima: 7 },
  objetivosPedagogicos: ["Conhecer o ciclo de vida das tartarugas."],
  perguntas: [
    {
      enunciado: "Para onde Tita voltou?",
      alternativas: [
        { texto: "Para a praia onde nasceu" },
        { texto: "Para a montanha" },
        { texto: "Para a cidade" },
      ],
      alternativaCorreta: 0,
      feedback: "Isso! Tita voltou para a praia onde nasceu.",
      objetivoPedagogico: "Localizar informação no texto.",
    },
    {
      enunciado: "Como estava a praia?",
      alternativas: [{ texto: "Suja" }, { texto: "Limpinha" }],
      alternativaCorreta: 1,
    },
  ],
  ...extra,
});

const criarHistoria = (corpo = historiaValida(), tk = profA()) =>
  chamar("/historias", { metodo: "POST", tk, corpo });

async function criarAtividade(corpo, tk = profA()) {
  const resposta = await chamar("/atividades", {
    metodo: "POST",
    tk,
    corpo: { turma: String(d.turma._id), recompensaMoedas: 20, ...corpo },
  });
  assert.equal(resposta.status, 201, JSON.stringify(resposta.corpo));
  return resposta.corpo.atividade;
}

async function publicar(atividadeId) {
  const resposta = await chamar(`/atividades/${atividadeId}/publicar`, {
    metodo: "PATCH",
    tk: profA(),
  });
  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
}

async function semear() {
  const escola = await Escola.create({
    nome: "Escola Banco",
    codigoPermanente: "BANCO-ESCOLA",
    municipio: "Registro",
    endereco: "Rua Teste, 1",
    email: "escola@banco.example",
    contato: "(00) 0000-0000",
  });
  const [professorA, professorB] = await Professor.create([
    {
      nome: "Professora A",
      email: "a@banco.example",
      senha: "hash-nao-usado",
      escolas: [escola._id],
    },
    {
      nome: "Professor B",
      email: "b@banco.example",
      senha: "hash-nao-usado",
      escolas: [escola._id],
    },
  ]);
  const turma = await Turma.create({
    nome: "Turma Banco",
    codigoPermanente: "BANCO-A",
    periodo: "Manhã",
    mascote: "sarue",
    anoEscolar: new Date().getFullYear(),
    escola: escola._id,
    professorResponsavel: professorA._id,
    senhaAcessoHash: "hash-nao-usado",
  });
  const alunoDoc = await Aluno.create({
    ra: "0000000000001",
    nomeCompleto: "Rita Teste",
    turma: turma._id,
  });
  return { professorA, professorB, turma, aluno: alunoDoc };
}

before(async () => {
  jwtAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = segredo;
  banco = await iniciarBancoMemoria("zooly_teste_banco_historias");
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

describe("histórias iniciais e seed", () => {
  test("o conteúdo inicial tem 6 histórias e 30 perguntas completas e distintas", () => {
    assert.equal(HISTORIAS_INICIAIS.length, 6);
    const enunciados = new Set();
    for (const historia of HISTORIAS_INICIAIS) {
      assert.match(historia.nota, /[Aa]dapta/);
      assert.ok(historia.objetivosPedagogicos.length >= 2, historia.chave);
      assert.equal(historia.perguntas.length, 5, historia.chave);
      for (const pergunta of historia.perguntas) {
        assert.equal(pergunta.alternativas.length, 4, pergunta.enunciado);
        assert.ok(
          pergunta.alternativaCorreta >= 0 && pergunta.alternativaCorreta < 4,
        );
        assert.ok(pergunta.feedback.length > 10, pergunta.enunciado);
        assert.ok(pergunta.objetivoPedagogico.length > 10, pergunta.enunciado);
        enunciados.add(pergunta.enunciado);
      }
      // O mesmo validador usado para histórias de professores aceita o conteúdo inicial.
      const { chave: _c, _id: _i, nota, ...entrada } = historia;
      assert.deepEqual(validarEntradaHistoria({ ...entrada, nota }).erros, []);
    }
    assert.equal(enunciados.size, 30, "perguntas não podem se repetir");
  });

  test("seed simula sem gravar, cadastra as 6 histórias e é idempotente", async () => {
    const simulacao = await semearHistoriasIniciais();
    assert.equal(simulacao.aCriar.length, 6);
    assert.equal(await Historia.countDocuments(), 0);

    const primeira = await semearHistoriasIniciais({ aplicar: true });
    assert.equal(primeira.criadas.length, 6);
    const segunda = await semearHistoriasIniciais({ aplicar: true });
    assert.equal(segunda.criadas.length, 0);
    assert.equal(segunda.existentes.length, 6);
    assert.equal(await Historia.countDocuments(), 6);

    const salvas = await Historia.find().lean();
    assert.equal(
      salvas.reduce((total, h) => total + h.perguntas.length, 0),
      30,
    );
    assert.ok(
      salvas.every((h) => h.origem === "zooly" && h.professor === null),
    );
    assert.deepEqual(
      salvas.map((h) => String(h._id)).sort(),
      HISTORIAS_INICIAIS.map((h) => h._id).sort(),
    );
  });

  test("seed não sobrescreve alterações nem toca em histórias de professores", async () => {
    await semearHistoriasIniciais({ aplicar: true });
    const propria = await criarHistoria();
    await Historia.updateOne(
      { _id: HISTORIAS_INICIAIS[0]._id },
      { $set: { conteudo: "Texto revisado pela equipe." } },
    );

    const relatorio = await semearHistoriasIniciais({ aplicar: true });
    assert.deepEqual(relatorio.divergentes, [HISTORIAS_INICIAIS[0].chave]);
    assert.equal(
      (await Historia.findById(HISTORIAS_INICIAIS[0]._id)).conteudo,
      "Texto revisado pela equipe.",
    );
    assert.ok(await Historia.findById(propria.corpo.historia._id));
    assert.equal(await Historia.countDocuments(), 7);
  });
});

describe("Banco de Histórias: listagem, cadastro e autorização", () => {
  beforeEach(() => semearHistoriasIniciais({ aplicar: true }));

  test("lista globais e próprias, sem as particulares de outro professor", async () => {
    // Documento antigo, sem os campos novos, continua aparecendo como global.
    await Historia.collection.insertOne({
      titulo: "História antiga",
      conteudo: "Texto antigo.",
    });
    const deA = await criarHistoria();
    await criarHistoria(historiaValida({ titulo: "Do professor B" }), profB());

    const todas = await chamar("/historias", { tk: profA() });
    assert.equal(todas.status, 200);
    assert.equal(todas.corpo.total, 8);
    assert.ok(
      !todas.corpo.historias.some((h) => h.titulo === "Do professor B"),
    );
    assert.ok(!("perguntas" in todas.corpo.historias[0]));

    const globais = await chamar("/historias?origem=zooly", { tk: profA() });
    assert.equal(globais.corpo.total, 7);
    assert.ok(globais.corpo.historias.every((h) => !h.editavel));

    const proprias = await chamar("/historias?origem=professor", {
      tk: profA(),
    });
    assert.deepEqual(
      proprias.corpo.historias.map((h) => h._id),
      [deA.corpo.historia._id],
    );
    assert.equal(proprias.corpo.historias[0].editavel, true);

    assert.equal(
      (await chamar("/historias?origem=outra", { tk: profA() })).status,
      400,
    );
  });

  test("detalhe e perguntas trazem gabarito e feedback ao professor", async () => {
    const id = HISTORIAS_INICIAIS[1]._id;
    const detalhe = await chamar(`/historias/${id}`, { tk: profA() });
    assert.equal(detalhe.status, 200);
    assert.equal(detalhe.corpo.historia.perguntas.length, 5);
    assert.equal(
      detalhe.corpo.historia.perguntas[1].alternativaCorreta,
      HISTORIAS_INICIAIS[1].perguntas[1].alternativaCorreta,
    );
    assert.ok(detalhe.corpo.historia.perguntas[0].feedback);

    const perguntas = await chamar(`/historias/${id}/perguntas`, {
      tk: profA(),
    });
    assert.equal(perguntas.status, 200);
    assert.equal(perguntas.corpo.perguntas.length, 5);
  });

  test("professor cadastra, edita, arquiva, reativa e exclui a própria história", async () => {
    const criada = await criarHistoria();
    assert.equal(criada.status, 201);
    const historia = criada.corpo.historia;
    assert.equal(historia.origem, "professor");
    assert.equal(historia.editavel, true);
    assert.equal(historia.perguntas[1].alternativaCorreta, 1);
    const salva = await Historia.findById(historia._id).lean();
    assert.equal(String(salva.professor), String(d.professorA._id));

    const editada = await chamar(`/historias/${historia._id}`, {
      metodo: "PUT",
      tk: profA(),
      corpo: historiaValida({ titulo: "A tartaruga Tita" }),
    });
    assert.equal(editada.status, 200);
    assert.equal(editada.corpo.historia.titulo, "A tartaruga Tita");

    const arquivada = await chamar(`/historias/${historia._id}/arquivar`, {
      metodo: "PATCH",
      tk: profA(),
    });
    assert.equal(arquivada.corpo.historia.status, "arquivada");
    const semArquivadas = await chamar("/historias?origem=professor", {
      tk: profA(),
    });
    assert.equal(semArquivadas.corpo.total, 0);
    const comArquivadas = await chamar(
      "/historias?origem=professor&incluirArquivadas=true",
      { tk: profA() },
    );
    assert.equal(comArquivadas.corpo.total, 1);
    await chamar(`/historias/${historia._id}/reativar`, {
      metodo: "PATCH",
      tk: profA(),
    });
    assert.equal((await Historia.findById(historia._id)).status, "ativa");

    const exclusao = await chamar(`/historias/${historia._id}`, {
      metodo: "DELETE",
      tk: profA(),
    });
    assert.equal(exclusao.status, 200);
    assert.equal(await Historia.findById(historia._id), null);
  });

  test("um professor não vê, edita, arquiva nem exclui a história particular de outro", async () => {
    const deA = (await criarHistoria()).corpo.historia;
    const caminho = `/historias/${deA._id}`;
    assert.equal((await chamar(caminho, { tk: profB() })).status, 404);
    assert.equal(
      (await chamar(`${caminho}/perguntas`, { tk: profB() })).status,
      404,
    );
    assert.equal(
      (await chamar(`${caminho}/modelo-atividade`, { tk: profB() })).status,
      404,
    );
    assert.equal(
      (
        await chamar(caminho, {
          metodo: "PUT",
          tk: profB(),
          corpo: historiaValida(),
        })
      ).status,
      404,
    );
    assert.equal(
      (await chamar(`${caminho}/arquivar`, { metodo: "PATCH", tk: profB() }))
        .status,
      404,
    );
    assert.equal(
      (await chamar(caminho, { metodo: "DELETE", tk: profB() })).status,
      404,
    );
    const intacta = await Historia.findById(deA._id);
    assert.equal(intacta.titulo, "A tartaruga da ilha");
    assert.equal(intacta.status, "ativa");
  });

  test("histórias do Zooly não podem ser alteradas por professores", async () => {
    const caminho = `/historias/${HISTORIAS_INICIAIS[0]._id}`;
    assert.equal(
      (
        await chamar(caminho, {
          metodo: "PUT",
          tk: profA(),
          corpo: historiaValida(),
        })
      ).status,
      403,
    );
    assert.equal(
      (await chamar(`${caminho}/arquivar`, { metodo: "PATCH", tk: profA() }))
        .status,
      403,
    );
    assert.equal(
      (await chamar(caminho, { metodo: "DELETE", tk: profA() })).status,
      403,
    );
    const original = await Historia.findById(HISTORIAS_INICIAIS[0]._id);
    assert.equal(original.titulo, HISTORIAS_INICIAIS[0].titulo);
    assert.equal(original.status, "ativa");
  });

  test("alunos e requisições sem token não acessam o Banco de Histórias", async () => {
    const id = HISTORIAS_INICIAIS[0]._id;
    for (const [metodo, caminho, corpo] of [
      ["GET", "/historias"],
      ["GET", `/historias/${id}`],
      ["GET", `/historias/${id}/perguntas`],
      ["GET", `/historias/${id}/modelo-atividade`],
      ["POST", "/historias", historiaValida()],
      ["POST", "/historias/validar", historiaValida()],
      ["PUT", `/historias/${id}`, historiaValida()],
      ["DELETE", `/historias/${id}`],
    ]) {
      assert.equal(
        (await chamar(caminho, { metodo, tk: aluno(), corpo })).status,
        403,
      );
      assert.equal((await chamar(caminho, { metodo, corpo })).status, 401);
    }
    assert.equal(await Historia.countDocuments({ origem: "professor" }), 0);
  });

  test("validação de perguntas e alternativas antes de salvar", async () => {
    const ok = await chamar("/historias/validar", {
      metodo: "POST",
      tk: profA(),
      corpo: historiaValida(),
    });
    assert.deepEqual(ok.corpo, { sucesso: true, valida: true, erros: [] });

    const invalida = historiaValida({
      origem: "zooly",
      professor: String(d.professorB._id),
      perguntas: [
        {
          enunciado: "",
          alternativas: [{ texto: "Só uma" }],
          alternativaCorreta: 3,
        },
        {
          enunciado: "Repetidas?",
          alternativas: [{ texto: "Sim" }, { texto: "sim" }],
          alternativaCorreta: 0,
          pontos: 10,
        },
      ],
    });
    const resultado = await chamar("/historias/validar", {
      metodo: "POST",
      tk: profA(),
      corpo: invalida,
    });
    assert.equal(resultado.corpo.valida, false);
    const campos = resultado.corpo.erros.map((erro) => erro.campo);
    for (const campo of [
      "origem",
      "professor",
      "perguntas[0].enunciado",
      "perguntas[0].alternativas",
      "perguntas[0].alternativaCorreta",
      "perguntas[1].alternativas",
      "perguntas[1].pontos",
    ])
      assert.ok(campos.includes(campo), `esperava erro em ${campo}`);

    const recusada = await criarHistoria(invalida);
    assert.equal(recusada.status, 400);
    assert.ok(recusada.corpo.erros.length > 0);
    assert.equal(await Historia.countDocuments({ origem: "professor" }), 0);
  });
});

describe("integração com atividades", () => {
  beforeEach(() => semearHistoriasIniciais({ aplicar: true }));

  test("modelo de atividade cria uma cópia independente; editar a história não muda a atividade", async () => {
    const historia = (await criarHistoria()).corpo.historia;
    const modelo = await chamar(`/historias/${historia._id}/modelo-atividade`, {
      tk: profA(),
    });
    assert.equal(modelo.status, 200);
    assert.equal(modelo.corpo.modelo.historia.tipo, "propria");
    assert.equal(
      modelo.corpo.apoioPedagogico.perguntas[0].feedback.length > 0,
      true,
    );

    // O professor revisa antes de salvar: muda o título, edita o texto e remove uma pergunta.
    const corpo = {
      ...modelo.corpo.modelo,
      titulo: "Missão da Tita",
      historia: {
        ...modelo.corpo.modelo.historia,
        texto: `${modelo.corpo.modelo.historia.texto} Fim.`,
      },
      questoes: [modelo.corpo.modelo.questoes[0]],
    };
    const atividade = await criarAtividade(corpo);
    assert.equal(atividade.titulo, "Missão da Tita");
    assert.equal(String(atividade.historia.bancoHistoriaId), historia._id);
    assert.equal(atividade.questoes.length, 1);
    const correta = atividade.questoes[0].alternativas.find(
      (a) =>
        String(a._id) === String(atividade.questoes[0].respostasCorretas[0]),
    );
    assert.equal(correta.texto, "Para a praia onde nasceu");

    await chamar(`/historias/${historia._id}`, {
      metodo: "PUT",
      tk: profA(),
      corpo: historiaValida({ conteudo: "Texto totalmente novo." }),
    });
    await chamar(`/historias/${historia._id}`, {
      metodo: "DELETE",
      tk: profA(),
    });
    const salva = await Atividade.findById(atividade._id).lean();
    assert.match(salva.historia.texto, /^A tartaruga Tita nadou/);
    assert.equal(salva.questoes[0].enunciado, "Para onde Tita voltou?");
  });

  test("história do banco escolhida por referência (tipo oficial) também é copiada", async () => {
    const historia = (await criarHistoria()).corpo.historia;
    const atividade = await criarAtividade({
      titulo: "Por referência",
      historia: { tipo: "oficial", historiaId: historia._id },
      questoes: [],
    });
    assert.equal(atividade.historia.textoCopia, historiaValida().conteudo);
    await publicar(atividade._id);

    await chamar(`/historias/${historia._id}`, {
      metodo: "PUT",
      tk: profA(),
      corpo: historiaValida({
        titulo: "Outro título",
        conteudo: "Outro texto.",
      }),
    });
    const conteudo = await chamar(
      `/progresso/atividades/${atividade._id}/conteudo`,
      {
        tk: aluno(),
      },
    );
    assert.equal(conteudo.status, 200);
    assert.equal(
      conteudo.corpo.atividade.historia.texto,
      historiaValida().conteudo,
    );
    assert.equal(
      conteudo.corpo.atividade.historia.titulo,
      "A tartaruga da ilha",
    );

    // Editar a atividade sem trocar de história mantém a cópia original.
    const edicao = await chamar(`/atividades/${atividade._id}`, {
      metodo: "PUT",
      tk: profA(),
      corpo: {
        titulo: "Por referência (editada)",
        historia: { tipo: "oficial", historiaId: historia._id },
        questoes: [],
      },
    });
    assert.equal(edicao.status, 200);
    assert.equal(
      edicao.corpo.atividade.historia.textoCopia,
      historiaValida().conteudo,
    );
  });

  test("história arquivada ou particular de outro professor não pode ser usada", async () => {
    const deB = (await criarHistoria(historiaValida(), profB())).corpo.historia;
    const resposta = await chamar("/atividades", {
      metodo: "POST",
      tk: profA(),
      corpo: {
        turma: String(d.turma._id),
        titulo: "Tentativa indevida",
        historia: { tipo: "oficial", historiaId: deB._id },
        questoes: [],
      },
    });
    assert.equal(resposta.status, 404);

    const propria = (await criarHistoria()).corpo.historia;
    await chamar(`/historias/${propria._id}/arquivar`, {
      metodo: "PATCH",
      tk: profA(),
    });
    assert.equal(
      (
        await chamar(`/historias/${propria._id}/modelo-atividade`, {
          tk: profA(),
        })
      ).status,
      409,
    );
    const comArquivada = await chamar("/atividades", {
      metodo: "POST",
      tk: profA(),
      corpo: {
        turma: String(d.turma._id),
        titulo: "Com arquivada",
        historia: { tipo: "oficial", historiaId: propria._id },
        questoes: [],
      },
    });
    assert.equal(comArquivada.status, 409);
    const forjada = await chamar("/atividades", {
      metodo: "POST",
      tk: profA(),
      corpo: {
        turma: String(d.turma._id),
        titulo: "Cópia forjada",
        historia: { tipo: "propria", texto: "Texto", textoCopia: "Forjado" },
        questoes: [],
      },
    });
    assert.equal(forjada.status, 400);
  });

  test("o aluno nunca recebe gabarito nem feedback antes de responder", async () => {
    const modelo = (
      await chamar(`/historias/${HISTORIAS_INICIAIS[4]._id}/modelo-atividade`, {
        tk: profA(),
      })
    ).corpo.modelo;
    const atividade = await criarAtividade(modelo);
    await publicar(atividade._id);

    const conteudo = await chamar(
      `/progresso/atividades/${atividade._id}/conteudo`,
      {
        tk: aluno(),
      },
    );
    assert.equal(conteudo.status, 200);
    assert.equal(conteudo.corpo.atividade.questoes.length, 5);
    const texto = JSON.stringify(conteudo.corpo);
    for (const proibido of [
      "respostasCorretas",
      "alternativaCorreta",
      "feedback",
      "objetivoPedagogico",
      HISTORIAS_INICIAIS[4].perguntas[0].feedback,
    ])
      assert.equal(texto.includes(proibido), false, proibido);
    assert.equal(
      (await chamar(`/historias/${HISTORIAS_INICIAIS[4]._id}`, { tk: aluno() }))
        .status,
      403,
    );
    assert.equal(
      (await chamar(`/atividades/${atividade._id}`, { tk: aluno() })).status,
      403,
    );
  });

  test("atividade antiga sem cópia continua funcionando e passa a ter cópia ao ser editada", async () => {
    const antiga = await Historia.collection.insertOne({
      titulo: "História oficial antiga",
      conteudo: "Era uma vez um texto antigo.",
    });
    const { insertedId } = await Atividade.collection.insertOne({
      turma: d.turma._id,
      professorCriador: d.professorA._id,
      titulo: "Atividade antiga",
      ordem: 1,
      historia: { tipo: "oficial", historiaId: antiga.insertedId },
      questoes: [],
      status: "publicada",
      publicadoEm: new Date(),
      missao: { etapas: [] },
      habilidadesBncc: [],
      pontuacaoTotal: 0,
    });

    const conteudo = await chamar(
      `/progresso/atividades/${insertedId}/conteudo`,
      {
        tk: aluno(),
      },
    );
    assert.equal(conteudo.status, 200);
    assert.equal(
      conteudo.corpo.atividade.historia.texto,
      "Era uma vez um texto antigo.",
    );

    const edicao = await chamar(`/atividades/${insertedId}`, {
      metodo: "PUT",
      tk: profA(),
      corpo: {
        titulo: "Atividade antiga",
        historia: { tipo: "oficial", historiaId: String(antiga.insertedId) },
        questoes: [],
      },
    });
    assert.equal(edicao.status, 200);
    assert.equal(
      edicao.corpo.atividade.historia.textoCopia,
      "Era uma vez um texto antigo.",
    );
  });

  test("tentativas, moedas e progresso oficial continuam iguais com atividade do banco", async () => {
    const historia = HISTORIAS_INICIAIS[0];
    const modelo = (
      await chamar(`/historias/${historia._id}/modelo-atividade`, {
        tk: profA(),
      })
    ).corpo.modelo;
    const atividade = await criarAtividade(modelo);
    await publicar(atividade._id);
    const base = `/progresso/atividades/${atividade._id}`;

    const certas = atividade.questoes.map((questao) => ({
      questaoId: String(questao._id),
      alternativasSelecionadas: [String(questao.respostasCorretas[0])],
    }));
    const erradas = atividade.questoes.map((questao) => ({
      questaoId: String(questao._id),
      alternativasSelecionadas: [
        String(
          questao.alternativas.find(
            (a) => String(a._id) !== String(questao.respostasCorretas[0]),
          )._id,
        ),
      ],
    }));
    async function jogar(respostas) {
      await chamar(`${base}/iniciar`, { metodo: "POST", tk: aluno() });
      await chamar(`${base}/respostas`, {
        metodo: "PUT",
        tk: aluno(),
        corpo: { respostas },
      });
      return (
        await chamar(`${base}/concluir`, { metodo: "PATCH", tk: aluno() })
      ).corpo;
    }

    const primeira = await jogar(certas);
    assert.equal(primeira.tentativa.oficial, true);
    assert.equal(primeira.movimentacao.quantidade, 20);
    const desempenhoAntes = (
      await chamar(`/desempenho/alunos/${d.aluno._id}`, { tk: profA() })
    ).corpo.indicadores;
    assert.equal(desempenhoAntes.percentualAcerto, 100);

    const repeticao = await jogar(erradas);
    assert.equal(repeticao.tentativa.oficial, false);
    assert.equal(repeticao.movimentacao, null);
    assert.equal(
      await MovimentacaoMoeda.countDocuments({
        aluno: d.aluno._id,
        tipo: "ganho",
      }),
      1,
    );
    assert.equal(await TentativaAtividade.countDocuments(), 2);
    const progresso = await ProgressoAtividade.findOne({
      aluno: d.aluno._id,
    }).lean();
    assert.deepEqual(
      progresso.respostas.map((r) => String(r.alternativasSelecionadas[0])),
      certas.map((r) => r.alternativasSelecionadas[0]),
    );
    assert.deepEqual(
      (await chamar(`/desempenho/alunos/${d.aluno._id}`, { tk: profA() })).corpo
        .indicadores,
      desempenhoAntes,
    );

    const historico = await chamar(
      `/desempenho/alunos/${d.aluno._id}/tentativas`,
      {
        tk: profA(),
      },
    );
    assert.deepEqual(
      historico.corpo.atividades[0].tentativas.map((t) => t.percentualAcerto),
      [100, 0],
    );
  });
});

test("ids estáveis das histórias iniciais são ObjectIds válidos e únicos", () => {
  const ids = HISTORIAS_INICIAIS.map((h) => h._id);
  assert.ok(
    ids.every((id) => ObjectId.isValid(id) && String(new ObjectId(id)) === id),
  );
  assert.equal(new Set(ids).size, 6);
  assert.equal(new Set(HISTORIAS_INICIAIS.map((h) => h.chave)).size, 6);
});
