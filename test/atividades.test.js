import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../src/app.js';
import Atividade from '../src/models/Atividade.js';
import Historia from '../src/models/Historia.js';
import Turma from '../src/models/Turma.js';

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
let chamadas;
let jwtAnterior;

function substituir(modelo, metodo, implementacao) {
  const chave = `${modelo.modelName}#${metodo}`;
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
      _id: '507f1f77bcf86cd799439322', professorResponsavel: professorId, arquivada: true
    }]
  ]);
  historias = new Map([[historiaId, { _id: historiaId, titulo: 'História oficial', conteudo: 'Conteúdo oficial.' }]]);
  atividades = new Map();
  chamadas = { turma: [], historia: [], atividade: [], criacao: 0 };

  substituir(Turma, 'findById', async id => {
    chamadas.turma.push(String(id));
    return turmas.get(String(id)) ?? null;
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
  substituir(Atividade, 'prototype.save', async function salvarMock() {
    chamadas.criacao += 1;
    atividades.set(String(this._id), this.toObject());
    return this;
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
    status
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
    const modelo = { Turma, Historia, Atividade }[nomeModelo];
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
