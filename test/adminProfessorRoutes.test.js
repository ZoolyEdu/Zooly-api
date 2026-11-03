import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import Atividade from "../src/models/Atividade.js";
import Escola from "../src/models/Escola.js";
import Professor from "../src/models/Professor.js";
import Turma from "../src/models/Turma.js";

const segredo = "segredo-teste-admin-professores";
const adminId = "507f1f77bcf86cd799439801";
const professorId = "507f1f77bcf86cd799439802";
const escolaId = "507f1f77bcf86cd799439803";
const senha = "senha-professor-segura";
const originais = new Map();
let servidor;
let baseUrl;
let professores;
let escolas;
let turmas;
let atividades;
let criacoes;

function consulta(valor) {
  return {
    select() {
      return this;
    },
    populate() {
      return this;
    },
    sort() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve(valor).then(resolve, reject);
    },
  };
}

function substituir(modelo, metodo, implementacao) {
  const chave = `${modelo.modelName}.${metodo}`;
  if (!originais.has(chave)) originais.set(chave, modelo[metodo]);
  modelo[metodo] = implementacao;
}

function documentoProfessor(dados) {
  const professor = new Professor(dados);
  professor.save = async () => {
    await professor.validate();
    professores.set(String(professor._id), professor);
    return professor;
  };
  return professor;
}

function instalarMocks() {
  professores = new Map();
  escolas = new Map([
    [
      escolaId,
      { _id: escolaId, nome: "Escola Teste", codigoPermanente: "ESC-TESTE" },
    ],
  ]);
  turmas = new Map();
  atividades = new Map();
  criacoes = 0;

  substituir(
    Escola,
    "findOne",
    async (filtro) =>
      [...escolas.values()].find(
        (item) => item.codigoPermanente === filtro.codigoPermanente,
      ) ?? null,
  );
  substituir(Professor, "findOne", (filtro) =>
    consulta(
      [...professores.values()].find(
        (item) =>
          item.email === filtro.email &&
          (!filtro._id?.$ne || String(item._id) !== String(filtro._id.$ne)),
      ) ?? null,
    ),
  );
  substituir(Professor, "create", async (dados) => {
    criacoes += 1;
    if ([...professores.values()].some((item) => item.email === dados.email)) {
      const error = new Error("duplicate");
      error.code = 11000;
      throw error;
    }
    const professor = documentoProfessor(dados);
    await professor.validate();
    professores.set(String(professor._id), professor);
    return professor;
  });
  substituir(Professor, "find", (filtro) =>
    consulta(
      [...professores.values()].filter((item) => {
        if (!filtro.$or) return true;
        return filtro.$or.some((condicao) =>
          new RegExp(condicao[Object.keys(condicao)[0]].$regex, "i").test(
            condicao.nome ? item.nome : item.email,
          ),
        );
      }),
    ),
  );
  substituir(Professor, "findById", (id) =>
    consulta(professores.get(String(id)) ?? null),
  );
  substituir(Professor, "findByIdAndDelete", async (id) => {
    const professor = professores.get(String(id)) ?? null;
    if (professor) professores.delete(String(id));
    return professor;
  });
  substituir(Turma, "exists", async (filtro) =>
    [...turmas.values()].some(
      (item) =>
        String(item.professorResponsavel) ===
        String(filtro.professorResponsavel),
    ),
  );
  substituir(Atividade, "exists", async (filtro) =>
    [...atividades.values()].some(
      (item) =>
        String(item.professorCriador) === String(filtro.professorCriador),
    ),
  );
}

function token(tipo, subject = adminId) {
  return jwt.sign({ tipo, nome: "Teste" }, segredo, {
    subject,
    expiresIn: "5m",
  });
}

async function requisitar(
  caminho,
  { metodo = "GET", tipo = "administrador", body, autenticado = true } = {},
) {
  return fetch(`${baseUrl}${caminho}`, {
    method: metodo,
    headers: {
      ...(autenticado
        ? {
            Authorization: `Bearer ${token(tipo, tipo === "professor" ? professorId : adminId)}`,
          }
        : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const cadastro = (sobrescritos = {}) => ({
  nome: "Professora Teste",
  email: "professora@example.test",
  senha,
  codigoPermanente: "ESC-TESTE",
  ...sobrescritos,
});

before(async () => {
  process.env.JWT_SECRET = segredo;
  servidor = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => servidor.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${servidor.address().port}/api`;
});

beforeEach(instalarMocks);

afterEach(() => {
  for (const [chave, metodoOriginal] of originais) {
    const [nomeModelo, metodo] = chave.split(".");
    const modelo = { Atividade, Escola, Professor, Turma }[nomeModelo];
    modelo[metodo] = metodoOriginal;
  }
  originais.clear();
});

after(async () => {
  if (servidor)
    await new Promise((resolve, reject) =>
      servidor.close((error) => (error ? reject(error) : resolve())),
    );
});

test("rotas administrativas exigem token e perfil administrador", async () => {
  assert.equal(
    (await requisitar("/admin/professores", { autenticado: false })).status,
    401,
  );
  assert.equal(
    (await requisitar("/admin/professores", { tipo: "professor" })).status,
    403,
  );
  assert.equal(
    (
      await requisitar("/admin/professores", {
        metodo: "POST",
        tipo: "professor",
        body: cadastro(),
      })
    ).status,
    403,
  );
  assert.equal(criacoes, 0);
});

test("cadastro administrativo valida campos, senha, e-mail e escola sem gravar dados inválidos", async () => {
  for (const body of [
    cadastro({ nome: " " }),
    cadastro({ email: "email-invalido" }),
    cadastro({ senha: "curta" }),
    cadastro({ codigoPermanente: "INEXISTENTE" }),
  ]) {
    assert.equal(
      (await requisitar("/admin/professores", { metodo: "POST", body })).status,
      400,
    );
  }
  assert.equal(criacoes, 0);
});

test("administrador cria professor com senha em hash e o login existente aceita as credenciais", async () => {
  const resposta = await requisitar("/admin/professores", {
    metodo: "POST",
    body: cadastro({
      email: " PROFESSORA@EXAMPLE.TEST ",
      tipo: "administrador",
    }),
  });
  const corpo = await resposta.json();
  assert.equal(resposta.status, 201);
  assert.equal(corpo.professor.email, "professora@example.test");
  assert.equal(Object.hasOwn(corpo.professor, "tipo"), false);
  assert.deepEqual(corpo.professor.escolas, [{ id: escolaId }]);
  assert.equal(Object.hasOwn(corpo.professor, "senha"), false);
  assert.equal(JSON.stringify(corpo).includes(senha), false);
  const salvo = [...professores.values()][0];
  assert.notEqual(salvo.senha, senha);
  assert.equal(await bcrypt.compare(senha, salvo.senha), true);

  const login = await requisitar("/auth/login", {
    autenticado: false,
    metodo: "POST",
    body: { email: "professora@example.test", senha },
  });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).usuario.tipo, "professor");
});

test("cadastro administrativo rejeita e-mail duplicado", async () => {
  await requisitar("/admin/professores", { metodo: "POST", body: cadastro() });
  const resposta = await requisitar("/admin/professores", {
    metodo: "POST",
    body: cadastro({ nome: "Outro Nome" }),
  });
  assert.equal(resposta.status, 409);
  assert.equal(criacoes, 1);
});

test("edição atualiza o perfil, troca a senha somente quando enviada e rejeita outro e-mail duplicado", async () => {
  const primeira = (
    await (
      await requisitar("/admin/professores", {
        metodo: "POST",
        body: cadastro(),
      })
    ).json()
  ).professor;
  const segunda = (
    await (
      await requisitar("/admin/professores", {
        metodo: "POST",
        body: cadastro({
          email: "outra@example.test",
          nome: "Outro Professor",
        }),
      })
    ).json()
  ).professor;
  const duplicada = await requisitar(`/admin/professores/${segunda.id}`, {
    metodo: "PUT",
    body: { email: "professora@example.test" },
  });
  assert.equal(duplicada.status, 409);

  const novaSenha = "senha-atualizada-segura";
  const atualizada = await requisitar(`/admin/professores/${primeira.id}`, {
    metodo: "PUT",
    body: { nome: "Nome Atualizado", senha: novaSenha },
  });
  assert.equal(atualizada.status, 200);
  const corpoAtualizado = await atualizada.json();
  assert.equal(corpoAtualizado.professor.nome, "Nome Atualizado");
  assert.equal(
    await bcrypt.compare(novaSenha, professores.get(primeira.id).senha),
    true,
  );
  assert.equal(Object.hasOwn(corpoAtualizado.professor, "senha"), false);
});

test("listagem e detalhe retornam dados seguros e a exclusão protege vínculos", async () => {
  const criado = await requisitar("/admin/professores", {
    metodo: "POST",
    body: cadastro(),
  });
  const registro = (await criado.json()).professor;
  const listagem = await requisitar("/admin/professores?busca=professora");
  assert.equal(listagem.status, 200);
  assert.equal((await listagem.json()).professores.length, 1);
  const detalhe = await requisitar(`/admin/professores/${registro.id}`);
  assert.equal(detalhe.status, 200);
  assert.equal(JSON.stringify(await detalhe.json()).includes("$2"), false);

  turmas.set("turma-vinculada", { professorResponsavel: registro.id });
  assert.equal(
    (
      await requisitar(`/admin/professores/${registro.id}`, {
        metodo: "DELETE",
      })
    ).status,
    409,
  );
  turmas.clear();
  assert.equal(
    (
      await requisitar(`/admin/professores/${registro.id}`, {
        metodo: "DELETE",
      })
    ).status,
    200,
  );
});
