import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../src/app.js';
import Aluno from '../src/models/Aluno.js';
import Atividade from '../src/models/Atividade.js';
import ProgressoAtividade from '../src/models/ProgressoAtividade.js';
import MovimentacaoMoeda from '../src/models/MovimentacaoMoeda.js';

const segredoTeste = 'segredo-local-progresso-sem-dados-reais';
const atividadeId = '507f1f77bcf86cd799439401';
const atividadeOrdem2Id = '507f1f77bcf86cd799439411';
const turmaAId = '507f1f77bcf86cd799439421';
const turmaBId = '507f1f77bcf86cd799439422';
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
let alunos;
let movimentacoes;
let filaTransacaoMoedas;
let servidor;
let baseUrl;
let jwtAnterior;

function substituir(modelo, metodo, implementacao) {
  const chaveMetodo = `${modelo.modelName ?? (modelo === mongoose ? 'mongoose' : 'model')}#${metodo}`;
  if (!originais.has(chaveMetodo)) originais.set(chaveMetodo, modelo[metodo]);
  modelo[metodo] = implementacao;
}

function chaveProgresso(aluno, atividade) {
  return `${String(aluno)}:${String(atividade)}`;
}

function instalarMocks() {
  movimentacoes = [];
  filaTransacaoMoedas = Promise.resolve();
  atividades = new Map([
    [atividadeId, {
      _id: atividadeId,
      turma: turmaAId,
      ordem: 1,
      status: 'publicada',
      questoes: [
        { _id: questaoAId, alternativas: [{ _id: alternativaAId }, { _id: alternativaBId }] },
        { _id: questaoBId, alternativas: [{ _id: alternativaCId }, { _id: alternativaBId }] }
      ]
    }],
    [atividadeOrdem2Id, {
      _id: atividadeOrdem2Id,
      turma: turmaAId,
      ordem: 2,
      status: 'publicada',
      questoes: [
        { _id: questaoAId, alternativas: [{ _id: alternativaAId }, { _id: alternativaBId }] }
      ]
    }]
  ]);

  progressos = new Map();

  alunos = new Map([
    [alunoAId, { _id: alunoAId, turma: turmaAId }],
    [alunoBId, { _id: alunoBId, turma: turmaBId }]
  ]);

  substituir(Atividade, 'findById', async id => atividades.get(String(id)) ?? null);
  substituir(Atividade, 'find', filtro => {
    let ordenacao = null;
    const resultado = () => [...atividades.values()].filter(atividade => {
      if (filtro?.turma && String(atividade.turma) !== String(filtro.turma)) return false;
      if (filtro?.status && atividade.status !== filtro.status) return false;
      if (filtro?._id?.$in && !filtro._id.$in.some(id => String(id) === String(atividade._id))) return false;
      return true;
    });
    return {
      select() { return this; },
      sort(spec) { ordenacao = spec; return this; },
      then(resolve, reject) {
        const lista = resultado();
        if (ordenacao) lista.sort((a, b) => Number(a.ordem) - Number(b.ordem) || String(a._id).localeCompare(String(b._id)));
        return Promise.resolve(lista).then(resolve, reject);
      }
    };
  });

  substituir(Atividade, 'findOne', async filtro => {
    if (!filtro) return [...atividades.values()][0] ?? null;
    return [...atividades.values()].find(a => {
      if (filtro._id && String(a._id) !== String(filtro._id)) return false;
      if (filtro.turma && String(a.turma) !== String(filtro.turma)) return false;
      if (filtro.ordem !== undefined && Number(a.ordem) !== Number(filtro.ordem)) return false;
      if (filtro.status && a.status !== filtro.status) return false;
      return true;
    }) ?? null;
  });

  substituir(ProgressoAtividade, 'findOne', async filtro => {
    let lista = [...progressos.values()];
    if (filtro?.aluno) lista = lista.filter(p => String(p.aluno) === String(filtro.aluno));
    if (filtro?.atividade) lista = lista.filter(p => String(p.atividade) === String(filtro.atividade));
    if (filtro?._id) lista = lista.filter(p => String(p._id) === String(filtro._id));
    if (filtro?.status) lista = lista.filter(p => p.status === filtro.status);
    const doc = lista[0] ?? null;
    if (doc) {
      // Anexa o método save para evitar o erro 500 no controller
      doc.save = ProgressoAtividade.prototype.save.bind(doc);
    }
    return doc;
  });

  substituir(ProgressoAtividade, 'find', async filtro => {
    let lista = [...progressos.values()];
    if (filtro?.aluno) lista = lista.filter(p => String(p.aluno) === String(filtro.aluno));
    return lista.map(doc => {
      doc.save = ProgressoAtividade.prototype.save.bind(doc);
      return doc;
    });
  });

  substituir(Aluno, 'findById', id => ({ select: async () => alunos.get(String(id)) ?? null }));
  substituir(Aluno, 'updateOne', async filtro => ({ matchedCount: alunos.has(String(filtro._id)) ? 1 : 0 }));
  substituir(MovimentacaoMoeda, 'create', async documentos => {
    const criados = documentos.map(documento => ({ ...documento, _id: new mongoose.Types.ObjectId(), createdAt: new Date() }));
    movimentacoes.push(...criados);
    return criados;
  });
  substituir(MovimentacaoMoeda, 'aggregate', () => {
    const saldo = movimentacoes.reduce((total, item) => total + (item.tipo === 'ganho' ? item.quantidade : -item.quantidade), 0);
    return { session() { return this; }, then(resolve, reject) { return Promise.resolve(saldo ? [{ saldo }] : []).then(resolve, reject); } };
  });
  substituir(mongoose, 'startSession', async () => ({
    async withTransaction(operacao) {
      const anterior = filaTransacaoMoedas;
      let liberar;
      filaTransacaoMoedas = new Promise(resolve => { liberar = resolve; });
      await anterior;
      try { return await operacao(); }
      finally { liberar(); }
    },
    async endSession() {}
  }));
  const saveKey = `${ProgressoAtividade.modelName}#prototype.save`;
  if (!originais.has(saveKey)) originais.set(saveKey, ProgressoAtividade.prototype.save);
  ProgressoAtividade.prototype.save = async function salvarMock() {
    if (!this._id) this._id = new mongoose.Types.ObjectId();
    const documentoSalvo = {
      ...this,
      _id: this._id,
      aluno: this.aluno,
      atividade: this.atividade,
      status: this.status || 'iniciada',
      respostas: this.respostas || [],
      respostasRegistradasEm: this.respostasRegistradasEm || new Date(),
      concluidaEm: this.concluidaEm,
      iniciadaEm: this.iniciadaEm || new Date()
    };
    progressos.set(chaveProgresso(this.aluno, this.atividade), documentoSalvo);
    Object.assign(this, documentoSalvo);
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
    const modelo = { Atividade, ProgressoAtividade, Aluno, MovimentacaoMoeda, mongoose }[nomeModelo];
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

test('respostas são persistidas no progresso do aluno, atualizam respostasRegistradasEm e são recuperadas', async () => {
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
  assert.equal(movimentacoes.filter(item => item.tipo === 'ganho').length, 1);
  assert.equal(movimentacoes[0].quantidade, 10);
  atividades.get(atividadeId).titulo = 'Título editado depois da recompensa';
  assert.equal((await concluir()).status, 200);
  assert.equal(movimentacoes[0].quantidade, 10);
  assert.equal(movimentacoes.filter(item => item.tipo === 'ganho').length, 1);
});

test('conclusões concedem a recompensa de cada atividade e não repetem ganhos', async () => {
  const recompensaAnterior = process.env.MOEDAS_RECOMPENSA_CONCLUSAO;
  process.env.MOEDAS_RECOMPENSA_CONCLUSAO = '11';
  atividades.get(atividadeId).recompensaMoedas = 3;
  atividades.get(atividadeOrdem2Id).recompensaMoedas = 17;

  try {
    await iniciar(atividadeId);
    assert.equal((await concluir(atividadeId)).status, 200);
    await iniciar(atividadeOrdem2Id);
    assert.equal((await concluir(atividadeOrdem2Id)).status, 200);
    assert.equal((await concluir(atividadeOrdem2Id)).status, 200);

    const ganhos = movimentacoes.filter(item => item.tipo === 'ganho');
    assert.deepEqual(ganhos.map(item => item.quantidade), [3, 17]);
    assert.deepEqual(ganhos.map(item => String(item.atividade)), [atividadeId, atividadeOrdem2Id]);
    assert.equal(progressos.get(chaveProgresso(alunoAId, atividadeOrdem2Id)).status, 'concluida');
    assert.equal((await (await request('/moedas/saldo', { accessToken: token() })).json()).saldo, 20);
  } finally {
    if (recompensaAnterior === undefined) delete process.env.MOEDAS_RECOMPENSA_CONCLUSAO;
    else process.env.MOEDAS_RECOMPENSA_CONCLUSAO = recompensaAnterior;
  }
});

test('atividade legada sem recompensa usa a configuração global compatível', async () => {
  const recompensaAnterior = process.env.MOEDAS_RECOMPENSA_CONCLUSAO;
  process.env.MOEDAS_RECOMPENSA_CONCLUSAO = '7';
  try {
    assert.equal(atividades.get(atividadeId).recompensaMoedas, undefined);
    await iniciar();
    assert.equal((await concluir()).status, 200);
    assert.equal(movimentacoes.find(item => item.tipo === 'ganho').quantidade, 7);
  } finally {
    if (recompensaAnterior === undefined) delete process.env.MOEDAS_RECOMPENSA_CONCLUSAO;
    else process.env.MOEDAS_RECOMPENSA_CONCLUSAO = recompensaAnterior;
  }
});

test('conclusões repetidas e simultâneas concedem somente uma recompensa', async () => {
  await iniciar();
  const respostas = await Promise.all([concluir(), concluir()]);
  assert.deepEqual(respostas.map(resposta => resposta.status), [200, 200]);
  assert.equal(progressos.size, 1);
  assert.equal(movimentacoes.filter(item => item.tipo === 'ganho' && String(item.atividade) === atividadeId).length, 1);
});

test('consultas e alterações são isoladas pela identidade do aluno no token', async () => {
  await iniciar();
  const tokenB = token('aluno', alunoBId);
  assert.equal((await request('/progresso', { accessToken: tokenB })).status, 200);
  const listaB = await (await request('/progresso', { accessToken: tokenB })).json();
  assert.deepEqual(listaB.progresso, []);
  // A atividade existe, mas pertence a outra turma do aluno.
  assert.equal((await request(`/progresso/atividades/${atividadeId}`, { accessToken: tokenB })).status, 403);

  // As alterações (PUT e PATCH) esbarram na proteção de turma e devolvem 403
  assert.equal((await enviarRespostas([{ questaoId: questaoAId, alternativasSelecionadas: [alternativaAId] }], atividadeId, tokenB)).status, 403);
  assert.equal((await concluir(atividadeId, tokenB)).status, 403);
  assert.equal(progressos.size, 1);
  assert.equal(progressos.get(chaveProgresso(alunoAId, atividadeId)).status, 'iniciada');
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
  assert.equal(progressos.get(chaveProgresso(alunoAId, atividadeId)).respostas.length, 0);
});

test('respostas exigem atividade iniciada e operações não aceitam campos inesperados', async () => {
  const naoIniciada = await enviarRespostas([{ questaoId: questaoAId, alternativasSelecionadas: [alternativaAId] }]);
  assert.equal(naoIniciada.status, 404);
  assert.equal((await iniciar(atividadeId, token(), { status: 'concluida' })).status, 400);
  await iniciar();
  assert.equal((await concluir(atividadeId, token(), { aluno: alunoBId })).status, 400);
  assert.equal((await concluir(atividadeId, token(), { recompensa: 100, quantidade: 100 })).status, 400);
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

test('GET /progresso rejeita aluno inexistente e omite progresso de outra turma, draft ou atividade ausente', async () => {
  await iniciar();
  const atividadeOutraTurmaId = '507f1f77bcf86cd799439412';
  const atividadeRascunhoId = '507f1f77bcf86cd799439413';
  atividades.set(atividadeOutraTurmaId, { _id: atividadeOutraTurmaId, status: 'publicada', turma: turmaBId, ordem: 1, questoes: [] });
  atividades.set(atividadeRascunhoId, { _id: atividadeRascunhoId, status: 'rascunho', turma: turmaAId, ordem: 2, questoes: [] });
  progressos.set(chaveProgresso(alunoAId, atividadeOutraTurmaId), { aluno: alunoAId, atividade: atividadeOutraTurmaId, status: 'concluida' });
  progressos.set(chaveProgresso(alunoAId, atividadeRascunhoId), { aluno: alunoAId, atividade: atividadeRascunhoId, status: 'iniciada' });
  progressos.set(chaveProgresso(alunoAId, '507f1f77bcf86cd799439414'), { aluno: alunoAId, atividade: '507f1f77bcf86cd799439414', status: 'iniciada' });

  const resposta = await request('/progresso', { accessToken: token() });
  const corpo = await resposta.json();
  assert.equal(resposta.status, 200);
  assert.deepEqual(corpo.progresso.map(item => String(item.atividade)), [atividadeId]);
  assert.equal((await request('/progresso', { accessToken: token('aluno', '507f1f77bcf86cd799439415') })).status, 404);
});

test('GET de progresso individual exige atividade publicada e vínculo com a turma atual', async () => {
  await iniciar();
  assert.equal((await request(`/progresso/atividades/${atividadeId}`, { accessToken: token('aluno', alunoBId) })).status, 403);
  atividades.get(atividadeId).status = 'rascunho';
  assert.equal((await request(`/progresso/atividades/${atividadeId}`, { accessToken: token() })).status, 404);
});

test('1 e 2: primeira atividade é permitida, a segunda permanece bloqueada sem a primeira concluída', async () => {
  const tokenA = token('aluno', alunoAId);
  assert.equal((await iniciar(atividadeId, tokenA)).status, 201); // Ordem 1
  assert.equal((await iniciar(atividadeOrdem2Id, tokenA)).status, 403); // Ordem 2 bloqueada
  assert.equal((await concluir(atividadeId, tokenA)).status, 200);
  assert.equal((await iniciar(atividadeOrdem2Id, tokenA)).status, 201);
});

test('mapa mostra a primeira missão aberta e libera a próxima após conclusão da predecessora', async () => {
  const caminho = `/progresso/turma/${turmaAId}/mapa`;
  const antes = await request(caminho, { accessToken: token() });
  const mapaAntes = await antes.json();
  assert.equal(antes.status, 200);
  assert.deepEqual(mapaAntes.mapaMissoes.map(item => item.desbloqueada), [true, false]);

  await iniciar(atividadeId);
  await concluir(atividadeId);
  const depois = await request(caminho, { accessToken: token() });
  const mapaDepois = await depois.json();
  assert.deepEqual(mapaDepois.mapaMissoes.map(item => item.desbloqueada), [true, true]);
});

test('3 e 4: envio de respostas e conclusão em atividade bloqueada retorna 403', async () => {
  const tokenA = token('aluno', alunoAId);
  assert.equal((await enviarRespostas([{ questaoId: questaoAId, alternativasSelecionadas: [alternativaAId] }], atividadeOrdem2Id, tokenA)).status, 403);
  assert.equal((await concluir(atividadeOrdem2Id, tokenA)).status, 403);
});

test('5, 6 e 7: trata lacunas, ordens duplicadas e ignora desbloqueios automáticos sem ordem válida', async () => {
  const atividadeLacunaId = '507f1f77bcf86cd799439499';
  const atividadeSemOrdemId = '507f1f77bcf86cd799439498';
  atividades.set(atividadeLacunaId, { _id: atividadeLacunaId, turma: turmaAId, ordem: 4, status: 'publicada', questoes: [] });
  atividades.set(atividadeSemOrdemId, { _id: atividadeSemOrdemId, turma: turmaAId, ordem: null, status: 'publicada', questoes: [] });
  assert.equal((await iniciar(atividadeLacunaId, token())).status, 403);
  assert.equal((await iniciar(atividadeSemOrdemId, token())).status, 403);
});

test('não permite ordens duplicadas no schema de atividades', async () => {
  assert.ok(Atividade.schema.indexes().some(([campos, opcoes]) =>
    campos.turma === 1 && campos.ordem === 1 && opcoes.unique
  ));
});

test('8: aluno não consegue acessar mapa, iniciar, responder ou concluir atividades de outra turma', async () => {
  const tokenB = token('aluno', alunoBId); // Turma B
  assert.equal((await request(`/progresso/turma/${turmaAId}/mapa`, { accessToken: tokenB })).status, 403);
  assert.equal((await iniciar(atividadeId, tokenB)).status, 403);
  assert.equal((await enviarRespostas([], atividadeId, tokenB)).status, 403);
  assert.equal((await concluir(atividadeId, tokenB)).status, 403);
});

test('9: respostasRegistradasEm é persistido e recuperado corretamente', async () => {
  await iniciar(atividadeId, token());
  const resposta = await enviarRespostas([{ questaoId: questaoAId, alternativasSelecionadas: [alternativaAId] }], atividadeId, token());
  const corpo = await resposta.json();
  assert.equal(resposta.status, 200);
  assert.ok(corpo.progresso.respostasRegistradasEm);
});

test('recupera colisao MongoDB 11000 no inicio e retorna o progresso que apareceu', async () => {
  const salvarMock = ProgressoAtividade.prototype.save;
  let primeiraTentativa = true;
  ProgressoAtividade.prototype.save = async function salvarComColisao() {
    if (primeiraTentativa) {
      primeiraTentativa = false;
      await salvarMock.call(this);
      const erro = new Error('Colisao de chave unica simulada');
      erro.code = 11000;
      throw erro;
    }
    return salvarMock.call(this);
  };

  const resposta = await iniciar();
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.equal(corpo.sucesso, true);
  assert.equal(corpo.progresso.status, 'iniciada');
  assert.equal(String(corpo.progresso.aluno), alunoAId);
  assert.equal(String(corpo.progresso.atividade), atividadeId);
  assert.equal(progressos.size, 1);
});

test('falha ao registrar recompensa reverte a conclusao e nao deixa movimento parcial', async () => {
  await iniciar();

  substituir(MovimentacaoMoeda, 'create', async () => {
    throw new Error('Falha simulada ao registrar recompensa');
  });
  substituir(mongoose, 'startSession', async () => ({
    async withTransaction(operacao) {
      const progressosAntes = new Map([...progressos].map(([chave, progresso]) => [chave, {
        ...progresso,
        respostas: []
      }]));
      const totalMovimentacoesAntes = movimentacoes.length;
      try {
        return await operacao();
      } catch (erro) {
        progressos = progressosAntes;
        movimentacoes.length = totalMovimentacoesAntes;
        throw erro;
      }
    },
    async endSession() {}
  }));

  const resposta = await concluir();
  const corpo = await resposta.json();
  const progresso = progressos.get(chaveProgresso(alunoAId, atividadeId));

  assert.equal(resposta.status, 500);
  assert.deepEqual(corpo, { sucesso: false, mensagem: 'Ocorreu um erro interno no servidor.' });
  assert.equal(progresso.status, 'iniciada');
  assert.equal(progresso.concluidaEm, null);
  assert.equal(movimentacoes.length, 0);
});
