import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import app from "../src/app.js";
import Escola from "../src/models/Escola.js";
import Professor from "../src/models/Professor.js";

const segredo = "segredo-local-limite-tentativas";
const originais = {
  findOne: Professor.findOne,
  escolaFindOne: Escola.findOne,
  escolaCreate: Escola.create,
};

let servidor;
let baseUrl;
let jwtAnterior;

function login(email, senha = "senha-errada") {
  return fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha }),
  });
}

before(async () => {
  jwtAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = segredo;
  Professor.findOne = () => ({ select: async () => null });
  servidor = app.listen(0);
  await new Promise((resolve) => servidor.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${servidor.address().port}/api`;
});

after(async () => {
  Professor.findOne = originais.findOne;
  Escola.findOne = originais.escolaFindOne;
  Escola.create = originais.escolaCreate;
  await new Promise((resolve) => servidor.close(resolve));
  if (jwtAnterior === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = jwtAnterior;
});

test("login: bloqueia a conta após 10 senhas erradas, sem afetar outra conta", async () => {
  for (let i = 0; i < 10; i += 1) {
    assert.equal((await login("alvo@example.test")).status, 401);
  }

  const bloqueado = await login("alvo@example.test");
  const corpo = await bloqueado.json();
  assert.equal(bloqueado.status, 429);
  assert.match(corpo.mensagem, /Muitas tentativas/);

  assert.equal((await login("ALVO@example.test ")).status, 429);
  assert.equal((await login("outra@example.test")).status, 401);
});

test("login: erro de validação não consome tentativas", async () => {
  for (let i = 0; i < 15; i += 1) {
    assert.equal((await login("validacao@example.test", "")).status, 400);
  }
  assert.equal((await login("validacao@example.test")).status, 401);
});

test("login: origem é bloqueada ao testar muitas contas diferentes", async () => {
  let ultimo;
  for (let i = 0; i < 105; i += 1) {
    ultimo = (await login(`conta${i}@example.test`)).status;
  }
  assert.equal(ultimo, 429);
});

test("cadastro público: bloqueia tentativas repetidas de código de escola", async () => {
  Escola.findOne = async () => null;
  const tentar = () =>
    fetch(`${baseUrl}/professores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: "A",
        email: "a@example.test",
        senha: "senha-segura",
        codigoPermanente: "CHUTE",
      }),
    });
  for (let i = 0; i < 20; i += 1) assert.equal((await tentar()).status, 400);
  assert.equal((await tentar()).status, 429);
});

test("escola: campos fora da lista permitida são ignorados no cadastro", async () => {
  const { default: escolaService } =
    await import("../src/services/escolaService.js");
  let recebido;
  Escola.create = async (dados) => {
    recebido = dados;
    return dados;
  };
  await escolaService.cadastrar({
    nome: "E",
    codigoPermanente: "C",
    _id: "forjado",
    createdAt: "forjado",
  });
  assert.deepEqual(recebido, { nome: "E", codigoPermanente: "C" });
});
