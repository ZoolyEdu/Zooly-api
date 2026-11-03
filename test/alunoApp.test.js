import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import Aluno from "../src/models/Aluno.js";
import Atividade from "../src/models/Atividade.js";
import Historia from "../src/models/Historia.js";
import ProgressoAtividade from "../src/models/ProgressoAtividade.js";

const segredo = "segredo-local-aluno-app";
const alunoId = "507f1f77bcf86cd799439901";
const turmaId = "507f1f77bcf86cd799439902";
const outraTurmaId = "507f1f77bcf86cd799439903";
const atividadeId = "507f1f77bcf86cd799439904";
const historiaId = "507f1f77bcf86cd799439905";
const questaoId = "507f1f77bcf86cd799439906";
const altCertaId = "507f1f77bcf86cd799439907";
const altErradaId = "507f1f77bcf86cd799439908";

const originais = {
  alunoFindById: Aluno.findById,
  atividadeFindById: Atividade.findById,
  atividadeFindOne: Atividade.findOne,
  historiaFindById: Historia.findById,
  progressoFindOne: ProgressoAtividade.findOne,
};

let servidor;
let baseUrl;
let jwtAnterior;
let aluno;
let atividade;
let anterior;
let progressoAnterior;

function token(tipo = "aluno", sub = alunoId) {
  return jwt.sign({ tipo, nome: "Teste" }, segredo, {
    subject: sub,
    expiresIn: "1h",
  });
}

function get(caminho, autorizacao = token()) {
  return fetch(`${baseUrl}${caminho}`, {
    headers: autorizacao ? { Authorization: `Bearer ${autorizacao}` } : {},
  });
}

function atividadeFixture(extra = {}) {
  return {
    _id: atividadeId,
    turma: turmaId,
    titulo: "Aventura",
    ordem: 1,
    status: "publicada",
    prazo: null,
    recompensaMoedas: 10,
    professorCriador: "507f1f77bcf86cd799439909",
    missao: { etapas: ["ler_texto"] },
    historia: { tipo: "propria", texto: "Era uma vez" },
    questoes: [
      {
        _id: questaoId,
        tipo: "multipla_escolha",
        enunciado: "Qual?",
        pontos: 5,
        alternativas: [
          { _id: altCertaId, texto: "A" },
          { _id: altErradaId, texto: "B" },
        ],
        respostasCorretas: [altCertaId],
      },
    ],
    ...extra,
  };
}

before(async () => {
  jwtAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = segredo;
  servidor = app.listen(0);
  await new Promise((resolve) => servidor.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${servidor.address().port}/api`;
});

after(async () => {
  await new Promise((resolve) => servidor.close(resolve));
  if (jwtAnterior === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = jwtAnterior;
});

beforeEach(() => {
  aluno = {
    _id: alunoId,
    ra: "RA-1",
    nomeCompleto: "Ana",
    sexo: "feminino",
    turma: turmaId,
    cadastroInicialConcluido: true,
    avatarSelecionado: "avatar-01",
  };
  atividade = atividadeFixture();
  anterior = null;
  progressoAnterior = null;

  Aluno.findById = () => ({
    select() {
      return this;
    },
    populate: async () =>
      aluno && {
        ...aluno,
        turma: {
          _id: turmaId,
          nome: "1º Ano",
          periodo: "Manhã",
          mascote: "sarue",
          senhaAcessoHash: "nao-deve-sair",
        },
      },
    then(resolve, reject) {
      return Promise.resolve(aluno).then(resolve, reject);
    },
  });
  Atividade.findById = async () => atividade;
  Atividade.findOne = async () => anterior;
  Historia.findById = async () => ({
    titulo: "História oficial",
    conteudo: "Texto oficial",
  });
  ProgressoAtividade.findOne = async () => progressoAnterior;
});

afterEach(() => {
  Aluno.findById = originais.alunoFindById;
  Atividade.findById = originais.atividadeFindById;
  Atividade.findOne = originais.atividadeFindOne;
  Historia.findById = originais.historiaFindById;
  ProgressoAtividade.findOne = originais.progressoFindOne;
});

test("GET /alunos/me devolve o perfil do token com a turma, sem dados internos", async () => {
  const resposta = await get("/alunos/me");
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.equal(corpo.aluno.ra, "RA-1");
  assert.equal(corpo.aluno.avatarSelecionado, "avatar-01");
  assert.deepEqual(corpo.aluno.turma, {
    id: turmaId,
    nome: "1º Ano",
    periodo: "Manhã",
    mascote: "sarue",
  });
  assert.equal(JSON.stringify(corpo).includes("senhaAcessoHash"), false);
});

test("GET /alunos/me exige token de aluno", async () => {
  assert.equal((await get("/alunos/me", null)).status, 401);
  assert.equal((await get("/alunos/me", token("professor"))).status, 403);
});

test("GET /alunos/me responde 401 quando o aluno não existe mais", async () => {
  aluno = null;
  assert.equal((await get("/alunos/me")).status, 401);
});

test("conteúdo traz questões e história, sem o gabarito", async () => {
  const resposta = await get(`/progresso/atividades/${atividadeId}/conteudo`);
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.equal(corpo.atividade.titulo, "Aventura");
  assert.equal(corpo.atividade.historia.texto, "Era uma vez");
  assert.deepEqual(corpo.atividade.etapasMissao, ["ler_texto"]);
  assert.deepEqual(corpo.atividade.questoes[0].alternativas, [
    { id: altCertaId, texto: "A" },
    { id: altErradaId, texto: "B" },
  ]);
  assert.equal(JSON.stringify(corpo).includes("respostasCorretas"), false);
  assert.equal(JSON.stringify(corpo).includes("professorCriador"), false);
});

test("conteúdo usa o texto da história oficial", async () => {
  atividade = atividadeFixture({ historia: { tipo: "oficial", historiaId } });
  const corpo = await (
    await get(`/progresso/atividades/${atividadeId}/conteudo`)
  ).json();
  assert.deepEqual(corpo.atividade.historia, {
    titulo: "História oficial",
    texto: "Texto oficial",
  });
});

test("conteúdo de rascunho responde 404", async () => {
  atividade = atividadeFixture({ status: "rascunho" });
  assert.equal(
    (await get(`/progresso/atividades/${atividadeId}/conteudo`)).status,
    404,
  );
});

test("conteúdo de outra turma responde 403", async () => {
  atividade = atividadeFixture({ turma: outraTurmaId });
  assert.equal(
    (await get(`/progresso/atividades/${atividadeId}/conteudo`)).status,
    403,
  );
});

test("conteúdo respeita o desbloqueio sequencial", async () => {
  atividade = atividadeFixture({ ordem: 2 });
  anterior = { _id: "507f1f77bcf86cd799439910" };
  assert.equal(
    (await get(`/progresso/atividades/${atividadeId}/conteudo`)).status,
    403,
  );

  progressoAnterior = { status: "concluida" };
  assert.equal(
    (await get(`/progresso/atividades/${atividadeId}/conteudo`)).status,
    200,
  );
});

test("conteúdo é exclusivo do perfil aluno e valida o ID", async () => {
  assert.equal(
    (
      await get(
        `/progresso/atividades/${atividadeId}/conteudo`,
        token("professor"),
      )
    ).status,
    403,
  );
  assert.equal(
    (await get("/progresso/atividades/nao-e-id/conteudo")).status,
    400,
  );
});

test("RA que não é texto nem número é recusado", async () => {
  const professor = token("professor", "507f1f77bcf86cd799439911");
  for (const [metodo, caminho] of [
    ["POST", "/alunos"],
    ["PUT", `/alunos/${alunoId}`],
  ]) {
    const resposta = await fetch(`${baseUrl}${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${professor}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ra: { $ne: null }, turmaId }),
    });
    assert.equal(resposta.status, 400);
  }
});

test("JSON malformado responde 400 com mensagem clara e sem cabeçalho x-powered-by", async () => {
  const resposta = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ invalido",
  });
  const corpo = await resposta.json();
  assert.equal(resposta.status, 400);
  assert.equal(corpo.mensagem, "O corpo da requisição não é um JSON válido.");
  assert.equal(resposta.headers.get("x-powered-by"), null);
});
