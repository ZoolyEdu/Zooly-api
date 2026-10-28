import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../src/app.js';
import Atividade from '../src/models/Atividade.js';
import ProgressoAtividade from '../src/models/ProgressoAtividade.js';
import Historia from '../src/models/Historia.js';
import Professor from '../src/models/Professor.js';
import Turma from '../src/models/Turma.js';
import MovimentacaoMoeda from '../src/models/MovimentacaoMoeda.js';

const segredoTeste = 'segredo-local-atividades-sem-dados-reais';
const professorId = '507f1f77bcf86cd799439310';
const professorAlternativoId = '507f1f77bcf86cd799439311';
const escolaId = '507f1f77bcf86cd799439300';
const turmaId = '507f1f77bcf86cd799439320';
const historiaId = '507f1f77bcf86cd799439330';
const atividadeId = '507f1f77bcf86cd799439350';
const atividadeOutraId = '507f1f77bcf86cd799439352';
const questaoId = '507f1f77bcf86cd799439351';
const questaoOutraId = '507f1f77bcf86cd799439353';
const questaoOutraAtividadeId = '507f1f77bcf86cd799439354';
const alternativaAId = '507f1f77bcf86cd799439341';
const alternativaBId = '507f1f77bcf86cd799439342';
const alternativaCId = '507f1f77bcf86cd799439343';
const alternativaDId = '507f1f77bcf86cd799439344';
const alternativaEId = '507f1f77bcf86cd799439345';
const alternativaOutraAtividadeId = '507f1f77bcf86cd799439346';

const originais = new Map();
let servidor;
let baseUrl;
let turmas;
let historias;
let atividades;
let progressosRelacionados;
let movimentacoesRelacionadas;
let chamadas;
let jwtAnterior;

function substituir(modelo, metodo, implementacao) {
  const nomeModelo = modelo.modelName ?? (modelo === mongoose ? 'mongoose' : 'model');
  const chave = `${nomeModelo}#${metodo}`;
  const [alvo, nomeMetodo] = metodo.includes('.') ? metodo.split('.') : ['static', metodo];
  const objeto = alvo === 'prototype' ? modelo.prototype : modelo;
  if (!originais.has(chave)) originais.set(chave, objeto[nomeMetodo]);
  objeto[nomeMetodo] = implementacao;
}

function instalarMocks() {
  turmas = new Map([
    [turmaId, { _id: turmaId, escola: escolaId, professorResponsavel: professorId, arquivada: false }],
    ['507f1f77bcf86cd799439321', {
      _id: '507f1f77bcf86cd799439321',
      escola: escolaId,
      professorResponsavel: professorAlternativoId,
      arquivada: false
    }],
    ['507f1f77bcf86cd799439322', {
      _id: '507f1f77bcf86cd799439322', escola: escolaId, professorResponsavel: professorId, arquivada: true
    }]
  ]);
  historias = new Map([[historiaId, { _id: historiaId, titulo: 'História oficial', conteudo: 'Conteúdo oficial.' }]]);
  atividades = new Map();
  progressosRelacionados = new Map();
  movimentacoesRelacionadas = new Map();
  chamadas = {
    turma: [], historia: [], atividade: [], criacao: 0,
    filtroLista: null, projecaoLista: null, ordenacao: null, filtroTurmas: null,
    projecaoTurmas: null, exclusao: 0, progressosExcluidos: 0, movimentosDesvinculados: 0
  };

  substituir(Turma, 'findById', async id => {
    chamadas.turma.push(String(id));
    return turmas.get(String(id)) ?? null;
  });
  substituir(Professor, 'findById', id => ({
    select: async () => String(id) === professorId ? { _id: professorId, escolas: [escolaId] } : { _id: id, escolas: [] }
  }));
  substituir(Turma, 'find', filtro => {
    chamadas.filtroTurmas = filtro;
    return { select: async projecao => {
      chamadas.projecaoTurmas = projecao;
      // Intencionalmente devolve todas as turmas: a rota deve rejeitar as arquivadas
      // e as escolas externas mesmo se o resultado do modelo for excessivamente amplo.
      return [...turmas.values()].map(turma => ({ _id: turma._id, escola: turma.escola, arquivada: turma.arquivada }));
    } };
  });
  substituir(Historia, 'findById', async id => {
    chamadas.historia.push(String(id));
    return historias.get(String(id)) ?? null;
  });
  substituir(Atividade, 'findById', async id => {
    chamadas.atividade.push(String(id));
    const encontrada = atividades.get(String(id));
    return encontrada ? new Atividade(encontrada) : null;
  });
  substituir(ProgressoAtividade, 'exists', async filtro => progressosRelacionados.get(String(filtro.atividade)) ?? null);
  substituir(ProgressoAtividade, 'deleteMany', async (filtro, options) => {
    assert.ok(options.session);
    chamadas.progressosExcluidos += 1;
    const encontrado = progressosRelacionados.get(String(filtro.atividade));
    if (encontrado) progressosRelacionados.delete(String(filtro.atividade));
    return { deletedCount: encontrado ? 1 : 0 };
  });
  substituir(MovimentacaoMoeda, 'exists', async filtro => movimentacoesRelacionadas.get(String(filtro.atividade)) ?? null);
  substituir(MovimentacaoMoeda, 'updateMany', async (filtro, update, options) => {
    assert.ok(options.session);
    chamadas.movimentosDesvinculados += 1;
    const movimento = movimentacoesRelacionadas.get(String(filtro.atividade));
    if (movimento) delete movimento.atividade;
    return { modifiedCount: movimento ? 1 : 0 };
  });
  substituir(mongoose, 'startSession', async () => ({
    async withTransaction(operacao) {
      const snapshotProgressos = new Map(progressosRelacionados);
      const snapshotMovimentos = new Map([...movimentacoesRelacionadas].map(([key, value]) => [key, { ...value }]));
      const snapshotAtividades = new Map(atividades);
      try { return await operacao(); }
      catch (error) {
        progressosRelacionados = snapshotProgressos;
        movimentacoesRelacionadas = snapshotMovimentos;
        atividades = snapshotAtividades;
        throw error;
      }
    },
    async endSession() {}
  }));
  substituir(Atividade, 'exists', async filtro => {
    const encontrada = [...atividades.values()].find(atividade =>
      String(atividade.turma) === String(filtro.turma) && Number(atividade.ordem) === Number(filtro.ordem)
    );
    return encontrada ? { _id: encontrada._id } : null;
  });
  substituir(Atividade, 'find', filtro => {
    chamadas.filtroLista = filtro;
    const resultados = () => [...atividades.values()].filter(atividade => {
      if (filtro.status && atividade.status !== filtro.status) return false;
      if (filtro.turma && !Array.isArray(filtro.turma.$in) && String(filtro.turma) !== String(atividade.turma)) return false;
      if (filtro.turma?.$in && !filtro.turma.$in.some(turma => String(turma) === String(atividade.turma))) return false;
      if (filtro._id?.$in && !filtro._id.$in.some(id => String(id) === String(atividade._id))) return false;
      return true;
    });
    return {
      select: function (projecao) {
        chamadas.projecaoLista = projecao;
        return this;
      },
      sort: async ordenacao => {
        chamadas.ordenacao = ordenacao;
        return resultados()
          .map(atividade => JSON.parse(JSON.stringify(atividade)))
          .sort((a, b) => {
            const porData = new Date(a.publicadoEm) - new Date(b.publicadoEm);
            return porData || String(a._id).localeCompare(String(b._id));
          });
      },
      then: (resolve, reject) => Promise.resolve(resultados()).then(resolve, reject)
    };
  });
  substituir(Atividade, 'prototype.save', async function salvarMock() {
    chamadas.criacao += 1;
    atividades.set(String(this._id), this.toObject());
    return this;
  });
  substituir(Atividade, 'prototype.deleteOne', async function excluirMock() {
    chamadas.exclusao += 1;
    atividades.delete(String(this._id));
    return { deletedCount: 1 };
  });
}

function emitirToken(tipo = 'professor', subject = professorId) {
  return jwt.sign({ tipo, nome: 'Teste' }, segredoTeste, { subject, expiresIn: '5m' });
}

function atividadeBody(overrides = {}) {
  return {
    turma: turmaId,
    titulo: 'Atividade de leitura',
    historia: { tipo: 'oficial', historiaId },
    questoes: [{
      enunciado: 'Quais respostas estão corretas?',
      alternativas: [
        { _id: alternativaAId, texto: 'Alternativa A' },
        { _id: alternativaBId, texto: 'Alternativa B' }
      ],
      respostasCorretas: [alternativaAId]
    }],
    ...overrides
  };
}

async function post(body, accessToken) {
  return fetch(`${baseUrl}/atividades`, {
    method: 'POST',
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

async function put(id, body, accessToken) {
  return fetch(`${baseUrl}/atividades/${id}`, {
    method: 'PUT',
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

async function patch(id, body = {}, accessToken) {
  return fetch(`${baseUrl}/atividades/${id}/publicar`, {
    method: 'PATCH',
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

async function remover(id, accessToken) {
  return fetch(`${baseUrl}/atividades/${id}`, {
    method: 'DELETE',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
  });
}

async function listarPublicadas(accessToken) {
  return fetch(`${baseUrl}/atividades/publicadas`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
  });
}

function registrarAtividade(status = 'rascunho', autor = professorId) {
  const atividade = new Atividade({
    ...atividadeBody({
      questoes: [{
        _id: questaoId,
        enunciado: 'Enunciado anterior',
        alternativas: [
          { _id: alternativaAId, texto: 'Anterior A' },
          { _id: alternativaBId, texto: 'Anterior B' }
        ],
        respostasCorretas: [alternativaAId]
      }, {
        _id: questaoOutraId,
        enunciado: 'Outra questão anterior',
        alternativas: [
          { _id: alternativaDId, texto: 'Anterior D' },
          { _id: alternativaEId, texto: 'Anterior E' }
        ],
        respostasCorretas: [alternativaDId]
      }]
    }),
    _id: atividadeId,
    professorCriador: autor,
    status,
    publicadoEm: status === 'publicada' ? new Date('2026-09-01T12:00:00.000Z') : null
  });
  atividades.set(atividadeId, atividade.toObject());
}

function registrarOutraAtividade() {
  const atividade = new Atividade({
    ...atividadeBody({
      questoes: [{
        _id: questaoOutraAtividadeId,
        enunciado: 'Questão de outra atividade',
        alternativas: [
          { _id: alternativaOutraAtividadeId, texto: 'Outra A' },
          { _id: alternativaEId, texto: 'Outra B' }
        ],
        respostasCorretas: [alternativaOutraAtividadeId]
      }]
    }),
    _id: atividadeOutraId,
    professorCriador: professorId
  });
  atividades.set(atividadeOutraId, atividade.toObject());
}

function edicaoBody(overrides = {}) {
  return {
    titulo: 'Atividade revisada',
    historia: { tipo: 'oficial', historiaId },
    questoes: [{
      _id: questaoId,
      enunciado: 'Novo enunciado',
      alternativas: [
        { _id: alternativaAId, texto: 'Nova alternativa A' },
        { texto: 'Nova alternativa C' }
      ],
      respostasCorretas: [alternativaAId]
    }],
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
    const [nomeModelo, nomeMetodo] = chave.split('#');
    const modelo = { Professor, Turma, Historia, Atividade, ProgressoAtividade, MovimentacaoMoeda, mongoose }[nomeModelo];
    const [alvo, nome] = nomeMetodo.includes('.') ? nomeMetodo.split('.') : ['static', nomeMetodo];
    const objeto = alvo === 'prototype' ? modelo.prototype : modelo;
    objeto[nome] = metodoOriginal;
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

test('POST /api/atividades exige token e rejeita token inválido', async () => {
  assert.equal((await post(atividadeBody())).status, 401);
  const tokenInvalido = jwt.sign({ tipo: 'professor' }, 'segredo-diferente', { subject: professorId });
  assert.equal((await post(atividadeBody(), tokenInvalido)).status, 401);
  assert.deepEqual(chamadas.turma, []);
});

test('POST /api/atividades rejeita perfis que não sejam professor', async () => {
  assert.equal((await post(atividadeBody(), emitirToken('aluno', '507f1f77bcf86cd799439399'))).status, 403);
  assert.equal((await post(atividadeBody(), emitirToken('administrador', '507f1f77bcf86cd799439398'))).status, 403);
  assert.deepEqual(chamadas.turma, []);
});

test('retorna 404 para turma inexistente ou arquivada', async () => {
  const inexistente = '507f1f77bcf86cd799439329';
  assert.equal((await post(atividadeBody({ turma: inexistente }), emitirToken())).status, 404);
  assert.equal((await post(atividadeBody({ turma: '507f1f77bcf86cd799439322' }), emitirToken())).status, 404);
  assert.equal(chamadas.criacao, 0);
});

test('professor que não é responsável pela turma recebe 403, mesmo que esteja na mesma escola', async () => {
  const turmaOutroResponsavel = '507f1f77bcf86cd799439321';
  const turma = turmas.get(turmaOutroResponsavel);
  const escolasDoProfessorAutenticado = [escolaId];
  const escolasDoProfessorResponsavel = [escolaId];

  assert.ok(escolasDoProfessorAutenticado.includes(turma.escola));
  assert.ok(escolasDoProfessorResponsavel.includes(turma.escola));
  assert.notEqual(turma.professorResponsavel, professorId);

  const resposta = await post(atividadeBody({ turma: turmaOutroResponsavel }), emitirToken());

  assert.equal(resposta.status, 403);
  assert.equal(chamadas.criacao, 0);
  assert.equal(chamadas.turma.at(-1), turmaOutroResponsavel);
});

test('cria atividade válida como rascunho e atribui o autor pelo token', async () => {
  const resposta = await post(atividadeBody(), emitirToken());
  const corpo = await resposta.json();

  assert.equal(resposta.status, 201);
  assert.equal(corpo.sucesso, true);
  assert.equal(corpo.atividade.status, 'rascunho');
  assert.equal(String(corpo.atividade.professorCriador), professorId);
  assert.equal(String(corpo.atividade.turma), turmaId);
  assert.equal(corpo.atividade.titulo, 'Atividade de leitura');
  assert.equal(chamadas.criacao, 1);
  assert.deepEqual(chamadas.historia, [historiaId]);
  assert.equal(atividades.size, 1);
});

test('cria atividade com texto próprio sem consultar nem alterar histórias oficiais', async () => {
  const resposta = await post(atividadeBody({
    historia: { tipo: 'propria', texto: 'Texto escrito para esta atividade.' }
  }), emitirToken());
  const corpo = await resposta.json();

  assert.equal(resposta.status, 201);
  assert.equal(corpo.atividade.historia.tipo, 'propria');
  assert.equal(chamadas.historia.length, 0);
});

test('retorna 404 quando a história oficial não existe', async () => {
  const inexistente = '507f1f77bcf86cd799439339';
  const resposta = await post(atividadeBody({
    historia: { tipo: 'oficial', historiaId: inexistente }
  }), emitirToken());

  assert.equal(resposta.status, 404);
  assert.equal(chamadas.criacao, 0);
  assert.deepEqual(chamadas.historia, [inexistente]);
});

test('rejeita status enviado pelo cliente e campos protegidos ou inesperados', async () => {
  for (const body of [
    atividadeBody({ status: 'publicada' }),
    atividadeBody({ professorCriador: professorAlternativoId }),
    atividadeBody({ _id: new mongoose.Types.ObjectId().toString() }),
    atividadeBody({ questoes: [{ ...atividadeBody().questoes[0], peso: 10 }] }),
    atividadeBody({ historia: { tipo: 'propria', texto: 'Texto', ativo: true } })
  ]) {
    const resposta = await post(body, emitirToken());
    assert.equal(resposta.status, 400);
  }

  assert.equal(chamadas.criacao, 0);
});

test('rejeita ordem manual ausente de inteiro positivo', async () => {
  for (const ordem of [0, -1, 1.5, '2', null]) {
    const resposta = await post(atividadeBody({ ordem }), emitirToken());
    assert.equal(resposta.status, 400, `ordem inválida: ${String(ordem)}`);
  }
  assert.equal(chamadas.criacao, 0);
});

test('cria atividade com recompensa configurada e rejeita valores inválidos', async () => {
  const criada = await post(atividadeBody({ recompensaMoedas: 25 }), emitirToken());
  const corpo = await criada.json();
  assert.equal(criada.status, 201);
  assert.equal(corpo.atividade.recompensaMoedas, 25);

  for (const recompensaMoedas of [0, -1, 1.5, '10', null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal((await post(atividadeBody({ recompensaMoedas }), emitirToken())).status, 400);
  }
});

test('rejeita IDs malformados da turma ou da história oficial', async () => {
  assert.equal((await post(atividadeBody({ turma: 'turma-invalida' }), emitirToken())).status, 400);
  assert.equal((await post(atividadeBody({
    historia: { tipo: 'oficial', historiaId: 'historia-invalida' }
  }), emitirToken())).status, 400);
  assert.equal(chamadas.criacao, 0);
});

test('rejeita dados inválidos de questões, alternativas e respostas corretas', async () => {
  const umaAlternativa = atividadeBody();
  umaAlternativa.questoes[0].alternativas.pop();

  const respostaQueNaoPertence = atividadeBody();
  respostaQueNaoPertence.questoes[0].respostasCorretas = [new mongoose.Types.ObjectId().toString()];

  const origemAmbigua = atividadeBody({
    historia: { tipo: 'oficial', historiaId, texto: 'Texto adicional.' }
  });

  for (const body of [
    atividadeBody({ titulo: '   ' }),
    atividadeBody({ questoes: [ { ...atividadeBody().questoes[0], enunciado: '' } ] }),
    umaAlternativa,
    respostaQueNaoPertence,
    origemAmbigua,
    atividadeBody({ historia: { tipo: 'propria', texto: '   ' } })
  ]) {
    assert.equal((await post(body, emitirToken())).status, 400);
  }

  assert.equal(chamadas.criacao, 0);
});

test('PUT /api/atividades/:id exige autenticação e perfil de professor', async () => {
  assert.equal((await put(atividadeId, edicaoBody())).status, 401);
  assert.equal((await put(atividadeId, edicaoBody(), emitirToken('aluno'))).status, 403);
  assert.deepEqual(chamadas.atividade, []);
});

test('PUT /api/atividades/:id retorna 400 para ID inválido e 404 para atividade inexistente', async () => {
  assert.equal((await put('id-invalido', edicaoBody(), emitirToken())).status, 400);
  assert.equal((await put(atividadeId, edicaoBody(), emitirToken())).status, 404);
  assert.deepEqual(chamadas.atividade, [atividadeId]);
});

test('somente o professor criador pode editar a atividade', async () => {
  registrarAtividade('rascunho', professorAlternativoId);

  const resposta = await put(atividadeId, edicaoBody(), emitirToken());

  assert.equal(resposta.status, 403);
  assert.equal(chamadas.criacao, 0);
  assert.equal(atividades.get(atividadeId).titulo, 'Atividade de leitura');
});

test('criador edita atividades em rascunho e publicadas sem alterar turma, autor ou status', async () => {
  for (const status of ['rascunho', 'publicada']) {
    atividades.clear();
    chamadas.criacao = 0;
    registrarAtividade(status);

    const resposta = await put(atividadeId, edicaoBody(), emitirToken());
    const corpo = await resposta.json();
    const atualizada = atividades.get(atividadeId);

    assert.equal(resposta.status, 200);
    assert.equal(corpo.atividade.status, status);
    assert.equal(String(atualizada.turma), turmaId);
    assert.equal(String(atualizada.professorCriador), professorId);
    assert.equal(atualizada.status, status);
    assert.equal(atualizada.titulo, 'Atividade revisada');
    assert.equal(String(atualizada.questoes[0]._id), questaoId);
    assert.equal(String(atualizada.questoes[0].alternativas[0]._id), alternativaAId);
    assert.ok(mongoose.isValidObjectId(atualizada.questoes[0].alternativas[1]._id));
    assert.notEqual(String(atualizada.questoes[0].alternativas[1]._id), alternativaAId);
  }
});

test('criador edita recompensa e valores inválidos não alteram a atividade', async () => {
  registrarAtividade();
  const update = edicaoBody({ recompensaMoedas: 32 });
  const resposta = await put(atividadeId, update, emitirToken());
  const corpo = await resposta.json();
  assert.equal(resposta.status, 200);
  assert.equal(corpo.atividade.recompensaMoedas, 32);
  assert.equal(atividades.get(atividadeId).recompensaMoedas, 32);

  for (const recompensaMoedas of [0, -3, 4.2, '12', null]) {
    const invalid = await put(atividadeId, edicaoBody({ recompensaMoedas }), emitirToken());
    assert.equal(invalid.status, 400);
    assert.equal(atividades.get(atividadeId).recompensaMoedas, 32);
  }
  assert.equal((await put(atividadeId, edicaoBody({ recompensaMoedas: 3 }), emitirToken('aluno'))).status, 403);
  assert.equal(atividades.get(atividadeId).recompensaMoedas, 32);
});

test('edição substitui o conjunto completo de questões, alternativas e respostas corretas', async () => {
  registrarAtividade();
  const corpoEdicao = edicaoBody({
    questoes: [
      edicaoBody().questoes[0],
      {
        _id: questaoOutraId,
        enunciado: 'Segunda questão',
        alternativas: [
          { _id: alternativaDId, texto: 'D' },
          { texto: 'Nova alternativa E' }
        ],
        respostasCorretas: [alternativaDId]
      }
    ]
  });

  const resposta = await put(atividadeId, corpoEdicao, emitirToken());
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.equal(corpo.atividade.questoes.length, 2);
  assert.equal(corpo.atividade.questoes[1].alternativas.length, 2);
  assert.equal(String(corpo.atividade.questoes[1]._id), questaoOutraId);
  assert.equal(String(corpo.atividade.questoes[1].alternativas[0]._id), alternativaDId);
  assert.ok(mongoose.isValidObjectId(corpo.atividade.questoes[1].alternativas[1]._id));
  assert.deepEqual(corpo.atividade.questoes[1].respostasCorretas.map(String), [alternativaDId]);
});

test('edição permite questão e alternativas novas sem IDs e resolve respostas por índice', async () => {
  registrarAtividade();
  const novasQuestoes = edicaoBody({
    questoes: [{
      enunciado: 'Questão nova',
      alternativas: [
        { texto: 'Nova alternativa A' },
        { texto: 'Nova alternativa B' }
      ],
      respostasCorretas: [1]
    }]
  });

  const resposta = await put(atividadeId, novasQuestoes, emitirToken());
  const corpo = await resposta.json();
  const questao = corpo.atividade.questoes[0];

  assert.equal(resposta.status, 200);
  assert.ok(mongoose.isValidObjectId(questao._id));
  assert.ok(questao.alternativas.every(alternativa => mongoose.isValidObjectId(alternativa._id)));
  assert.deepEqual(questao.respostasCorretas.map(String), [String(questao.alternativas[1]._id)]);
});

test('edição rejeita índice de resposta correta fora das alternativas enviadas', async () => {
  registrarAtividade();
  const indiceInvalido = edicaoBody({
    questoes: [{
      enunciado: 'Questão nova',
      alternativas: [{ texto: 'A' }, { texto: 'B' }],
      respostasCorretas: [2]
    }]
  });

  const resposta = await put(atividadeId, indiceInvalido, emitirToken());

  assert.equal(resposta.status, 400);
  assert.equal(chamadas.criacao, 0);
});

test('edição rejeita índice negativo em respostas corretas', async () => {
  registrarAtividade();
  const indiceNegativo = edicaoBody({
    questoes: [{
      enunciado: 'Questão nova',
      alternativas: [{ texto: 'A' }, { texto: 'B' }],
      respostasCorretas: [-1]
    }]
  });

  const resposta = await put(atividadeId, indiceNegativo, emitirToken());

  assert.equal(resposta.status, 400);
  assert.equal(chamadas.criacao, 0);
});

test('edição rejeita índice fracionário em respostas corretas', async () => {
  registrarAtividade();
  const indiceFracionario = edicaoBody({
    questoes: [{
      enunciado: 'Questão nova',
      alternativas: [{ texto: 'A' }, { texto: 'B' }],
      respostasCorretas: [0.5]
    }]
  });

  const resposta = await put(atividadeId, indiceFracionario, emitirToken());

  assert.equal(resposta.status, 400);
  assert.equal(chamadas.criacao, 0);
});

test('edição rejeita índices duplicados em respostas corretas', async () => {
  registrarAtividade();
  const indicesDuplicados = edicaoBody({
    questoes: [{
      enunciado: 'Questão nova',
      alternativas: [{ texto: 'A' }, { texto: 'B' }],
      respostasCorretas: [0, 0]
    }]
  });

  const resposta = await put(atividadeId, indicesDuplicados, emitirToken());

  assert.equal(resposta.status, 400);
  assert.equal(chamadas.criacao, 0);
});

test('edição rejeita respostas corretas que não pertençam às alternativas da própria questão', async () => {
  registrarAtividade();
  const respostaDaOutraQuestao = edicaoBody({
    questoes: [
      edicaoBody().questoes[0],
      {
        _id: questaoOutraId,
        enunciado: 'Outra questão',
        alternativas: [
          { _id: alternativaDId, texto: 'D' },
          { _id: alternativaEId, texto: 'E' }
        ],
        respostasCorretas: [alternativaAId]
      }
    ]
  });

  const resposta = await put(atividadeId, respostaDaOutraQuestao, emitirToken());

  assert.equal(resposta.status, 400);
  assert.equal(chamadas.criacao, 0);
});

test('edição valida história oficial e aceita texto próprio', async () => {
  registrarAtividade();
  const historiaInexistente = '507f1f77bcf86cd799439339';
  const inexistente = await put(
    atividadeId,
    edicaoBody({ historia: { tipo: 'oficial', historiaId: historiaInexistente } }),
    emitirToken()
  );
  assert.equal(inexistente.status, 404);
  assert.equal(chamadas.criacao, 0);

  const propria = await put(
    atividadeId,
    edicaoBody({ historia: { tipo: 'propria', texto: 'Texto próprio atualizado.' } }),
    emitirToken()
  );
  const corpo = await propria.json();
  assert.equal(propria.status, 200);
  assert.equal(corpo.atividade.historia.tipo, 'propria');
  assert.equal(corpo.atividade.historia.texto, 'Texto próprio atualizado.');
});

test('edição rejeita turma, autor, status e campos inesperados', async () => {
  registrarAtividade();
  for (const campo of [
    { turma: '507f1f77bcf86cd799439399' },
    { professorCriador: professorAlternativoId },
    { status: 'rascunho' },
    { campoExtra: true }
  ]) {
    assert.equal((await put(atividadeId, edicaoBody(campo), emitirToken())).status, 400);
  }
  assert.equal(chamadas.criacao, 0);
});

test('edição rejeita IDs inválidos de questão ou alternativa', async () => {
  registrarAtividade();
  assert.equal((await put(atividadeId, edicaoBody({
    questoes: [{ ...edicaoBody().questoes[0], _id: 'questao-invalida' }]
  }), emitirToken())).status, 400);
  assert.equal((await put(atividadeId, edicaoBody({
    questoes: [{
      ...edicaoBody().questoes[0],
      alternativas: [
        { _id: 'alternativa-invalida', texto: 'A' },
        { _id: alternativaCId, texto: 'C' }
      ]
    }]
  }), emitirToken())).status, 400);
  assert.equal(chamadas.criacao, 0);
});

test('edição rejeita ID de questão pertencente a outra atividade', async () => {
  registrarAtividade();
  registrarOutraAtividade();
  const questaoDeOutraAtividade = edicaoBody({
    questoes: [{
      _id: questaoOutraAtividadeId,
      enunciado: 'Questão reaproveitada',
      alternativas: [
        { _id: alternativaOutraAtividadeId, texto: 'Outra A' },
        { texto: 'Nova alternativa' }
      ],
      respostasCorretas: [alternativaOutraAtividadeId]
    }]
  });

  const resposta = await put(atividadeId, questaoDeOutraAtividade, emitirToken());

  assert.equal(resposta.status, 400);
  assert.equal(chamadas.criacao, 0);
});

test('edição rejeita ID de alternativa pertencente a outra questão da mesma atividade', async () => {
  registrarAtividade();
  const alternativaDeOutraQuestao = edicaoBody({
    questoes: [{
      ...edicaoBody().questoes[0],
      alternativas: [
        { _id: alternativaAId, texto: 'A atualizada' },
        { _id: alternativaDId, texto: 'D de outra questão' }
      ],
      respostasCorretas: [alternativaAId]
    }]
  });

  const resposta = await put(atividadeId, alternativaDeOutraQuestao, emitirToken());

  assert.equal(resposta.status, 400);
  assert.equal(chamadas.criacao, 0);
});

test('publicação exige autenticação, perfil de professor e autoria', async () => {
  registrarAtividade();

  assert.equal((await patch(atividadeId)).status, 401);
  assert.equal((await patch(atividadeId, {}, emitirToken('aluno'))).status, 403);
  assert.equal((await patch(atividadeId, {}, emitirToken('professor', professorAlternativoId))).status, 403);
  assert.equal((await remover(atividadeId)).status, 401);
  assert.equal((await remover(atividadeId, emitirToken('aluno'))).status, 403);
  assert.equal((await remover(atividadeId, emitirToken('professor', professorAlternativoId))).status, 403);
  assert.equal(chamadas.criacao, 0);
  assert.equal(chamadas.exclusao, 0);
});

test('criador publica rascunho e a API registra data de publicação', async () => {
  registrarAtividade();

  const resposta = await patch(atividadeId, {}, emitirToken());
  const corpo = await resposta.json();
  const salvo = atividades.get(atividadeId);

  assert.equal(resposta.status, 200);
  assert.equal(corpo.atividade.status, 'publicada');
  assert.ok(Number.isFinite(Date.parse(corpo.atividade.publicadoEm)));
  assert.equal(salvo.status, 'publicada');
  assert.ok(salvo.publicadoEm instanceof Date);
  assert.equal(chamadas.criacao, 1);
});

test('publicação rejeita ID inválido, atividade inexistente, atividade já publicada e corpo inesperado', async () => {
  assert.equal((await patch('id-invalido', {}, emitirToken())).status, 400);
  assert.equal((await patch(atividadeId, {}, emitirToken())).status, 404);

  registrarAtividade('publicada');
  assert.equal((await patch(atividadeId, {}, emitirToken())).status, 409);
  assert.equal((await patch(atividadeId, { status: 'publicada' }, emitirToken())).status, 400);
  assert.equal((await patch(atividadeId, [], emitirToken())).status, 400);
  assert.equal(chamadas.criacao, 0);
});

test('publicação rejeita atividade que falha nas validações do modelo', async () => {
  registrarAtividade();
  const documento = atividades.get(atividadeId);
  documento.questoes[0].respostasCorretas = ['507f1f77bcf86cd799439399'];
  atividades.set(atividadeId, documento);

  const resposta = await patch(atividadeId, {}, emitirToken());

  assert.equal(resposta.status, 400);
  assert.equal(atividades.get(atividadeId).status, 'rascunho');
  assert.equal(chamadas.criacao, 0);
});

test('prazo é opcional, aceita data válida e rejeita valor inválido', async () => {
  const semPrazo = await post(atividadeBody(), emitirToken());
  const corpoSemPrazo = await semPrazo.json();
  assert.equal(semPrazo.status, 201);
  assert.equal(corpoSemPrazo.atividade.prazo, null);

  const prazoValido = '2026-12-31T23:59:00.000Z';
  const comPrazo = await post(atividadeBody({ prazo: prazoValido }), emitirToken());
  const corpoComPrazo = await comPrazo.json();
  assert.equal(comPrazo.status, 201);
  assert.equal(new Date(corpoComPrazo.atividade.prazo).toISOString(), prazoValido);

  assert.equal((await post(atividadeBody({ prazo: 'não-é-uma-data' }), emitirToken())).status, 400);
  assert.equal(chamadas.criacao, 2);
});

test('atividades publicadas são ordenadas por publicação e desempate estável, mesmo após o prazo', async () => {
  const dataAntiga = new Date('2026-08-01T00:00:00.000Z');
  const dataEmpate = new Date('2026-09-01T00:00:00.000Z');
  const adicionar = (id, status, publicadoEm, prazo = null, turma = turmaId) => {
    const atividade = new Atividade({
      ...atividadeBody(),
      _id: id,
      turma,
      status,
      publicadoEm,
      prazo
    });
    atividades.set(id, atividade.toObject());
  };
  const idPrimeiraEmpatada = '507f1f77bcf86cd799439320';
  const idSegundaEmpatada = '507f1f77bcf86cd799439321';
  adicionar('507f1f77bcf86cd799439323', 'publicada', dataEmpate, new Date('2020-01-01T00:00:00.000Z'));
  adicionar(idSegundaEmpatada, 'publicada', dataEmpate);
  adicionar('507f1f77bcf86cd799439324', 'rascunho', null);
  adicionar(idPrimeiraEmpatada, 'publicada', dataEmpate);
  adicionar('507f1f77bcf86cd799439325', 'publicada', dataAntiga);
  adicionar('507f1f77bcf86cd799439326', 'publicada', dataEmpate, null, '507f1f77bcf86cd799439322');

  const resposta = await listarPublicadas(emitirToken());
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.deepEqual(corpo.atividades.map(atividade => String(atividade._id)), [
    '507f1f77bcf86cd799439325', idPrimeiraEmpatada, idSegundaEmpatada, '507f1f77bcf86cd799439323'
  ]);
  assert.deepEqual(chamadas.filtroLista, { status: 'publicada', turma: { $in: [turmaId, '507f1f77bcf86cd799439321'] } });
  assert.deepEqual(chamadas.projecaoLista, { 'questoes.respostasCorretas': 0 });
  assert.deepEqual(chamadas.filtroTurmas, { escola: { $in: [escolaId] }, arquivada: false });
  assert.equal(chamadas.projecaoTurmas, '_id escola arquivada');
  assert.deepEqual(chamadas.ordenacao, { publicadoEm: 1, _id: 1 });
  assert.ok(corpo.atividades.every(atividade => atividade.questoes.every(questao => !Object.hasOwn(questao, 'respostasCorretas'))));
  assert.equal(JSON.stringify(corpo).includes('respostasCorretas'), false);
  assert.ok(atividades.get('507f1f77bcf86cd799439323').questoes.every(questao => questao.respostasCorretas.length > 0));
});

test('Mongoose recebe projeção de exclusão para respostas corretas em questões aninhadas', () => {
  const consulta = new mongoose.Query({}, {}, Atividade).select({ 'questoes.respostasCorretas': 0 });
  assert.deepEqual(consulta.projection(), { 'questoes.respostasCorretas': 0 });
});

test('ordem omitida recebe automaticamente o próximo número disponível na turma', async () => {
  atividades.set('507f1f77bcf86cd799439370', {
    _id: '507f1f77bcf86cd799439370', turma: turmaId, ordem: 1, status: 'rascunho'
  });

  const resposta = await post(atividadeBody(), emitirToken());
  const corpo = await resposta.json();

  assert.equal(resposta.status, 201);
  assert.equal(corpo.atividade.ordem, 2);
});

test('ordem manual ocupada retorna conflito claro e não persiste outra atividade', async () => {
  atividades.set('507f1f77bcf86cd799439371', {
    _id: '507f1f77bcf86cd799439371', turma: turmaId, ordem: 4, status: 'publicada'
  });

  const resposta = await post(atividadeBody({ ordem: 4 }), emitirToken());
  const corpo = await resposta.json();

  assert.equal(resposta.status, 409);
  assert.match(corpo.mensagem, /ordem informada já está ocupada/i);
  assert.equal(chamadas.criacao, 0);
});

test('ordem automática refaz a reserva após colisão concorrente no índice único', async () => {
  atividades.set('507f1f77bcf86cd799439372', {
    _id: '507f1f77bcf86cd799439372', turma: turmaId, ordem: 1, status: 'rascunho'
  });
  const salvarOriginal = Atividade.prototype.save;
  let primeiraTentativa = true;
  Atividade.prototype.save = async function salvarComConcorrencia() {
    if (primeiraTentativa) {
      primeiraTentativa = false;
      atividades.set('507f1f77bcf86cd799439373', {
        _id: '507f1f77bcf86cd799439373', turma: turmaId, ordem: 2, status: 'rascunho'
      });
      const erro = new Error('duplicate key');
      erro.code = 11000;
      throw erro;
    }
    return salvarOriginal.call(this);
  };

  const resposta = await post(atividadeBody(), emitirToken());
  const corpo = await resposta.json();

  assert.equal(resposta.status, 201);
  assert.equal(corpo.atividade.ordem, 3);
  assert.equal(chamadas.criacao, 1);
});

test('listagem de publicadas não revela escolas fora do vínculo do professor', async () => {
  const turmaEscolaExternaId = '507f1f77bcf86cd799439360';
  const escolaExternaId = '507f1f77bcf86cd799439361';
  turmas.set(turmaEscolaExternaId, { _id: turmaEscolaExternaId, escola: escolaExternaId, arquivada: false });
  registrarAtividade('publicada');
  const atividadeExternaId = '507f1f77bcf86cd799439362';
  atividades.set(atividadeExternaId, new Atividade({
    ...atividadeBody(), _id: atividadeExternaId, turma: turmaEscolaExternaId,
    status: 'publicada', publicadoEm: new Date()
  }).toObject());

  const resposta = await listarPublicadas(emitirToken('professor', professorAlternativoId));
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.deepEqual(corpo.atividades, []);
  assert.deepEqual(chamadas.filtroTurmas, { escola: { $in: [] }, arquivada: false });
  assert.equal(chamadas.filtroLista, null);
});

test('criador exclui atividade sem registros relacionados', async () => {
  registrarAtividade();

  const resposta = await remover(atividadeId, emitirToken());

  assert.equal(resposta.status, 200);
  assert.equal(atividades.has(atividadeId), false);
  assert.equal(chamadas.exclusao, 1);
});

test('excluir atividade concluída apaga progresso, preserva ledger e remove referência órfã', async () => {
  registrarAtividade();
  progressosRelacionados.set(atividadeId, { atividade: atividadeId, status: 'concluida', respostas: [{ id: 'resposta' }] });
  movimentacoesRelacionadas.set(atividadeId, { atividade: atividadeId, tipo: 'ganho', quantidade: 15, motivo: 'Conclusão', aluno: 'aluno-a' });
  registrarOutraAtividade();
  progressosRelacionados.set(atividadeOutraId, { atividade: atividadeOutraId, status: 'iniciada' });
  movimentacoesRelacionadas.set(atividadeOutraId, { atividade: atividadeOutraId, tipo: 'ganho', quantidade: 20, motivo: 'Outra missão', aluno: 'aluno-b' });
  const resposta = await remover(atividadeId, emitirToken());

  assert.equal(resposta.status, 200);
  assert.equal(atividades.has(atividadeId), false);
  assert.equal(progressosRelacionados.has(atividadeId), false);
  assert.equal(movimentacoesRelacionadas.has(atividadeId), true);
  const movimento = movimentacoesRelacionadas.get(atividadeId);
  assert.equal(Object.hasOwn(movimento, 'atividade'), false);
  assert.equal(movimento.quantidade, 15);
  assert.equal(movimento.motivo, 'Conclusão');
  assert.equal(movimento.aluno, 'aluno-a');
  assert.equal(atividades.has(atividadeOutraId), true);
  assert.equal(progressosRelacionados.has(atividadeOutraId), true);
  assert.equal(movimentacoesRelacionadas.get(atividadeOutraId).atividade, atividadeOutraId);
  assert.equal(movimentacoesRelacionadas.get(atividadeOutraId).quantidade, 20);
  assert.equal(chamadas.progressosExcluidos, 1);
  assert.equal(chamadas.movimentosDesvinculados, 1);
  assert.equal(chamadas.exclusao, 1);
});

test('falha durante exclusão transacional não deixa alterações parciais', async () => {
  registrarAtividade();
  progressosRelacionados.set(atividadeId, { atividade: atividadeId, status: 'concluida' });
  movimentacoesRelacionadas.set(atividadeId, { atividade: atividadeId, tipo: 'ganho', quantidade: 9 });
  const updateOriginal = MovimentacaoMoeda.updateMany;
  MovimentacaoMoeda.updateMany = async () => { throw new Error('falha simulada ao desvincular ledger'); };

  try {
    const resposta = await remover(atividadeId, emitirToken());
    assert.equal(resposta.status, 500);
    assert.equal(atividades.has(atividadeId), true);
    assert.equal(progressosRelacionados.has(atividadeId), true);
    assert.equal(movimentacoesRelacionadas.get(atividadeId).atividade, atividadeId);
    assert.equal(movimentacoesRelacionadas.get(atividadeId).quantidade, 9);
  } finally {
    MovimentacaoMoeda.updateMany = updateOriginal;
  }
});

test('MongoDB sem suporte a transações retorna 503 e preserva todos os registros', async () => {
  registrarAtividade();
  progressosRelacionados.set(atividadeId, { atividade: atividadeId, status: 'iniciada' });
  movimentacoesRelacionadas.set(atividadeId, { atividade: atividadeId, tipo: 'ganho', quantidade: 8 });
  const sessionOriginal = mongoose.startSession;
  mongoose.startSession = async () => {
    const error = new Error('Transaction numbers are only allowed on a replica set member or mongos');
    error.code = 20;
    throw error;
  };

  try {
    const resposta = await remover(atividadeId, emitirToken());
    assert.equal(resposta.status, 503);
    assert.equal(atividades.has(atividadeId), true);
    assert.equal(progressosRelacionados.has(atividadeId), true);
    assert.equal(movimentacoesRelacionadas.get(atividadeId).atividade, atividadeId);
    assert.equal(movimentacoesRelacionadas.get(atividadeId).quantidade, 8);
  } finally {
    mongoose.startSession = sessionOriginal;
  }
});

test('exclusão rejeita ID inválido e atividade inexistente', async () => {
  assert.equal((await remover('id-invalido', emitirToken())).status, 400);
  assert.equal((await remover(atividadeId, emitirToken())).status, 404);
  assert.equal(chamadas.exclusao, 0);
});

test('exclusão é bloqueada quando um modelo registrado referencia a atividade', async () => {
  registrarAtividade();
  const nomeModelo = 'RegistroAtividadeTesteIssue21';
  const ModeloRegistro = mongoose.model(nomeModelo, new mongoose.Schema({
    atividade: { type: mongoose.Schema.Types.ObjectId, ref: 'Atividade' }
  }));
  const existeOriginal = ModeloRegistro.exists;
  ModeloRegistro.exists = async filtro => String(filtro.atividade) === atividadeId ? { _id: 'registro' } : null;

  try {
    const resposta = await remover(atividadeId, emitirToken());

    assert.equal(resposta.status, 409);
    assert.equal(atividades.has(atividadeId), true);
    assert.equal(chamadas.exclusao, 0);
  } finally {
    ModeloRegistro.exists = existeOriginal;
    mongoose.deleteModel(nomeModelo);
  }
});
