// Scripts de dados de avaliação do PI (scripts/avaliacao/dadosAvaliacao.js):
// argumentos, preparação idempotente e remoção restrita ao que o script criou.
// Usa somente o MongoDB em memória dos testes; nenhum banco real é acessado.
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import mongoose from "mongoose";
import Aluno from "../src/models/Aluno.js";
import Atividade from "../src/models/Atividade.js";
import AvatarAluno from "../src/models/AvatarAluno.js";
import Historia from "../src/models/Historia.js";
import MovimentacaoMoeda from "../src/models/MovimentacaoMoeda.js";
import Professor from "../src/models/Professor.js";
import ProgressoAtividade from "../src/models/ProgressoAtividade.js";
import TentativaAtividade from "../src/models/TentativaAtividade.js";
import Turma from "../src/models/Turma.js";
import { semearHistoriasIniciais } from "../src/services/seedHistorias.js";
import {
  executarRemocao,
  lerArgumentos,
  planejarRemocao,
  prepararDadosAvaliacao,
} from "../scripts/avaliacao/dadosAvaliacao.js";
import { iniciarBancoMemoria } from "./apoio/bancoMemoria.js";

const modelos = {
  Aluno,
  Atividade,
  AvatarAluno,
  Historia,
  MovimentacaoMoeda,
  Professor,
  ProgressoAtividade,
  TentativaAtividade,
  Turma,
};
const { ObjectId } = mongoose.Types;
const EMAIL = "professora@exemplo.test";
const argv = (...extras) => [
  "node",
  "script.js",
  `--professor=${EMAIL}`,
  "--turma-1a=TUR-AAAAAAAAAAAA",
  "--turma-2b=TUR-BBBBBBBBBBBB",
  ...extras,
];

describe("argumentos dos scripts de avaliação", () => {
  test("exige professor e as duas turmas, sem valores padrão", () => {
    assert.throws(
      () => lerArgumentos(["node", "script.js"]),
      (erro) =>
        erro.safeMessage &&
        /--professor=<e-mail>/.test(erro.message) &&
        /--turma-1a=/.test(erro.message) &&
        /--turma-2b=/.test(erro.message),
    );
  });

  test("rejeita e-mail inválido e códigos de turma repetidos", () => {
    assert.throws(
      () => lerArgumentos(["--professor=invalido", "--turma-1a=TUR-1", "--turma-2b=tur-1"]),
      (erro) => /e-mail válido/.test(erro.message) && /diferentes/.test(erro.message),
    );
  });

  test("normaliza os valores e lê as confirmações", () => {
    const opcoes = lerArgumentos(
      ["--professor= Prof@Exemplo.Test ", "--turma-1a=tur-aaa", "--turma-2b=TUR-BBB", "--apply", "--banco=zooly", "--confirmar-remocao"],
      ["confirmar-remocao", "incluir-historico"],
    );
    assert.equal(opcoes.professor, "prof@exemplo.test");
    assert.deepEqual(opcoes.turmas.map((t) => t.codigoPermanente), ["TUR-AAA", "TUR-BBB"]);
    assert.equal(opcoes.aplicar, true);
    assert.equal(opcoes.banco, "zooly");
    assert.equal(opcoes["confirmar-remocao"], true);
    assert.equal(opcoes["incluir-historico"], false);
  });
});

describe("preparação e remoção dos dados de avaliação", () => {
  let banco;
  let d;

  before(async () => {
    banco = await iniciarBancoMemoria("zooly_teste_dados_avaliacao");
  });
  after(async () => {
    await banco?.encerrar();
  });

  beforeEach(async () => {
    await banco.limpar();
    await semearHistoriasIniciais({ aplicar: true });
    const professor = await Professor.create({ nome: "Professora", email: EMAIL, senha: "hash-fictício" });
    const escola = new ObjectId();
    const criarTurma = (codigoPermanente) =>
      Turma.create({
        nome: codigoPermanente,
        codigoPermanente,
        anoEscolar: 2026,
        escola,
        professorResponsavel: professor._id,
        senhaAcessoHash: "hash-fictício",
      });
    const turmaA = await criarTurma("TUR-AAAAAAAAAAAA");
    const turmaB = await criarTurma("TUR-BBBBBBBBBBBB");
    const alunoReal = await Aluno.create({ ra: "0000000000011", nomeCompleto: "Aluno Real", turma: turmaA._id });
    d = { professor, turmaA, turmaB, alunoReal };
  });

  const preparar = (aplicar) => prepararDadosAvaliacao(modelos, { ...lerArgumentos(argv()), aplicar });
  const planejar = (incluirHistorico = false) =>
    planejarRemocao(modelos, { ...lerArgumentos(argv()), incluirHistorico });

  test("simulação não grava nada", async () => {
    const { relatorio, problemas } = await preparar(false);
    assert.deepEqual(problemas, []);
    assert.equal(relatorio.alunos.aCriar.length, 10);
    assert.equal(relatorio.atividades.aCriar.length, 6);
    assert.equal(await Aluno.countDocuments(), 1);
    assert.equal(await Atividade.countDocuments(), 0);
  });

  test("gravação cria os dados uma única vez (idempotente)", async () => {
    const primeira = await preparar(true);
    assert.deepEqual(primeira.problemas, []);
    assert.equal(primeira.relatorio.alunos.criados.length, 10);
    assert.equal(primeira.relatorio.atividades.criadas.length, 6);

    const segunda = await preparar(true);
    assert.deepEqual(segunda.problemas, []);
    assert.equal(segunda.relatorio.alunos.criados.length, 0);
    assert.equal(segunda.relatorio.alunos.ignorados.length, 10);
    assert.equal(segunda.relatorio.atividades.ignoradas.length, 6);
    assert.equal(await Aluno.countDocuments(), 11);
    assert.equal(await Atividade.countDocuments(), 6);
  });

  test("professor ou turma desconhecidos bloqueiam a preparação", async () => {
    const { problemas } = await prepararDadosAvaliacao(modelos, {
      ...lerArgumentos(argv()),
      professor: "outra@exemplo.test",
      aplicar: true,
    });
    assert.ok(problemas.some((p) => /Professor/.test(p)));
    assert.equal(await Aluno.countDocuments(), 1);
  });

  test("remoção identifica somente o que o script criou e preserva o resto", async () => {
    await preparar(true);
    const manual = await Atividade.findOne({ turma: d.turmaA._id, ordem: 1 });
    // Atividade igual à do script, mas alterada pelo professor: deve ser preservada.
    manual.recompensaMoedas = 20;
    await manual.save();
    // RA de avaliação mudado para outra turma: não é mais "do script".
    await Aluno.updateOne({ ra: "9990000000010" }, { turma: d.turmaA._id });

    const { relatorio, problemas, ids } = await planejar();
    assert.deepEqual(problemas, []);
    assert.equal(ids.alunos.length, 9);
    assert.equal(ids.atividades.length, 5);
    assert.deepEqual(relatorio.atividades.preservadas.map((a) => a.id), [String(manual._id)]);
    assert.deepEqual(relatorio.alunos.preservados.map((a) => a.ra), ["9990000000010"]);

    const removidos = await executarRemocao(modelos, ids);
    assert.equal(removidos.Aluno, 9);
    assert.equal(removidos.Atividade, 5);
    assert.ok(await Aluno.exists({ _id: d.alunoReal._id }));
    assert.ok(await Aluno.exists({ ra: "9990000000010" }));
    assert.ok(await Atividade.exists({ _id: manual._id }));
    assert.equal(await Historia.countDocuments(), 6);
    assert.equal(await Turma.countDocuments(), 2);
  });

  test("histórico de aluno real em atividade de avaliação bloqueia a remoção", async () => {
    await preparar(true);
    const atividade = await Atividade.findOne({ turma: d.turmaA._id });
    await MovimentacaoMoeda.create({
      aluno: d.alunoReal._id,
      tipo: "ganho",
      quantidade: 10,
      motivo: "Atividade concluída",
      atividade: atividade._id,
    });
    const { problemas } = await planejar(true);
    assert.ok(problemas.some((p) => /histórico real/.test(p)));
  });

  test("histórico dos alunos de avaliação exige --incluir-historico", async () => {
    await preparar(true);
    const alunoAval = await Aluno.findOne({ ra: "9990000000001" });
    await AvatarAluno.create({ aluno: alunoAval._id, avatarId: "papagaio" });

    const semFlag = await planejar(false);
    assert.ok(semFlag.problemas.some((p) => /--incluir-historico/.test(p)));

    const comFlag = await planejar(true);
    assert.deepEqual(comFlag.problemas, []);
    const removidos = await executarRemocao(modelos, comFlag.ids);
    assert.equal(removidos.AvatarAluno, 1);
    assert.equal(await AvatarAluno.countDocuments(), 0);
  });

  test("atividade posterior às de avaliação bloqueia a remoção", async () => {
    await preparar(true);
    const ultima = await Atividade.findOne({ turma: d.turmaB._id }).sort({ ordem: -1 }).lean();
    const { _id, createdAt, updatedAt, __v, ...copia } = ultima;
    await Atividade.create({ ...copia, titulo: "Atividade do professor", ordem: ultima.ordem + 1 });
    const { problemas } = await planejar();
    assert.ok(problemas.some((p) => /buraco na sequência/.test(p)));
  });

  test("a transação não remove nada se a contagem divergir", async () => {
    await preparar(true);
    const { ids } = await planejar();
    ids.alunos.push(new ObjectId());
    await assert.rejects(() => executarRemocao(modelos, ids), /Nada foi removido/);
    assert.equal(await Aluno.countDocuments(), 11);
    assert.equal(await Atividade.countDocuments(), 6);
  });
});
