import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import Historia from '../src/models/Historia.js';

const segredoTeste = 'segredo-local-historias-sem-dados-reais';
const professorId = '507f1f77bcf86cd799439210';
const historiaAId = '507f1f77bcf86cd799439201';
const historiaBId = '507f1f77bcf86cd799439202';
const originais = new Map();
let servidor;
let baseUrl;
let historias;
let chamadas;
let jwtAnterior;

function consulta(value) {
  return {
    select(projection) {
      chamadas.projecoes.push(projection);
      return this;
    },
    sort(sortOrder) {
      chamadas.ordenacoes.push(sortOrder);
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject);
    }
  };
}

function substituir(metodo, implementacao) {
  if (!originais.has(metodo)) originais.set(metodo, Historia[metodo]);
  Historia[metodo] = implementacao;
}

function historia(id, titulo, conteudo) {
  return {
    _id: id,
    titulo,
    conteudo,
    createdBy: 'administrador-interno',
    dadosAdministrativos: { revisada: true },
    senha: 'não deveria existir na resposta'
  };
}

function prepararMocks() {
  historias = new Map([
    [historiaAId, historia(historiaAId, 'A aventura', 'Uma história de teste.')],
    [historiaBId, historia(historiaBId, 'Outra aventura', 'Outro conteúdo de teste.')]
  ]);
  chamadas = { projecoes: [], ordenacoes: [], idsConsultados: [] };
  substituir('find', () => consulta([...historias.values()].sort((a, b) => a.titulo.localeCompare(b.titulo))));
  substituir('findById', id => {
    chamadas.idsConsultados.push(String(id));
    return consulta(historias.get(String(id)) ?? null);
  });
}

function token(tipo = 'professor') {
  return jwt.sign({ tipo, nome: 'Teste' }, segredoTeste, {
    subject: tipo === 'professor' ? professorId : `id-${tipo}`,
    expiresIn: '5m'
  });
}

async function get(caminho, accessToken) {
  return fetch(`${baseUrl}${caminho}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
  });
}

before(async () => {
  jwtAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = segredoTeste;
  servidor = app.listen(0, '127.0.0.1');
  await new Promise(resolve => servidor.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${servidor.address().port}/api`;
});

beforeEach(prepararMocks);

afterEach(() => {
  for (const [metodo, metodoOriginal] of originais) Historia[metodo] = metodoOriginal;
  originais.clear();
});

after(async () => {
  if (jwtAnterior === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = jwtAnterior;
  if (servidor) await new Promise((resolve, reject) => {
    servidor.close(erro => erro ? reject(erro) : resolve());
  });
});

test('requisições sem token recebem 401', async () => {
  assert.equal((await get('/historias')).status, 401);
  assert.equal((await get(`/historias/${historiaAId}`)).status, 401);
  assert.deepEqual(chamadas.projecoes, []);
  assert.deepEqual(chamadas.idsConsultados, []);
});

test('perfis autenticados diferentes de professor recebem 403', async () => {
  for (const perfil of ['aluno', 'administrador']) {
    assert.equal((await get('/historias', token(perfil))).status, 403, perfil);
    assert.equal((await get(`/historias/${historiaAId}`, token(perfil))).status, 403, perfil);
  }
  assert.deepEqual(chamadas.projecoes, []);
  assert.deepEqual(chamadas.idsConsultados, []);
});

test('professor autenticado lista histórias com os campos públicos e quantidade', async () => {
  const resposta = await get('/historias', token());
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.equal(corpo.sucesso, true);
  assert.equal(corpo.total, 2);
  assert.deepEqual(corpo.historias.map(item => item._id), [historiaAId, historiaBId]);
  assert.deepEqual(Object.keys(corpo.historias[0]).sort(), ['_id', 'conteudo', 'titulo']);
  assert.deepEqual(chamadas.projecoes, ['_id titulo conteudo']);
  assert.deepEqual(chamadas.ordenacoes, [{ titulo: 1 }]);
});

test('professor autenticado consulta história existente pelo identificador', async () => {
  const resposta = await get(`/historias/${historiaAId}`, token());
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.equal(corpo.sucesso, true);
  assert.deepEqual(corpo.historia, {
    _id: historiaAId,
    titulo: 'A aventura',
    conteudo: 'Uma história de teste.'
  });
  assert.deepEqual(chamadas.idsConsultados, [historiaAId]);
  assert.deepEqual(chamadas.projecoes, ['_id titulo conteudo']);
});

test('identificador válido sem história correspondente retorna 404', async () => {
  const idInexistente = '507f1f77bcf86cd799439299';
  const resposta = await get(`/historias/${idInexistente}`, token());
  const corpo = await resposta.json();

  assert.equal(resposta.status, 404);
  assert.equal(corpo.sucesso, false);
  assert.deepEqual(chamadas.idsConsultados, [idInexistente]);
});

test('identificador malformado retorna 400 sem consultar o modelo', async () => {
  const resposta = await get('/historias/id-invalido', token());
  const corpo = await resposta.json();

  assert.equal(resposta.status, 400);
  assert.equal(corpo.sucesso, false);
  assert.deepEqual(chamadas.idsConsultados, []);
});

test('respostas não expõem atributos administrativos ou campos extras', async () => {
  const credencial = token();
  const listagem = await get('/historias', credencial);
  const detalhe = await get(`/historias/${historiaBId}`, credencial);
  const corpoLista = await listagem.json();
  const corpoDetalhe = await detalhe.json();
  const serializado = JSON.stringify([corpoLista, corpoDetalhe]);

  assert.equal(serializado.includes('createdBy'), false);
  assert.equal(serializado.includes('dadosAdministrativos'), false);
  assert.equal(serializado.includes('não deveria existir na resposta'), false);
  for (const item of [...corpoLista.historias, corpoDetalhe.historia]) {
    assert.deepEqual(Object.keys(item).sort(), ['_id', 'conteudo', 'titulo']);
  }
});

test('professor recebe 200 e lista vazia quando não há histórias cadastradas', async () => {
  historias.clear();
  const resposta = await get('/historias', token());
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.equal(corpo.sucesso, true);
  assert.equal(corpo.total, 0);
  assert.deepEqual(corpo.historias, []);
});

test('schema exige título e conteúdo de história', async () => {
  const documento = new Historia({});
  await assert.rejects(documento.validate(), erro => {
    assert.equal(erro.name, 'ValidationError');
    assert.ok(erro.errors.titulo);
    assert.ok(erro.errors.conteudo);
    return true;
  });
});
