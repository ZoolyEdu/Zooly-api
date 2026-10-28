import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import app from '../src/app.js';

const origensAnteriores = process.env.CORS_ORIGINS;
const ambienteAnterior = process.env.NODE_ENV;
let servidor;
let baseUrl;

async function requisitar(path, { method = 'GET', headers = {} } = {}) {
  return fetch(`${baseUrl}${path}`, { method, headers });
}

before(async () => {
  process.env.NODE_ENV = 'test';
  servidor = app.listen(0, '127.0.0.1');
  await new Promise(resolve => servidor.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  if (origensAnteriores === undefined) delete process.env.CORS_ORIGINS;
  else process.env.CORS_ORIGINS = origensAnteriores;
  if (ambienteAnterior === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ambienteAnterior;
  await new Promise((resolve, reject) => servidor.close(error => error ? reject(error) : resolve()));
});

test('origem autorizada recebe CORS e origem não autorizada não recebe permissão', async () => {
  process.env.CORS_ORIGINS = 'https://web.example.test,http://localhost:5173';
  const permitida = await requisitar('/api/health', { headers: { Origin: 'https://web.example.test' } });
  assert.equal(permitida.status, 200);
  assert.equal(permitida.headers.get('access-control-allow-origin'), 'https://web.example.test');

  const negada = await requisitar('/api/health', { headers: { Origin: 'https://evil.example.test' } });
  assert.equal(negada.status, 200);
  assert.equal(negada.headers.has('access-control-allow-origin'), false);
});

test('sem Origin a API continua acessível sem cabeçalho CORS permissivo', async () => {
  process.env.CORS_ORIGINS = 'https://web.example.test';
  const resposta = await requisitar('/api/health');
  assert.equal(resposta.status, 200);
  assert.equal(resposta.headers.has('access-control-allow-origin'), false);
});

test('preflight permitido retorna métodos e headers limitados', async () => {
  process.env.CORS_ORIGINS = 'https://web.example.test';
  const resposta = await requisitar('/api/health', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://web.example.test',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type'
    }
  });
  assert.equal(resposta.status, 204);
  assert.equal(resposta.headers.get('access-control-allow-origin'), 'https://web.example.test');
  assert.match(resposta.headers.get('access-control-allow-methods'), /POST/);
  assert.match(resposta.headers.get('access-control-allow-headers'), /Authorization/i);
  assert.match(resposta.headers.get('access-control-allow-headers'), /Content-Type/i);
  assert.equal(resposta.headers.has('access-control-allow-credentials'), false);
});

test('preflight não autoriza método ou header fora da lista', async () => {
  process.env.CORS_ORIGINS = 'https://web.example.test';
  const metodo = await requisitar('/api/health', {
    method: 'OPTIONS',
    headers: { Origin: 'https://web.example.test', 'Access-Control-Request-Method': 'TRACE' }
  });
  assert.equal(metodo.status, 204);
  assert.equal(metodo.headers.get('access-control-allow-origin'), 'https://web.example.test');
  assert.doesNotMatch(metodo.headers.get('access-control-allow-methods'), /TRACE/);

  const cabecalho = await requisitar('/api/health', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://web.example.test',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'x-unapproved'
    }
  });
  assert.equal(cabecalho.status, 204);
  assert.doesNotMatch(cabecalho.headers.get('access-control-allow-headers'), /x-unapproved/i);
});

test('wildcard e origens com caminho não entram na allowlist', async () => {
  process.env.CORS_ORIGINS = '*,https://web.example.test/path';
  const wildcard = await requisitar('/api/health', { headers: { Origin: 'https://random.example.test' } });
  const caminho = await requisitar('/api/health', { headers: { Origin: 'https://web.example.test' } });
  assert.equal(wildcard.headers.has('access-control-allow-origin'), false);
  assert.equal(caminho.headers.has('access-control-allow-origin'), false);
});
