import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
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

test("banco real sem ambiente definido é aceito", () => {
  assert.doesNotThrow(() => validarAmbienteBanco("zooly", undefined));
});

test("demo com zooly_demo é aceito", () => {
  assert.doesNotThrow(() => validarAmbienteBanco("zooly_demo", "demo"));
});

test("demo nunca aceita outro banco, nem o real", () => {
  for (const banco of ["zooly", "test", "Zooly_Demo"]) {
    assert.throws(() => validarAmbienteBanco(banco, "demo"), {
      code: "AMBIENTE_BANCO_INVALIDO",
    });
  }
});

test("banco de demo exige o ambiente demo, em qualquer caixa", () => {
  for (const banco of ["zooly_demo", "ZOOLY_DEMO"]) {
    assert.throws(() => validarAmbienteBanco(banco, undefined), {
      code: "AMBIENTE_BANCO_INVALIDO",
    });
  }
});

test("valor desconhecido de ZOOLY_AMBIENTE é recusado", () => {
  assert.throws(() => validarAmbienteBanco("zooly", "producao"), {
    code: "AMBIENTE_BANCO_INVALIDO",
  });
});

test("demo sem MONGODB_DB_NAME não conecta no padrão zooly", async () => {
  let tentativas = 0;
  mongoose.connect = async () => {
    tentativas += 1;
  };
  process.env.ZOOLY_AMBIENTE = "demo";

  await assert.rejects(connectDatabase(), { code: "AMBIENTE_BANCO_INVALIDO" });
  assert.equal(tentativas, 0);
});

test("demo conecta somente com dbName zooly_demo", async () => {
  let recebido;
  mongoose.connect = async (uri, opcoes) => {
    recebido = opcoes;
  };
  process.env.ZOOLY_AMBIENTE = "demo";
  process.env.MONGODB_DB_NAME = "zooly_demo";

  await connectDatabase();
  assert.deepEqual(recebido, { dbName: "zooly_demo" });
});

test("sem ambiente definido o padrão continua sendo zooly", async () => {
  let recebido;
  mongoose.connect = async (uri, opcoes) => {
    recebido = opcoes;
  };

  await connectDatabase();
  assert.deepEqual(recebido, { dbName: "zooly" });
});
