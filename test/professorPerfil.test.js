import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import Professor from '../src/models/Professor.js';

const segredoTeste = 'segredo-local-perfil-professor';
const professorId = '507f1f77bcf86cd799439701';
const escolaId = '507f1f77bcf86cd799439702';
const findByIdOriginal = Professor.findById;

let servidor;
let baseUrl;
let jwtAnterior;
let chamadas;
let registro;

function token(tipo, sub = professorId) {
  return jwt.sign({ tipo, nome: 'Teste' }, segredoTeste, { subject: sub, expiresIn: '1h' });
}

function obterPerfil(autorizacao) {
  return fetch(`${baseUrl}/api/professores/me`, {
    headers: autorizacao ? { Authorization: `Bearer ${autorizacao}` } : {}
  });
}

before(async () => {
  jwtAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = segredoTeste;
  servidor = app.listen(0);
  await new Promise(resolve => servidor.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  await new Promise(resolve => servidor.close(resolve));
  if (jwtAnterior === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = jwtAnterior;
});

beforeEach(() => {
  chamadas = { ids: [], projecoes: [], populates: [] };
  registro = {
    _id: professorId,
    nome: 'Professora',
    email: 'professora@example.test',
    senha: 'hash-que-nunca-deve-sair',
    escolas: [{
      _id: escolaId,
      nome: 'Escola Teste',
      codigoPermanente: 'ESC-TESTE',
      municipio: 'Sorocaba',
      endereco: 'Rua 1',
      email: 'escola@example.test',
      contato: '15999999999',
      cnpj: 'nao-deve-sair'
    }]
  };
  Professor.findById = id => {
    chamadas.ids.push(id);
    return {
      select(projecao) {
        chamadas.projecoes.push(projecao);
        return this;
      },
      populate(caminho, campos) {
        chamadas.populates.push([caminho, campos]);
        return Promise.resolve(registro);
      }
    };
  };
});

afterEach(() => {
  Professor.findById = findByIdOriginal;
});

test('GET /professores/me devolve o perfil do token e as escolas, sem senha', async () => {
  const resposta = await obterPerfil(token('professor'));
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.deepEqual(chamadas.ids, [professorId]);
  assert.deepEqual(chamadas.projecoes, ['nome email escolas']);
  assert.equal(corpo.professor.id, professorId);
  assert.equal(corpo.professor.escolas[0].id, escolaId);
  assert.equal(corpo.professor.escolas[0].codigoPermanente, 'ESC-TESTE');
  assert.equal(JSON.stringify(corpo).includes('senha'), false);
  assert.equal(JSON.stringify(corpo).includes('hash-que-nunca-deve-sair'), false);
  assert.equal(JSON.stringify(corpo).includes('cnpj'), false);
});

test('GET /professores/me exige token', async () => {
  const resposta = await obterPerfil();
  assert.equal(resposta.status, 401);
  assert.deepEqual(chamadas.ids, []);
});

test('GET /professores/me rejeita administrador e aluno', async () => {
  for (const tipo of ['administrador', 'aluno']) {
    const resposta = await obterPerfil(token(tipo));
    assert.equal(resposta.status, 403);
  }
  assert.deepEqual(chamadas.ids, []);
});

test('GET /professores/me responde 401 quando a conta não existe mais', async () => {
  registro = null;
  const resposta = await obterPerfil(token('professor'));
  assert.equal(resposta.status, 401);
});

test('GET /professores/me responde 401 quando o sub do token não é um ObjectId', async () => {
  const resposta = await obterPerfil(token('professor', 'nao-e-objectid'));
  assert.equal(resposta.status, 401);
  assert.deepEqual(chamadas.ids, []);
});

test('POST /professores continua público', async () => {
  const resposta = await fetch(`${baseUrl}/api/professores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(resposta.status, 400);
});
