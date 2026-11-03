import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import mongoose from "mongoose";
import { validarAmbienteBanco } from "../src/config/ambienteBanco.js";
import { connectDatabase } from "../src/config/database.js";

const nomes = ["MONGODB_URI", "MONGODB_DB_NAME", "ZOOLY_AMBIENTE"];
let originais;
let connectOriginal;
let logOriginal;

beforeEach(() => {
  originais = Object.fromEntries(
    nomes.map((nome) => [nome, process.env[nome]]),
  );
  connectOriginal = mongoose.connect;
  logOriginal = console.log;
  console.log = () => {};
  for (const nome of nomes) delete process.env[nome];
  process.env.MONGODB_URI = "mongodb://localhost/qualquer";
});

afterEach(() => {
  for (const nome of nomes) {
    if (originais[nome] === undefined) delete process.env[nome];
    else process.env[nome] = originais[nome];
  }
  mongoose.connect = connectOriginal;
  console.log = logOriginal;
});

// O modo demonstração foi removido da API: estes testes garantem que nenhuma configuração
// antiga do demo consiga ser usada (dados fictícios nunca aparecem como reais).

test("banco real sem ambiente definido é aceito", () => {
  assert.doesNotThrow(() => validarAmbienteBanco("zooly", undefined));
  assert.doesNotThrow(() => validarAmbienteBanco("zooly_test", undefined));
});

test("ZOOLY_AMBIENTE=demo é recusado com qualquer banco, inclusive o antigo zooly_demo", () => {
  for (const banco of ["zooly", "zooly_demo", "test"]) {
    assert.throws(() => validarAmbienteBanco(banco, "demo"), {
      code: "AMBIENTE_BANCO_INVALIDO",
      message: /modo demonstração foi removido/,
    });
  }
});

test("o banco do antigo modo demo é recusado, em qualquer caixa", () => {
  for (const banco of ["zooly_demo", "ZOOLY_DEMO", "Zooly_Demo"]) {
    assert.throws(() => validarAmbienteBanco(banco, undefined), {
      code: "AMBIENTE_BANCO_INVALIDO",
    });
  }
});

test("qualquer valor de ZOOLY_AMBIENTE é recusado", () => {
  assert.throws(() => validarAmbienteBanco("zooly", "producao"), {
    code: "AMBIENTE_BANCO_INVALIDO",
  });
});

test("configuração antiga do demo não chega a conectar", async () => {
  let tentativas = 0;
  mongoose.connect = async () => {
    tentativas += 1;
  };
  process.env.ZOOLY_AMBIENTE = "demo";
  process.env.MONGODB_DB_NAME = "zooly_demo";

  await assert.rejects(connectDatabase(), { code: "AMBIENTE_BANCO_INVALIDO" });
  delete process.env.ZOOLY_AMBIENTE;
  await assert.rejects(connectDatabase(), { code: "AMBIENTE_BANCO_INVALIDO" });
  assert.equal(tentativas, 0);
});

test("sem ambiente definido o padrão continua sendo zooly", async () => {
  let recebido;
  mongoose.connect = async (uri, opcoes) => {
    recebido = opcoes;
  };

  await connectDatabase();
  assert.deepEqual(recebido, { dbName: "zooly" });
});

test("a API não tem mais scripts nem carregamento do modo demo", async () => {
  const raiz = new URL("../", import.meta.url);
  const pacote = JSON.parse(
    await readFile(new URL("package.json", raiz), "utf8"),
  );
  assert.deepEqual(
    Object.keys(pacote.scripts).filter((nome) => /demo/i.test(nome)),
    [],
  );
  assert.equal(existsSync(new URL("scripts/demo", raiz)), false);
  assert.equal(existsSync(new URL("scripts/demoDados.js", raiz)), false);
  const carregarEnv = await readFile(
    new URL("src/config/carregarEnv.js", raiz),
    "utf8",
  );
  assert.equal(carregarEnv.includes(".env.demo"), false);
});
