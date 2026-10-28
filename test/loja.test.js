import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../src/app.js';
import Aluno from '../src/models/Aluno.js';
import AvatarAluno from '../src/models/AvatarAluno.js';
import MovimentacaoMoeda from '../src/models/MovimentacaoMoeda.js';
import catalogoAvatares from '../src/config/catalogoAvatares.js';
import { comprarAvatar } from '../src/services/moedaService.js';

const segredo = 'segredo-local-loja-sem-dados-reais';
const alunoA = '507f1f77bcf86cd799439501';
const alunoB = '507f1f77bcf86cd799439503';
const alunoC = '507f1f77bcf86cd799439504';
const originais = new Map();
let servidor;
let baseUrl;
let jwtAnterior;
let ledger;
let inventario;
let selecionados;
let bloqueio;
let falhaEm;

function substituir(modelo, metodo, implementacao) {
  const nome = modelo.modelName ?? (modelo === mongoose ? 'mongoose' : 'model');
  const chave = `${nome}#${metodo}`;
  if (!originais.has(chave)) originais.set(chave, modelo[metodo]);
  modelo[metodo] = implementacao;
}

function token(tipo = 'aluno', subject = alunoA) {
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
  const aluno = String(pipeline[0].$match.aluno);
  const saldo = ledger.filter(item => String(item.aluno) === aluno)
    .reduce((total, item) => total + (item.tipo === 'ganho' ? item.quantidade : -item.quantidade), 0);
  return { session() { return this; }, then(resolve, reject) { return Promise.resolve(saldo ? [{ saldo }] : []).then(resolve, reject); } };
}

function instalarMocks() {
  ledger = [];
  inventario = [];
  selecionados = new Map([[alunoA, null], [alunoB, null]]);
  bloqueio = Promise.resolve();
  falhaEm = null;

  substituir(Aluno, 'updateOne', async (filtro, atualizacao) => {
    if (falhaEm === 'aluno') throw new Error('Falha simulada no aluno');
    const id = String(filtro._id);
    if (!selecionados.has(id)) return { matchedCount: 0 };
    if (atualizacao.$set?.avatarSelecionado !== undefined) selecionados.set(id, atualizacao.$set.avatarSelecionado);
    return { matchedCount: 1 };
  });
  substituir(AvatarAluno, 'exists', filtro => ({
    session() { return this; },
    then(resolve, reject) {
      return Promise.resolve(inventario.some(item => item.aluno === String(filtro.aluno) && item.avatarId === filtro.avatarId) ? { _id: 'propriedade' } : null).then(resolve, reject);
    }
  }));
  substituir(AvatarAluno, 'find', filtro => ({
    select() { return this; },
    then(resolve, reject) {
      return Promise.resolve(inventario.filter(item => item.aluno === String(filtro.aluno))).then(resolve, reject);
    }
  }));
  substituir(AvatarAluno, 'create', async documentos => {
    if (falhaEm === 'propriedade') throw new Error('Falha simulada na propriedade');
    const criados = documentos.map(item => ({ ...item, aluno: String(item.aluno), _id: new mongoose.Types.ObjectId() }));
    if (criados.some(item => inventario.some(jaExiste => jaExiste.aluno === item.aluno && jaExiste.avatarId === item.avatarId))) {
      const erro = new Error('Duplicado'); erro.code = 11000; throw erro;
    }
    inventario.push(...criados);
    return criados;
  });
  substituir(MovimentacaoMoeda, 'aggregate', executarAgregacao);
  substituir(MovimentacaoMoeda, 'create', async documentos => {
    if (falhaEm === 'movimentacao') throw new Error('Falha simulada na movimentação');
    const criados = documentos.map(item => ({ ...item, aluno: String(item.aluno), _id: new mongoose.Types.ObjectId() }));
    ledger.push(...criados);
    return criados;
  });
  substituir(mongoose, 'startSession', async () => ({
    async withTransaction(operacao) {
      const anterior = bloqueio;
      let liberar;
      bloqueio = new Promise(resolve => { liberar = resolve; });
      await anterior;
      const ledgerAntes = [...ledger];
      const inventarioAntes = [...inventario];
      try { return await operacao(); }
      catch (erro) { ledger = ledgerAntes; inventario = inventarioAntes; throw erro; }
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
    ({ Aluno, AvatarAluno, MovimentacaoMoeda, mongoose })[nome][metodo] = original;
  }
  originais.clear();
});

after(async () => {
  if (jwtAnterior === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = jwtAnterior;
  await new Promise((resolve, reject) => servidor.close(erro => erro ? reject(erro) : resolve()));
});

test('catálogo tem seis opções fixas, preços definidos pelo servidor e requer aluno autenticado', async () => {
  assert.equal(catalogoAvatares.length, 6);
  assert.deepEqual(catalogoAvatares.map(item => item.preco), [10, 10, 20, 20, 30, 30]);
  assert.ok(catalogoAvatares.every(item => item.imagem === null));
  assert.equal((await request('/loja/avatares', { accessToken: null })).status, 401);
  const resposta = await request('/loja/avatares');
  assert.equal(resposta.status, 200);
  assert.equal((await resposta.json()).avatares.length, 6);
});

test('compra válida cobra preço fixo do catálogo e registra propriedade do token', async () => {
  ledger.push({ aluno: alunoA, tipo: 'ganho', quantidade: 50, motivo: 'Saldo' });
  const resposta = await request('/loja/avatares/avatar-03/comprar', { method: 'POST', body: { preco: 1, aluno: alunoB } });
  assert.equal(resposta.status, 400);
  const comprada = await request('/loja/avatares/avatar-03/comprar', { method: 'POST' });
  assert.equal(comprada.status, 201);
  assert.equal(ledger.at(-1).quantidade, 20);
  assert.equal(ledger.at(-1).aluno, alunoA);
  assert.equal(inventario.at(-1).aluno, alunoA);
  assert.equal(inventario.at(-1).avatarId, 'avatar-03');
});

test('saldo insuficiente e compra repetida não criam novo gasto ou propriedade', async () => {
  ledger.push({ aluno: alunoA, tipo: 'ganho', quantidade: 20, motivo: 'Saldo' });
  assert.equal((await request('/loja/avatares/avatar-05/comprar', { method: 'POST' })).status, 409);
  assert.equal(ledger.length, 1);
  assert.equal((await request('/loja/avatares/avatar-02/comprar', { method: 'POST' })).status, 201);
  assert.equal((await request('/loja/avatares/avatar-02/comprar', { method: 'POST' })).status, 409);
  assert.equal(ledger.length, 2);
  assert.equal(inventario.length, 1);
});

test('compras concorrentes do mesmo avatar resultam em uma cobrança', async () => {
  ledger.push({ aluno: alunoA, tipo: 'ganho', quantidade: 30, motivo: 'Saldo' });
  const respostas = await Promise.all([
    request('/loja/avatares/avatar-06/comprar', { method: 'POST' }),
    request('/loja/avatares/avatar-06/comprar', { method: 'POST' })
  ]);
  assert.deepEqual(respostas.map(item => item.status).sort(), [201, 409]);
  assert.equal(ledger.length, 2);
  assert.equal(inventario.length, 1);
});

test('compras simultâneas de avatares diferentes não ultrapassam o saldo disponível', async () => {
  ledger.push({ aluno: alunoA, tipo: 'ganho', quantidade: 20, motivo: 'Saldo inicial' });

  const resultados = await Promise.allSettled([
    comprarAvatar({ alunoId: alunoA, avatarId: 'avatar-teste-a', preco: 15 }),
    comprarAvatar({ alunoId: alunoA, avatarId: 'avatar-teste-b', preco: 15 })
  ]);

  const comprasConcluidas = resultados.filter(resultado => resultado.status === 'fulfilled');
  const comprasRejeitadas = resultados.filter(resultado => resultado.status === 'rejected');
  assert.equal(comprasConcluidas.length, 1);
  assert.equal(comprasRejeitadas.length, 1);
  assert.equal(comprasRejeitadas[0].reason.status, 409);

  const movimentacoesDeGasto = ledger.filter(item => item.tipo === 'gasto' && item.aluno === alunoA);
  const saldoFinal = ledger.filter(item => item.aluno === alunoA)
    .reduce((saldo, item) => saldo + (item.tipo === 'ganho' ? item.quantidade : -item.quantidade), 0);
  assert.equal(saldoFinal, 5);
  assert.equal(movimentacoesDeGasto.length, 1);
  assert.equal(inventario.filter(item => item.aluno === alunoA).length, 1);
});

test('seleção exige propriedade, e inventário e seleção ficam isolados por aluno', async () => {
  assert.equal((await request('/alunos/me/avatar', { method: 'PUT', body: { avatarId: 'avatar-01' } })).status, 409);
  ledger.push({ aluno: alunoA, tipo: 'ganho', quantidade: 10, motivo: 'Saldo' });
  assert.equal((await request('/loja/avatares/avatar-01/comprar', { method: 'POST' })).status, 201);
  assert.equal((await request('/alunos/me/avatar', { method: 'PUT', body: { avatarId: 'avatar-01' } })).status, 200);
  assert.equal(selecionados.get(alunoA), 'avatar-01');
  const catalogoB = await request('/loja/avatares', { accessToken: token('aluno', alunoB) });
  assert.equal((await catalogoB.json()).avatares[0].adquirido, false);
  assert.equal((await request('/alunos/me/avatar', { method: 'PUT', accessToken: token('aluno', alunoB), body: { avatarId: 'avatar-01' } })).status, 409);
  assert.equal(selecionados.get(alunoB), null);
});

test('selection validates its body and catalog and returns 404 when the student is missing', async () => {
  for (const body of [
    {},
    { avatarId: 1 },
    { avatarId: 'avatar-01', aluno: alunoA }
  ]) {
    const resposta = await request('/alunos/me/avatar', { method: 'PUT', body });
    assert.equal(resposta.status, 400);
    assert.deepEqual(await resposta.json(), { sucesso: false, mensagem: 'Informe somente avatarId.' });
  }

  const desconhecido = await request('/alunos/me/avatar', {
    method: 'PUT', body: { avatarId: 'avatar-inexistente' }
  });
  assert.equal(desconhecido.status, 404);
  assert.deepEqual(await desconhecido.json(), { sucesso: false, mensagem: 'Avatar não encontrado.' });

  inventario.push({ aluno: alunoC, avatarId: 'avatar-01' });
  const alunoAusente = await request('/alunos/me/avatar', {
    method: 'PUT',
    accessToken: token('aluno', alunoC),
    body: { avatarId: 'avatar-01' }
  });
  assert.equal(alunoAusente.status, 404);
  assert.deepEqual(await alunoAusente.json(), { sucesso: false, mensagem: 'Aluno não encontrado.' });
});

test('falhas em movimentação ou propriedade revertem ambas as gravações', async () => {
  ledger.push({ aluno: alunoA, tipo: 'ganho', quantidade: 20, motivo: 'Saldo' });
  for (const etapa of ['movimentacao', 'propriedade']) {
    falhaEm = etapa;
    const resposta = await request('/loja/avatares/avatar-03/comprar', { method: 'POST' });
    assert.equal(resposta.status, 500);
    assert.equal(ledger.length, 1);
    assert.equal(inventario.length, 0);
  }
});
