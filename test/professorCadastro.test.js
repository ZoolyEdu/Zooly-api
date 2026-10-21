import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import Escola from '../src/models/Escola.js';
import Professor from '../src/models/Professor.js';

const segredoTeste = 'segredo-local-cadastro-professor';
const escolaId = '507f1f77bcf86cd799439101';
const senhaOriginal = 'senha-teste-segura';

const originais = new Map();
let servidor;
let baseUrl;
let escolas;
let professores;
let modoCriacao;
let chamadas;
let jwtAnterior;

function query(value) {
  return {
    select(projection) {
      chamadas.projecoes.push(projection);
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject);
    }
  };
}

function substituir(model, metodo, implementacao) {
  const chave = `${model.modelName}.${metodo}`;
  if (!originais.has(chave)) originais.set(chave, model[metodo]);
  model[metodo] = implementacao;
}

function instalarMocks() {
  escolas = new Map([[escolaId, {
    _id: escolaId,
    codigoPermanente: 'ESCOLA-TESTE'
  }]]);
  professores = new Map();
  modoCriacao = 'normal';
  chamadas = { buscaEscola: [], buscaProfessor: [], projecoes: [], criacoes: 0 };

  substituir(Escola, 'findOne', async filtro => {
    chamadas.buscaEscola.push(filtro);
    return [...escolas.values()].find(escola =>
      escola.codigoPermanente === filtro.codigoPermanente
    ) ?? null;
  });

  substituir(Professor, 'findOne', filtro => {
    chamadas.buscaProfessor.push(filtro);
    return query(professores.get(filtro.email) ?? null);
  });

  substituir(Professor, 'create', async dados => {
    chamadas.criacoes += 1;
    if (modoCriacao === 'duplicado') {
      const erro = new Error('duplicate key');
      erro.code = 11000;
      throw erro;
    }

    const professor = new Professor(dados);
    await professor.validate();
    professores.set(professor.email, professor);
    return professor;
  });
}

async function postJson(caminho, body) {
  return fetch(`${baseUrl}${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function dadosCadastro(overrides = {}) {
  return {
    nome: 'Professora Teste',
    email: 'professora@example.com',
    senha: senhaOriginal,
    codigoPermanente: 'ESCOLA-TESTE',
    ...overrides
  };
}

before(async () => {
  jwtAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = segredoTeste;
  servidor = app.listen(0, '127.0.0.1');
  await new Promise(resolve => servidor.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${servidor.address().port}/api`;
});

beforeEach(instalarMocks);

afterEach(() => {
  for (const [chave, metodoOriginal] of originais) {
    const [nomeModelo, nomeMetodo] = chave.split('.');
    const modelo = { Escola, Professor }[nomeModelo];
    modelo[nomeMetodo] = metodoOriginal;
  }
  originais.clear();
});

after(async () => {
  if (jwtAnterior === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = jwtAnterior;
  if (servidor) await new Promise((resolve, reject) => {
    servidor.close(erro => erro ? reject(erro) : resolve());
  });
});

test('o schema exige nome, e-mail e senha e rejeita e-mail malformado', async () => {
  const semObrigatorios = new Professor({});
  await assert.rejects(semObrigatorios.validate(), erro => {
    assert.equal(erro.name, 'ValidationError');
    assert.ok(erro.errors.nome);
    assert.ok(erro.errors.email);
    assert.ok(erro.errors.senha);
    return true;
  });

  const emailInvalido = new Professor({
    nome: 'Professora Teste',
    email: 'email-invalido',
    senha: 'hash-de-teste'
  });
  await assert.rejects(emailInvalido.validate(), erro => {
    assert.equal(erro.name, 'ValidationError');
    assert.ok(erro.errors.email);
    return true;
  });
});

test('cadastro rejeita individualmente cada campo obrigatório ausente', async () => {
  for (const campo of ['nome', 'email', 'senha', 'codigoPermanente']) {
    const corpo = dadosCadastro();
    delete corpo[campo];
    const resposta = await postJson('/professores', corpo);
    assert.equal(resposta.status, 400, `campo ausente: ${campo}`);
  }
  assert.equal(chamadas.criacoes, 0);
});

test('cadastro rejeita e-mail inválido antes de consultar a escola', async () => {
  const resposta = await postJson('/professores', dadosCadastro({ email: 'sem-arroba' }));
  assert.equal(resposta.status, 400);
  assert.equal(chamadas.buscaEscola.length, 0);
  assert.equal(chamadas.criacoes, 0);
});

test('cadastro rejeita código permanente de escola inexistente', async () => {
  const resposta = await postJson('/professores', dadosCadastro({ codigoPermanente: 'NAO-EXISTE' }));
  assert.equal(resposta.status, 400);
  assert.deepEqual(chamadas.buscaEscola[0], { codigoPermanente: 'NAO-EXISTE' });
  assert.equal(chamadas.criacoes, 0);
});

test('cadastro retorna 409 para e-mail já cadastrado', async () => {
  const existente = new Professor({
    nome: 'Existente',
    email: 'professora@example.com',
    senha: 'hash-existente'
  });
  professores.set(existente.email, existente);

  const resposta = await postJson('/professores', dadosCadastro());
  assert.equal(resposta.status, 409);
  assert.equal(chamadas.criacoes, 0);
});

test('cadastro trata corrida de duplicidade MongoDB com erro 11000 como 409', async () => {
  modoCriacao = 'duplicado';
  const resposta = await postJson('/professores', dadosCadastro());
  assert.equal(resposta.status, 409);
  assert.equal(chamadas.criacoes, 1);
});

test('cadastro válido persiste professor vinculado à escola e protege a senha', async () => {
  const resposta = await postJson('/professores', dadosCadastro({
    nome: '  Professora Teste  ',
    email: '  PROFESSORA@EXAMPLE.COM  '
  }));
  const corpo = await resposta.json();

  assert.equal(resposta.status, 201);
  assert.equal(chamadas.criacoes, 1);
  assert.equal(corpo.professor.nome, 'Professora Teste');
  assert.equal(corpo.professor.email, 'professora@example.com');
  assert.deepEqual(corpo.professor.escolas.map(String), [escolaId]);
  assert.ok(professores.has('professora@example.com'));

  const salvo = professores.get('professora@example.com');
  assert.notEqual(salvo.senha, senhaOriginal);
  assert.equal(await bcrypt.compare(senhaOriginal, salvo.senha), true);
  assert.equal(Object.hasOwn(corpo.professor, 'senha'), false);
  assert.equal(JSON.stringify(corpo).includes(salvo.senha), false);
  assert.equal(JSON.stringify(corpo).includes(senhaOriginal), false);
});

test('login aceita senha correta usando hash armazenado e rejeita senha incorreta', async () => {
  const senhaHash = await bcrypt.hash(senhaOriginal, 4);
  const professor = new Professor({
    _id: '507f1f77bcf86cd799439102',
    nome: 'Professora Teste',
    email: 'professora@example.com',
    senha: senhaHash
  });
  professores.set(professor.email, professor);

  const sucesso = await postJson('/auth/login', {
    email: ' PROFESSORA@EXAMPLE.COM ',
    senha: senhaOriginal
  });
  const corpoSucesso = await sucesso.json();
  assert.equal(sucesso.status, 200);
  assert.equal(typeof corpoSucesso.token, 'string');
  assert.deepEqual(chamadas.buscaProfessor[0], { email: 'professora@example.com' });
  assert.ok(chamadas.projecoes.includes('+senha'));

  const falha = await postJson('/auth/login', {
    email: 'professora@example.com',
    senha: 'senha-incorreta'
  });
  assert.equal(falha.status, 401);
});
