import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../src/app.js';
import Aluno from '../src/models/Aluno.js';
import MovimentacaoMoeda from '../src/models/MovimentacaoMoeda.js';

const segredo = 'segredo-local-moedas-sem-dados-reais';
const alunoId = '507f1f77bcf86cd799439501';
const outroAlunoId = '507f1f77bcf86cd799439503';
const atividadeId = '507f1f77bcf86cd799439502';
const originais = new Map();
let servidor;
let baseUrl;
let jwtAnterior;
let ledger;
let bloqueio;

function substituir(modelo, metodo, implementacao) {
  const nome = modelo.modelName ?? (modelo === mongoose ? 'mongoose' : 'model');
  const chave = `${nome}#${metodo}`;
  if (!originais.has(chave)) originais.set(chave, modelo[metodo]);
  modelo[metodo] = implementacao;
}

function token(tipo = 'aluno', subject = alunoId) {
  return jwt.sign({ tipo }, segredo, { subject, expiresIn: '5m' });
}

async function request(path, { method = 'GET', accessToken = token(), body } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
}

function executarAgregacao(pipeline) {
  const idFiltrado = String(pipeline[0].$match.aluno);
  const saldo = ledger.filter(item => String(item.aluno) === idFiltrado)
    .reduce((total, item) => total + (item.tipo === 'ganho' ? item.quantidade : -item.quantidade), 0);
  return { session() { return this; }, then(resolve, reject) { return Promise.resolve(saldo ? [{ saldo }] : []).then(resolve, reject); } };
}

function instalarMocks() {
  ledger = [];
  bloqueio = Promise.resolve();
  substituir(Aluno, 'findById', id => ({ select: async () =>
    [alunoId, outroAlunoId].includes(String(id)) ? { _id: id } : null }));
  substituir(Aluno, 'updateOne', async ({ _id }) => ({ matchedCount: [alunoId, outroAlunoId].includes(String(_id)) ? 1 : 0 }));
  substituir(MovimentacaoMoeda, 'aggregate', executarAgregacao);
  substituir(MovimentacaoMoeda, 'create', async documentos => {
    const criados = documentos.map(item => ({ ...item, _id: new mongoose.Types.ObjectId(), createdAt: new Date() }));
    ledger.push(...criados);
    return criados;
  });
  substituir(MovimentacaoMoeda, 'find', filtro => ({
    sort() { return this; },
    skip(valor) { this.deslocamento = valor; return this; },
    limit(valor) { this.maximo = valor; return this; },
    then(resolve, reject) {
      const lista = ledger.filter(item => String(item.aluno) === String(filtro.aluno));
      return Promise.resolve(lista.reverse().slice(this.deslocamento, this.deslocamento + this.maximo)).then(resolve, reject);
    }
  }));
  substituir(mongoose, 'startSession', async () => ({
    async withTransaction(operacao) {
      const anterior = bloqueio;
      let liberar;
      bloqueio = new Promise(resolve => { liberar = resolve; });
      await anterior;
      try { return await operacao(); }
      finally { liberar(); }
    },
    async endSession() {}
  }));
}

before(async () => {
  jwtAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = segredo;
  servidor = app.listen(0, '127.0.0.1');
  await new Promise(resolve => servidor.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${servidor.address().port}/api`;
});

beforeEach(instalarMocks);

afterEach(() => {
  for (const [chave, original] of originais) {
    const [nome, metodo] = chave.split('#');
    ({ Aluno, MovimentacaoMoeda, mongoose })[nome][metodo] = original;
  }
  originais.clear();
});

after(async () => {
  if (jwtAnterior === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = jwtAnterior;
  await new Promise((resolve, reject) => servidor.close(erro => erro ? reject(erro) : resolve()));
});

test('model valida tipo, quantidade inteira positiva, motivo e índices contra recompensa duplicada', async () => {
  const valido = new MovimentacaoMoeda({ aluno: alunoId, tipo: 'ganho', quantidade: 10, motivo: 'Conclusão', atividade: atividadeId });
  await valido.validate();

  for (const quantidade of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const invalido = new MovimentacaoMoeda({ aluno: alunoId, tipo: 'gasto', quantidade, motivo: 'Compra' });
    await assert.rejects(invalido.validate(), erro => erro.name === 'ValidationError');
  }
  const tipoInvalido = new MovimentacaoMoeda({ aluno: alunoId, tipo: 'ajuste', quantidade: 1, motivo: 'Teste' });
  await assert.rejects(tipoInvalido.validate(), erro => erro.name === 'ValidationError');
  assert.ok(MovimentacaoMoeda.schema.indexes().some(([campos, opcoes]) =>
    campos.aluno === 1 && campos.atividade === 1 && campos.tipo === 1 && opcoes.unique &&
    opcoes.partialFilterExpression.tipo === 'ganho' && opcoes.partialFilterExpression.atividade.$type === 'objectId'
  ));
});

test('saldo é calculado pela soma dos ganhos menos os gastos e histórico pertence ao aluno autenticado', async () => {
  ledger.push(
    { aluno: alunoId, tipo: 'ganho', quantidade: 20, motivo: 'Conclusão' },
    { aluno: alunoId, tipo: 'gasto', quantidade: 7, motivo: 'Avatar' },
    { aluno: outroAlunoId, tipo: 'ganho', quantidade: 99, motivo: 'Outro aluno' }
  );
  const saldo = await request('/moedas/saldo');
  assert.equal(saldo.status, 200);
  assert.equal((await saldo.json()).saldo, 13);

  const historico = await request('/moedas/movimentacoes?limite=1&pagina=2');
  assert.equal(historico.status, 200);
  const body = await historico.json();
  assert.equal(body.movimentacoes.length, 1);
  assert.equal(body.limite, 1);
  assert.equal(body.pagina, 2);
  assert.equal((await request('/moedas/movimentacoes?limite=101')).status, 400);

  const saldoDeOutroAluno = await request('/moedas/saldo', { accessToken: token('aluno', outroAlunoId) });
  assert.equal((await saldoDeOutroAluno.json()).saldo, 99);
  const historicoDeOutroAluno = await request('/moedas/movimentacoes', { accessToken: token('aluno', outroAlunoId) });
  assert.deepEqual((await historicoDeOutroAluno.json()).movimentacoes.map(item => item.motivo), ['Outro aluno']);
});

test('pagination of movements rejects invalid values and accepts its documented limits', async () => {
  const invalidas = [
    '?limite=0', '?limite=-1', '?limite=1.5', '?limite=101', '?limite=abc',
    '?pagina=0', '?pagina=-1', '?pagina=1.5', '?pagina=abc',
    '?pagina=9007199254740991&limite=100'
  ];
  for (const parametros of invalidas) {
    const resposta = await request(`/moedas/movimentacoes${parametros}`);
    assert.equal(resposta.status, 400, parametros);
    assert.deepEqual(await resposta.json(), {
      sucesso: false,
      mensagem: 'Informe página positiva e limite inteiro entre 1 e 100.'
    });
  }

  const limiteMinimo = await request('/moedas/movimentacoes?pagina=1&limite=1');
  const corpoMinimo = await limiteMinimo.json();
  assert.equal(limiteMinimo.status, 200);
  assert.equal(corpoMinimo.pagina, 1);
  assert.equal(corpoMinimo.limite, 1);

  const limiteMaximo = await request('/moedas/movimentacoes?pagina=1&limite=100');
  const corpoMaximo = await limiteMaximo.json();
  assert.equal(limiteMaximo.status, 200);
  assert.equal(corpoMaximo.pagina, 1);
  assert.equal(corpoMaximo.limite, 100);
});

test('gasto válido registra movimento e saldo insuficiente não permite saldo negativo', async () => {
  ledger.push({ aluno: alunoId, tipo: 'ganho', quantidade: 12, motivo: 'Teste' });
  const resposta = await request('/moedas/gastos', { method: 'POST', body: { quantidade: 5, motivo: 'Item cosmético' } });
  assert.equal(resposta.status, 201);
  assert.equal((await resposta.json()).saldo, 7);
  assert.equal(ledger.at(-1).tipo, 'gasto');

  const insuficiente = await request('/moedas/gastos', { method: 'POST', body: { quantidade: 8, motivo: 'Outro item' } });
  assert.equal(insuficiente.status, 409);
  assert.equal(ledger.reduce((saldo, item) => saldo + (item.tipo === 'ganho' ? item.quantidade : -item.quantidade), 0), 7);
});

test('valida autenticação, perfil, identidade e corpo dos gastos', async () => {
  assert.equal((await request('/moedas/saldo', { accessToken: null })).status, 401);
  assert.equal((await request('/moedas/saldo', { accessToken: token('professor') })).status, 403);
  assert.equal((await request('/moedas/gastos', { method: 'POST', body: { aluno: alunoId, quantidade: 1, motivo: 'Teste' } })).status, 400);
  for (const quantidade of [0, -1, 1.2, '2', null]) {
    assert.equal((await request('/moedas/gastos', { method: 'POST', body: { quantidade, motivo: 'Teste' } })).status, 400);
  }
  assert.equal((await request('/moedas/gastos', { method: 'POST', body: { quantidade: 1, motivo: 'x' } })).status, 400);
  assert.equal(ledger.length, 0);
});

test('gastos simultâneos serializados não ultrapassam o saldo', async () => {
  ledger.push({ aluno: alunoId, tipo: 'ganho', quantidade: 10, motivo: 'Saldo inicial' });
  const resultados = await Promise.all([
    request('/moedas/gastos', { method: 'POST', body: { quantidade: 7, motivo: 'Primeiro gasto' } }),
    request('/moedas/gastos', { method: 'POST', body: { quantidade: 7, motivo: 'Segundo gasto' } })
  ]);
  assert.deepEqual(resultados.map(resposta => resposta.status).sort(), [201, 409]);
  const saldo = ledger.reduce((total, item) => total + (item.tipo === 'ganho' ? item.quantidade : -item.quantidade), 0);
  assert.equal(saldo, 3);
});

test('não faz escrita insegura quando o servidor MongoDB não oferece transações', async () => {
  ledger.push({ aluno: alunoId, tipo: 'ganho', quantidade: 10, motivo: 'Saldo inicial' });
  substituir(mongoose, 'startSession', async () => {
    const erro = new Error('Transaction numbers are only allowed on a replica set member or mongos');
    erro.code = 20;
    throw erro;
  });
  const resposta = await request('/moedas/gastos', {
    method: 'POST',
    body: { quantidade: 2, motivo: 'Teste' }
  });
  assert.equal(resposta.status, 503);
  assert.equal(ledger.length, 1);
});
