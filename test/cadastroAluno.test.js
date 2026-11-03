// Cadastro do aluno no primeiro acesso (sem senha): testes de INTEGRAÇÃO com MongoDB
// em memória, passando pela API HTTP completa.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import bcrypt from "bcryptjs";
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
    ra: "RA-100",
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

test("cadastra o aluno sem senha, com cadastro concluído e sem devolver token", async () => {
  const { status, corpo } = await cadastrar({ ra: "  RA-100 " });

  assert.equal(status, 201);
  assert.equal(corpo.sucesso, true);
  assert.equal(corpo.token, undefined);
  assert.equal(corpo.aluno.ra, "RA-100");

  const aluno = await Aluno.findOne({ ra: "RA-100" }).populate("turma");
  assert.equal(aluno.nomeCompleto, "Ana Souza");
  assert.equal(aluno.sexo, "feminino");
  assert.equal(aluno.cadastroInicialConcluido, true);
  assert.equal(aluno.turma.codigoPermanente, "TURMA-CAD");
});

test("depois do cadastro, o login exige a senha da turma", async () => {
  await cadastrar();

  const semSenha = await chamar("/aluno/login", { ra: "RA-100", senha: "" });
  assert.equal(semSenha.status, 400);

  const senhaErrada = await chamar("/aluno/login", { ra: "RA-100", senha: "errada" });
  assert.equal(senhaErrada.status, 401);

  const certo = await chamar("/aluno/login", { ra: "RA-100", senha: senhaTurma });
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
  const aluno = await Aluno.findOne({ ra: "RA-100" });
  assert.equal(aluno.nomeCompleto, "Ana Souza");
});

test("recusa dados ausentes ou inválidos", async () => {
  const invalidos = [
    { ra: "" },
    { ra: 123 },
    { codigoPermanente: " " },
    { nomeCompleto: "" },
    { sexo: "outro" },
    { sexo: undefined },
  ];
  for (const dados of invalidos) {
    const { status, corpo } = await cadastrar(dados);
    assert.equal(status, 400, JSON.stringify(dados));
    assert.equal(corpo.mensagem, "Informe RA, nome completo, código da turma e sexo válido.");
  }
  assert.equal(await Aluno.countDocuments(), 0);
});
