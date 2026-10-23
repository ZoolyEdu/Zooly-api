import assert from 'node:assert/strict';
import { after, before, afterEach, test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { criarBnccRouter } from '../src/routes/bnccRoutes.js';
import { configurarFetchBncc } from '../src/services/bnccService.js';

const secret = 'segredo-local-de-testes-bncc';
const professorId = '507f1f77bcf86cd799439010';
let server;
let baseUrl;

function token(tipo = 'professor') {
  return jwt.sign({ tipo }, secret, { subject: professorId, expiresIn: '5m' });
}

function resposta(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function envelope(itens) {
  return { total: itens.length, pagina: 1, limite: 10, itens };
}

async function get(path, tipo = 'professor') {
  return fetch(`${baseUrl}${path}`, {
    headers: tipo ? { Authorization: `Bearer ${token(tipo)}` } : {}
  });
}

before(async () => {
  process.env.JWT_SECRET = secret;
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/bncc`;
});

afterEach(() => { configurarFetchBncc(null); });
after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('professor busca nos anos iniciais e preserva os dados retornados pela fonte', async () => {
  const habilidade = { codigo: 'EF01LP01', etapa: 'EF', texto: 'Texto da fonte', vigencia: {}, fonte: { localizador_pdf: 'p. 1' } };
  const foraDoEscopo = { codigo: 'EF06LP01', etapa: 'EF', texto: 'Ano fora do escopo', vigencia: {}, fonte: {} };
  const objetivo = { codigo: 'EI03EO01', etapa: 'EI', texto: 'Objetivo da fonte', vigencia: {}, fonte: { localizador_pdf: 'p. 2' } };
  const urls = [];
  configurarFetchBncc(async url => {
    urls.push(String(url));
    return resposta(envelope(String(url).includes('etapa=EI') ? [objetivo] : [habilidade, foraDoEscopo]));
  });

  const response = await get('/busca?tema=conviv%C3%AAncia');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.itens, [objetivo, habilidade]);
  assert.equal(urls.length, 2);
  assert.ok(urls.every(url => url.startsWith('https://api.bncc.dev/v1/busca?')));
  assert.ok(urls.some(url => url.includes('etapa=EI')));
  assert.ok(urls.some(url => url.includes('etapa=EF')));
});

test('consulta por código retorna registro integral da BNCC', async () => {
  const registro = { codigo: 'EF05MA07', etapa: 'EF', texto: 'Descrição original', vigencia: {}, fonte: { documento: 'BNCC' } };
  configurarFetchBncc(async url => {
    assert.equal(String(url), 'https://api.bncc.dev/v1/aprendizagens/EF05MA07');
    return resposta(registro);
  });
  const response = await get('/EF05MA07');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).item, registro);
});

test('rejeita parâmetros ausentes, longos, fora do limite e chaves não reconhecidas', async () => {
  let chamadas = 0;
  configurarFetchBncc(async () => { chamadas += 1; return resposta(envelope([])); });
  for (const path of ['/busca', '/busca?tema=%20%20', `/busca?tema=${'a'.repeat(101)}`, '/busca?tema=agua&limite=11', '/busca?tema=agua&url=https://example.com']) {
    assert.equal((await get(path)).status, 400, path);
  }
  assert.equal((await get('/EF67LP08')).status, 400);
  assert.equal(chamadas, 0);
});

test('trata item inexistente e bloqueia acesso sem perfil de professor', async () => {
  configurarFetchBncc(async () => resposta({ erro: 'Não encontrado' }, 404));
  assert.equal((await get('/EF01LP01')).status, 404);
  assert.equal((await get('/EF01LP01', 'aluno')).status, 403);
  assert.equal((await get('/EF01LP01', null)).status, 401);
});

test('mapeia timeout e indisponibilidade da API externa', async () => {
  configurarFetchBncc(async () => { const error = new Error('timed out'); error.name = 'TimeoutError'; throw error; });
  assert.equal((await get('/busca?tema=agua')).status, 504);

  configurarFetchBncc(async () => resposta({ erro: 'indisponível' }, 503));
  assert.equal((await get('/busca?tema=agua')).status, 502);
});

test('busca continua acessível quando o router registra primeiro a rota dinâmica', async () => {
  configurarFetchBncc(async () => resposta(envelope([])));
  const appComOrdemInvertida = express();
  appComOrdemInvertida.use('/api/bncc', criarBnccRouter({ codigoAntesDaBusca: true }));
  const servidorInvertido = appComOrdemInvertida.listen(0, '127.0.0.1');
  await new Promise(resolve => servidorInvertido.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${servidorInvertido.address().port}/api/bncc/busca?tema=agua`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).itens, []);
  } finally {
    await new Promise((resolve, reject) => servidorInvertido.close(error => error ? reject(error) : resolve()));
  }
});

test('rejeita JSON válido com estrutura de busca incorreta e itens incompletos', async () => {
  for (const body of [null, [], {}, { total: 0, pagina: 1, limite: 10 }, envelope([{
    codigo: 'EF01LP01', etapa: 'EF', texto: 'Texto sem referência obrigatória', vigencia: {}
  }])]) {
    configurarFetchBncc(async () => resposta(body));
    const response = await get('/busca?tema=agua');
    assert.equal(response.status, 502);
    assert.match((await response.json()).mensagem, /estrutura de busca inválida/);
  }

  configurarFetchBncc(async () => resposta({ codigo: 'EF01LP01', etapa: 'EF', vigencia: {}, fonte: {} }));
  const response = await get('/EF01LP01');
  assert.equal(response.status, 502);
  assert.match((await response.json()).mensagem, /estrutura de aprendizagem inválida/);
});

test('distingue JSON inválido de JSON válido com estrutura incorreta', async () => {
  configurarFetchBncc(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('JSON inválido'); } }));
  const jsonInvalido = await get('/busca?tema=agua');
  assert.equal(jsonInvalido.status, 502);
  assert.match((await jsonInvalido.json()).mensagem, /resposta inválida/);

  configurarFetchBncc(async () => resposta({ inesperado: true }));
  const estruturaInvalida = await get('/busca?tema=agua');
  assert.equal(estruturaInvalida.status, 502);
  assert.match((await estruturaInvalida.json()).mensagem, /estrutura de busca inválida/);
});

test('timeout durante response.json permanece classificado como 504', async () => {
  configurarFetchBncc(async (_url, { signal }) => ({
    ok: true,
    status: 200,
    json: () => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        const error = new Error('aborted during body read');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    })
  }), 5);

  const response = await get('/EF01LP01');
  assert.equal(response.status, 504);
  assert.match((await response.json()).mensagem, /excedeu o tempo limite/);
});
