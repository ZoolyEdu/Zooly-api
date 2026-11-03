import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import Professor from "../src/models/Professor.js";

const segredo = "segredo-local-corpo-ausente";
const professorId = "507f1f77bcf86cd799439801";
const findByIdOriginal = Professor.findById;

let servidor;
let baseUrl;
let jwtAnterior;

function token(tipo) {
  return jwt.sign({ tipo, nome: "Teste" }, segredo, {
    subject: professorId,
    expiresIn: "1h",
  });
}

before(async () => {
  jwtAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = segredo;
  Professor.findById = () => ({
    select: async () => ({ _id: professorId, escolas: [] }),
  });
  servidor = app.listen(0);
  await new Promise((resolve) => servidor.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${servidor.address().port}/api`;
});

after(async () => {
  Professor.findById = findByIdOriginal;
  await new Promise((resolve) => servidor.close(resolve));
  if (jwtAnterior === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = jwtAnterior;
});

for (const [caminho, perfil] of [
  ["/turmas", "professor"],
  ["/alunos", "professor"],
  ["/professores", null],
  ["/escolas", "administrador"],
  ["/atividades", "professor"],
  ["/auth/login", null],
]) {
  test(`POST ${caminho} sem corpo responde 400, não 500`, async () => {
    const resposta = await fetch(`${baseUrl}${caminho}`, {
      method: "POST",
      headers: perfil ? { Authorization: `Bearer ${token(perfil)}` } : {},
    });
    assert.equal(resposta.status, 400);
  });
}
