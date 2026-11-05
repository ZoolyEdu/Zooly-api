// Cadastro do aluno no primeiro acesso (sem senha): testes de INTEGRAÇÃO com MongoDB
// em memória, passando pela API HTTP completa.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import Aluno from "../src/models/Aluno.js";
import Escola from "../src/models/Escola.js";
import Professor from "../src/models/Professor.js";
import Turma from "../src/models/Turma.js";
import { iniciarBancoMemoria } from "./apoio/bancoMemoria.js";

const segredo = "segredo-somente-teste-cadastro-aluno";
const senhaTurma = "leao123";
let banco;
let servidor;
let baseUrl;
let jwtAnterior;

async function chamar(caminho, corpo) {
  const resposta = await fetch(`${baseUrl}/api/auth${caminho}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  return { status: resposta.status, corpo: await resposta.json() };
}

const cadastrar = (dados = {}) =>
  chamar("/aluno/cadastro", {
    ra: "0000987654321",
    codigoPermanente: "turma-cad",
    nomeCompleto: "Ana Souza",
    sexo: "feminino",
    ...dados,
  });

async function semear() {
  const escola = await Escola.create({
    nome: "Escola Cadastro",
    codigoPermanente: "CAD-ESCOLA",
    municipio: "Registro",
    endereco: "Rua Teste, 1",
    email: "escola@cadastro.example",
    contato: "(00) 0000-0000",
  });
  const professor = await Professor.create({
    nome: "Professora",
    email: "p@cadastro.example",
    senha: "hash-nao-usado-nos-testes",
    escolas: [escola._id],
  });
  const base = {
    periodo: "Manhã",
    mascote: "sarue",
    anoEscolar: new Date().getFullYear(),
    escola: escola._id,
    professorResponsavel: professor._id,
  };
  await Turma.create([
    {
      ...base,
      nome: "Turma Cadastro",
      codigoPermanente: "TURMA-CAD",
      senhaAcessoHash: await bcrypt.hash(senhaTurma, 4),
    },
    { ...base, nome: "Turma Sem Senha", codigoPermanente: "SEM-SENHA" },
    {
      ...base,
      nome: "Turma Arquivada",
      codigoPermanente: "ARQUIVADA",
      arquivada: true,
      senhaAcessoHash: await bcrypt.hash(senhaTurma, 4),
    },
  ]);
}

before(async () => {
  jwtAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = segredo;
  banco = await iniciarBancoMemoria("zooly-teste-cadastro-aluno");
  servidor = app.listen(0);
  await new Promise((resolve) => servidor.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${servidor.address().port}`;
});

beforeEach(async () => {
  await banco.limpar();
  await semear();
});

after(async () => {
  await new Promise((resolve) => servidor.close(resolve));
  await banco.encerrar();
  if (jwtAnterior === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = jwtAnterior;
});

test("cadastra o aluno sem senha, preserva zeros à esquerda e não devolve token", async () => {
  const { status, corpo } = await cadastrar({ ra: "0000987654321" });

  assert.equal(status, 201);
  assert.equal(corpo.sucesso, true);
  assert.equal(corpo.token, undefined);
  assert.equal(corpo.aluno.ra, "0000987654321");

  const aluno = await Aluno.findOne({ ra: "0000987654321" }).populate("turma");
  assert.equal(typeof aluno.ra, "string");
  assert.equal(aluno.nomeCompleto, "Ana Souza");
  assert.equal(aluno.sexo, "feminino");
  assert.equal(aluno.cadastroInicialConcluido, true);
  assert.equal(aluno.turma.codigoPermanente, "TURMA-CAD");
});

test("depois do cadastro, o login exige a senha da turma", async () => {
  await cadastrar();

  const semSenha = await chamar("/aluno/login", { ra: "0000987654321", senha: "" });
  assert.equal(semSenha.status, 400);

  const senhaErrada = await chamar("/aluno/login", { ra: "0000987654321", senha: "errada" });
  assert.equal(senhaErrada.status, 401);

  const certo = await chamar("/aluno/login", { ra: "0000987654321", senha: senhaTurma });
  assert.equal(certo.status, 200);
  assert.ok(certo.corpo.token);
  assert.equal(certo.corpo.cadastroInicialPendente, false);
});

test("recusa código de turma inexistente ou turma arquivada", async () => {
  for (const codigoPermanente of ["NAO-EXISTE", "ARQUIVADA"]) {
    const { status, corpo } = await cadastrar({ codigoPermanente });
    assert.equal(status, 404);
    assert.equal(corpo.mensagem, "Código da turma não encontrado. Confira com sua professora.");
  }
  assert.equal(await Aluno.countDocuments(), 0);
});

test("bloqueia o cadastro em turma sem senha de acesso definida", async () => {
  const { status, corpo } = await cadastrar({ codigoPermanente: "SEM-SENHA" });
  assert.equal(status, 409);
  assert.equal(corpo.mensagem, "Peça à sua professora para liberar a turma.");
  assert.equal(await Aluno.countDocuments(), 0);
});

test("não altera um aluno que já existe com o mesmo RA", async () => {
  await cadastrar();
  const { status, corpo } = await cadastrar({ nomeCompleto: "Outro Nome", sexo: "masculino" });

  assert.equal(status, 409);
  assert.equal(corpo.mensagem, "Este RA já tem cadastro. Entre com seu RA e a senha da turma.");
  const aluno = await Aluno.findOne({ ra: "0000987654321" });
  assert.equal(aluno.nomeCompleto, "Ana Souza");
});

test("recusa dados ausentes ou inválidos", async () => {
  const invalidos = [
    { ra: "" },
    { ra: 123 },
    { ra: 1234567890123 },
    { codigoPermanente: " " },
    { nomeCompleto: "" },
    { sexo: "outro" },
    { sexo: undefined },
  ];
  for (const dados of invalidos) {
    const { status, corpo } = await cadastrar(dados);
    assert.equal(status, 400, JSON.stringify(dados));
    assert.equal(corpo.mensagem, "Informe um RA com exatamente 13 dígitos, nome completo, código da turma e sexo válido.");
  }
  assert.equal(await Aluno.countDocuments(), 0);
});

test("recusa RAs com menos ou mais de 13 dígitos e RAs com letras", async () => {
  for (const ra of ["000098765432", "00000987654321", "00009A7654321"]) {
    const { status } = await cadastrar({ ra });
    assert.equal(status, 400, ra);
  }
  assert.equal(await Aluno.countDocuments(), 0);
});

// ---------------------------------------------------------------------------
// Compatibilidade com alunos antigos (RA fora do padrão de 13 dígitos)
// ---------------------------------------------------------------------------

async function requisitar(metodo, caminho, { corpo, token } = {}) {
  const resposta = await fetch(`${baseUrl}${caminho}`, {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: resposta.status, corpo: await resposta.json() };
}

// Simula um aluno gravado antes da regra dos 13 dígitos (sem passar pelo model).
async function inserirAlunoAntigo(ra, extras = {}) {
  const turma = await Turma.findOne({ codigoPermanente: "TURMA-CAD" });
  const { insertedId } = await Aluno.collection.insertOne({
    ra,
    nomeCompleto: "Aluno Antigo",
    sexo: "nao_informado",
    turma: turma._id,
    cadastroInicialConcluido: true,
    avatarSelecionado: null,
    versaoMovimentacoesMoeda: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extras,
  });
  return insertedId;
}

test("login aceita aluno antigo com RA fora do padrão de 13 dígitos", async () => {
  await inserirAlunoAntigo("RA-ANTIGO-77");
  for (const ra of ["RA-ANTIGO-77", "  RA-ANTIGO-77  "]) {
    const { status, corpo } = await chamar("/aluno/login", { ra, senha: senhaTurma });
    assert.equal(status, 200, ra);
    assert.ok(corpo.token, ra);
  }
  assert.equal((await Aluno.findOne({}).lean()).ra, "RA-ANTIGO-77");
});

test("login com RA fora do padrão e inexistente responde 401 genérico, não 400", async () => {
  for (const ra of ["000098765432", "00000987654321", "00009A7654321"]) {
    const { status } = await chamar("/aluno/login", { ra, senha: senhaTurma });
    assert.equal(status, 401, ra);
  }
});

test("entrada na turma aceita aluno antigo e só exige 13 dígitos para criar aluno novo", async () => {
  await inserirAlunoAntigo("12345");
  const entrar = (ra) =>
    chamar("/aluno/entrar-turma", { ra, codigoPermanente: "turma-cad", senha: senhaTurma });

  const antigo = await entrar("12345");
  assert.equal(antigo.status, 200);
  assert.ok(antigo.corpo.token);

  const novoInvalido = await entrar("99999");
  assert.equal(novoInvalido.status, 400);
  assert.match(novoInvalido.corpo.mensagem, /13 dígitos/);
  assert.equal(await Aluno.countDocuments(), 1);

  const novoValido = await entrar("0000000000077");
  assert.equal(novoValido.status, 201);
  assert.equal(await Aluno.countDocuments({ ra: "0000000000077" }), 1);
});

test("aluno antigo com cadastro pendente conclui o cadastro sem alterar o RA", async () => {
  const id = await inserirAlunoAntigo("00777", {
    nomeCompleto: null,
    cadastroInicialConcluido: false,
  });
  const entrada = await chamar("/aluno/entrar-turma", {
    ra: "00777",
    codigoPermanente: "turma-cad",
    senha: senhaTurma,
  });
  assert.equal(entrada.status, 200);

  const conclusao = await requisitar("PATCH", "/api/alunos/cadastro-inicial", {
    token: entrada.corpo.token,
    corpo: { nomeCompleto: "Bia Antiga", codigoPermanente: "turma-cad", sexo: "feminino" },
  });
  assert.equal(conclusao.status, 200, JSON.stringify(conclusao.corpo));

  const salvo = await Aluno.findById(id).lean();
  assert.equal(salvo.ra, "00777");
  assert.equal(salvo.cadastroInicialConcluido, true);
  assert.equal(salvo.nomeCompleto, "Bia Antiga");
});

test("professor pode reenviar o RA antigo atual; um RA novo precisa de 13 dígitos", async () => {
  const id = await inserirAlunoAntigo("RA-77");
  const professor = await Professor.findOne({ email: "p@cadastro.example" });
  const token = jwt.sign({ tipo: "professor", nome: "Professora" }, segredo, {
    subject: String(professor._id),
    expiresIn: "5m",
  });
  const atualizar = (ra) =>
    requisitar("PUT", `/api/alunos/${id}`, { token, corpo: { ra } });

  assert.equal((await atualizar("RA-77")).status, 200);
  assert.equal((await Aluno.findById(id).lean()).ra, "RA-77");

  const invalido = await atualizar("123");
  assert.equal(invalido.status, 400);
  assert.equal((await Aluno.findById(id).lean()).ra, "RA-77");

  assert.equal((await atualizar("0000000000123")).status, 200);
  assert.equal((await Aluno.findById(id).lean()).ra, "0000000000123");
});

test("model: aluno antigo salva outros campos; criar ou trocar RA exige 13 dígitos", async () => {
  const id = await inserirAlunoAntigo("ANTIGO-1");
  const aluno = await Aluno.findById(id);
  aluno.nomeCompleto = "Nome Atualizado";
  await aluno.save();
  assert.equal((await Aluno.findById(id).lean()).ra, "ANTIGO-1");

  aluno.ra = "ABC";
  await assert.rejects(() => aluno.save(), { name: "ValidationError" });
  await assert.rejects(
    () => Aluno.create({ ra: "123", turma: aluno.turma }),
    { name: "ValidationError" },
  );
  await assert.rejects(
    () => Aluno.updateOne({ _id: id }, { ra: "XYZ" }, { runValidators: true }),
    { name: "ValidationError" },
  );
  assert.equal((await Aluno.findById(id).lean()).ra, "ANTIGO-1");
});
