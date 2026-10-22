import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../src/app.js';
import Atividade from '../src/models/Atividade.js';
import ProgressoAtividade from '../src/models/ProgressoAtividade.js';

const segredoTeste = 'segredo-local-progresso-sem-dados-reais';
const atividadeId = '507f1f77bcf86cd799439401';
const alunoAId = '507f1f77bcf86cd799439402';
const alunoBId = '507f1f77bcf86cd799439403';
const questaoAId = '507f1f77bcf86cd799439404';
const questaoBId = '507f1f77bcf86cd799439405';
const alternativaAId = '507f1f77bcf86cd799439406';
const alternativaBId = '507f1f77bcf86cd799439407';
const alternativaCId = '507f1f77bcf86cd799439408';
const originais = new Map();
let atividades;
let progressos;
let servidor;
let baseUrl;
let jwtAnterior;

function substituir(modelo, metodo, implementacao) {
  const chave = `${modelo.modelName}#${metodo}`;
  if (!originais.has(chave)) originais.set(chave, modelo[metodo]);
  modelo[metodo] = implementacao;
}

function chave(aluno, atividade) {
  return `${String(aluno)}:${String(atividade)}`;
}

function instalarMocks() {
  atividades = new Map([[atividadeId, {
    _id: atividadeId,
    status: 'publicada',
    questoes: [
      { _id: questaoAId, alternativas: [{ _id: alternativaAId }, { _id: alternativaBId }] },
      { _id: questaoBId, alternativas: [{ _id: alternativaCId }, { _id: alternativaBId }] }
    ]
  }]]);
  progressos = new Map();
  substituir(Atividade, 'findById', async id => atividades.get(String(id)) ?? null);
  substituir(ProgressoAtividade, 'findOne', async filtro => progressos.get(chave(filtro.aluno, filtro.atividade)) ?? null);
  substituir(ProgressoAtividade, 'find', async filtro => [...progressos.values()].filter(item => String(item.aluno) === String(filtro.aluno)));
  const saveKey = `${ProgressoAtividade.modelName}#prototype.save`;
  if (!originais.has(saveKey)) originais.set(saveKey, ProgressoAtividade.prototype.save);
  ProgressoAtividade.prototype.save = async function salvarMock() {
    progressos.set(chave(this.aluno, this.atividade), this);
    return this;
  };
}

function token(tipo = 'aluno', subject = alunoAId) {
  return jwt.sign({ tipo, nome: 'Teste' }, segredoTeste, { subject, expiresIn: '5m' });
}

async function request(path, { method = 'GET', accessToken, body } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
}

const iniciar = (id = atividadeId, accessToken = token(), body = {}) => request(`/progresso/atividades/${id}/iniciar`, { method: 'POST', accessToken, body });
const enviarRespostas = (respostas, id = atividadeId, accessToken = token(), extras = {}) => request(`/progresso/atividades/${id}/respostas`, { method: 'PUT', accessToken, body: { respostas, ...extras } });
const concluir = (id = atividadeId, accessToken = token(), body = {}) => request(`/progresso/atividades/${id}/concluir`, { method: 'PATCH', accessToken, body });

before(async () => {
  jwtAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = segredoTeste;
  servidor = app.listen(0, '127.0.0.1');
  await new Promise(resolve => servidor.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${servidor.address().port}/api`;
});

beforeEach(instalarMocks);

afterEach(() => {
  for (const [chaveMetodo, original] of originais) {
    const [nomeModelo, caminhoMetodo] = chaveMetodo.split('#');
    const modelo = { Atividade, ProgressoAtividade }[nomeModelo];
    if (caminhoMetodo === 'prototype.save') modelo.prototype.save = original;
    else modelo[caminhoMetodo] = original;
  }
  originais.clear();
});

after(async () => {
  if (jwtAnterior === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = jwtAnterior;
  if (servidor) await new Promise((resolve, reject) => servidor.close(erro => erro ? reject(erro) : resolve()));
});

test('progresso exige autenticação e perfil de aluno', async () => {
  assert.equal((await request(`/progresso/atividades/${atividadeId}/iniciar`, { method: 'POST', body: {} })).status, 401);
  assert.equal((await iniciar(atividadeId, token('professor'))).status, 403);
  assert.equal((await request('/progresso', { accessToken: token('administrador', 'admin') })).status, 403);
  assert.equal(progressos.size, 0);
});

test('aluno inicia atividade publicada e o início é idempotente', async () => {
  const primeira = await iniciar();
  const corpo = await primeira.json();
  const repetida = await iniciar();
  const corpoRepetido = await repetida.json();

  assert.equal(primeira.status, 201);
  assert.equal(corpo.progresso.status, 'iniciada');
  assert.equal(String(corpo.progresso.aluno), alunoAId);
  assert.equal(String(corpo.progresso.atividade), atividadeId);
  assert.ok(corpo.progresso.iniciadaEm);
  assert.equal(repetida.status, 200);
  assert.equal(String(corpoRepetido.progresso._id), String(corpo.progresso._id));
  assert.equal(progressos.size, 1);
});

test('respostas são persistidas no progresso do aluno e recuperadas em nova consulta', async () => {
  await iniciar();
  const resposta = await enviarRespostas([
    { questaoId: questaoAId, alternativasSelecionadas: [alternativaAId, alternativaBId] },
    { questaoId: questaoBId, alternativasSelecionadas: [alternativaCId] }
  ]);
  const corpoResposta = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.equal(corpoResposta.progresso.respostas.length, 2);
  assert.ok(corpoResposta.progresso.respostasRegistradasEm);
  assert.deepEqual(corpoResposta.progresso.respostas[0].alternativasSelecionadas.map(String), [alternativaAId, alternativaBId]);

  const consulta = await request(`/progresso/atividades/${atividadeId}`, { accessToken: token() });
  const corpoConsulta = await consulta.json();
  assert.equal(consulta.status, 200);
  assert.deepEqual(corpoConsulta.progresso.respostas[1].alternativasSelecionadas.map(String), [alternativaCId]);
});

test('conclusão registra o estado e horário sem criar progresso duplicado', async () => {
  await iniciar();
  const resposta = await concluir();
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.equal(corpo.progresso.status, 'concluida');
  assert.ok(corpo.progresso.concluidaEm);
  assert.equal(progressos.size, 1);
  assert.equal((await concluir()).status, 200);
});

test('consultas e alterações são isoladas pela identidade do aluno no token', async () => {
  await iniciar();
  const tokenB = token('aluno', alunoBId);
  assert.equal((await request('/progresso', { accessToken: tokenB })).status, 200);
  const listaB = await (await request('/progresso', { accessToken: tokenB })).json();
  assert.deepEqual(listaB.progresso, []);
  assert.equal((await request(`/progresso/atividades/${atividadeId}`, { accessToken: tokenB })).status, 404);
  assert.equal((await enviarRespostas([{ questaoId: questaoAId, alternativasSelecionadas: [alternativaAId] }], atividadeId, tokenB)).status, 404);
  assert.equal((await concluir(atividadeId, tokenB)).status, 404);
  assert.equal(progressos.size, 1);
  assert.equal(progressos.get(chave(alunoAId, atividadeId)).status, 'iniciada');
});

test('não aceita identidade do aluno vinda do corpo', async () => {
  assert.equal((await iniciar(atividadeId, token(), { aluno: alunoBId })).status, 400);
  await iniciar();
  assert.equal((await enviarRespostas([], atividadeId, token(), { aluno: alunoBId })).status, 400);
  assert.equal(progressos.size, 1);
  assert.equal(String([...progressos.values()][0].aluno), alunoAId);
});

test('valida IDs, existência e publicação da atividade', async () => {
  assert.equal((await iniciar('id-invalido')).status, 400);
  assert.equal((await iniciar('507f1f77bcf86cd799439499')).status, 404);
  atividades.set('507f1f77bcf86cd799439498', { _id: '507f1f77bcf86cd799439498', status: 'rascunho', questoes: [] });
  assert.equal((await iniciar('507f1f77bcf86cd799439498')).status, 404);
  assert.equal((await concluir('id-invalido')).status, 400);
  assert.equal((await request('/progresso/atividades/id-invalido', { accessToken: token() })).status, 400);
});

test('rejeita respostas inválidas, duplicadas ou que não pertencem à atividade e questão', async () => {
  await iniciar();
  const invalidas = [
    { respostas: 'não é lista' },
    { respostas: [{ questaoId: 'id-invalido', alternativasSelecionadas: [alternativaAId] }] },
    { respostas: [{ questaoId: questaoAId, alternativasSelecionadas: ['507f1f77bcf86cd799439499'] }] },
    { respostas: [{ questaoId: questaoAId, alternativasSelecionadas: [] }] },
    { respostas: [
      { questaoId: questaoAId, alternativasSelecionadas: [alternativaAId] },
      { questaoId: questaoAId, alternativasSelecionadas: [alternativaBId] }
    ] },
    { respostas: [{ questaoId: questaoAId, alternativasSelecionadas: [alternativaAId, alternativaAId] }] },
    { respostas: [{ questaoId: questaoAId, alternativasSelecionadas: [alternativaCId] }] },
    { respostas: [{ questaoId: '507f1f77bcf86cd799439499', alternativasSelecionadas: [alternativaAId] }] },
    { respostas: [{ questaoId: questaoAId, alternativasSelecionadas: [alternativaAId], aluno: alunoBId }] }
  ];

  for (const corpo of invalidas) {
    const resposta = await request(`/progresso/atividades/${atividadeId}/respostas`, {
      method: 'PUT', accessToken: token(), body: corpo
    });
    assert.equal(resposta.status, 400);
  }
  assert.equal(progressos.get(chave(alunoAId, atividadeId)).respostas.length, 0);
});

test('respostas exigem atividade iniciada e operações não aceitam campos inesperados', async () => {
  const naoIniciada = await enviarRespostas([{ questaoId: questaoAId, alternativasSelecionadas: [alternativaAId] }]);
  assert.equal(naoIniciada.status, 404);
  assert.equal((await iniciar(atividadeId, token(), { status: 'concluida' })).status, 400);
  await iniciar();
  assert.equal((await concluir(atividadeId, token(), { aluno: alunoBId })).status, 400);
});

test('schema define unicidade aluno/atividade e valida status e respostas', async () => {
  const modelo = new ProgressoAtividade({ aluno: alunoAId, atividade: atividadeId });
  await modelo.validate();
  assert.equal(modelo.status, 'iniciada');
  assert.ok(ProgressoAtividade.schema.indexes().some(([campos, opcoes]) => campos.aluno === 1 && campos.atividade === 1 && opcoes.unique));

  const invalido = new ProgressoAtividade({
    aluno: alunoAId,
    atividade: atividadeId,
    respostas: [{ questaoId: questaoAId, alternativasSelecionadas: [alternativaAId, alternativaAId] }]
  });
  await assert.rejects(invalido.validate(), erro => erro.name === 'ValidationError');
  assert.equal(mongoose.isValidObjectId(atividadeId), true);
});
