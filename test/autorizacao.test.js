import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import Aluno from '../src/models/Aluno.js';
import Escola from '../src/models/Escola.js';
import Professor from '../src/models/Professor.js';
import Turma from '../src/models/Turma.js';

const segredoTeste = 'segredo-local-de-testes-sem-dados-reais';
const escolaAId = '507f1f77bcf86cd799439001';
const escolaBId = '507f1f77bcf86cd799439002';
const professorId = '507f1f77bcf86cd799439010';
const alunoAId = '507f1f77bcf86cd799439020';
const alunoBId = '507f1f77bcf86cd799439021';
const turmaAId = '507f1f77bcf86cd799439030';
const turmaBId = '507f1f77bcf86cd799439031';

const originais = new Map();
let servidor;
let baseUrl;
let escolas;
let professores;
let turmas;
let alunos;
let operacoes;

function consulta(value) {
  return {
    select() { return this; },
    populate() { return this; },
    sort() { return this; },
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject);
    }
  };
}

function professorFixture() {
  return { _id: professorId, escolas: [escolaAId] };
}

function turmaFixture(id, escola, arquivada = false) {
  return {
    _id: id,
    nome: id === turmaAId ? 'Turma A' : 'Turma B',
    escola,
    anoEscolar: 2026,
    codigoPermanente: id === turmaAId ? 'COD-A' : 'COD-B',
    arquivada
  };
}

function turmaDocumento(turma) {
  const documento = { ...turma };
  documento.populate = async campo => {
      if (campo === 'escola') {
        const escola = escolas.get(String(documento.escola));
        documento.escola = { ...escola, toString: () => '[documento populado]' };
      }
      return documento;
    };
  documento.save = async () => {
      operacoes.turmaSalva += 1;
      turmas.set(documento._id, documento);
      return documento;
    };
  return documento;
}

function alunoFixture(id, turma) {
  return {
    _id: id,
    ra: id === alunoAId ? 'RA-A' : 'RA-B',
    nomeCompleto: id === alunoAId ? 'Aluno A' : 'Aluno B',
    sexo: 'nao_informado',
    turma,
    cadastroInicialConcluido: false,
    async save() {
      operacoes.alunoSalvo += 1;
      alunos.set(this._id, this);
      return this;
    }
  };
}

function emitirToken(tipo, subject, options = {}) {
  return jwt.sign({ tipo, nome: 'Teste' }, segredoTeste, {
    subject,
    expiresIn: '5m',
    ...options
  });
}

function headers(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function requisitar(path, { method = 'GET', token, body } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...headers(token),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

function substituir(model, method, implementation) {
  const key = `${model.modelName}.${method}`;
  if (!originais.has(key)) originais.set(key, model[method]);
  model[method] = implementation;
}

function prepararMocks() {
  escolas = new Map([
    [escolaAId, { _id: escolaAId, nome: 'Escola A', codigoPermanente: 'ESC-A' }],
    [escolaBId, { _id: escolaBId, nome: 'Escola B', codigoPermanente: 'ESC-B' }]
  ]);
  professores = new Map([[professorId, professorFixture()]]);
  turmas = new Map([
    [turmaAId, turmaFixture(turmaAId, escolaAId)],
    [turmaBId, turmaFixture(turmaBId, escolaBId)]
  ]);
  alunos = new Map([
    [alunoAId, alunoFixture(alunoAId, turmaAId)],
    [alunoBId, alunoFixture(alunoBId, turmaBId)]
  ]);
  operacoes = { turmaCriada: 0, turmaSalva: 0, alunoCriado: 0, alunoSalvo: 0 };

  substituir(Professor, 'findById', id => consulta(professores.get(String(id)) ?? null));
  substituir(Escola, 'findById', async id => escolas.get(String(id)) ?? null);
  substituir(Escola, 'find', () => consulta([...escolas.values()]));
  substituir(Turma, 'findById', async id => {
    const turma = turmas.get(String(id));
    return turma ? turmaDocumento(turma) : null;
  });
  substituir(Turma, 'findOne', filter => {
    const turma = turmas.get(String(filter._id));
    const idsEscola = filter.escola?.$in?.map(String) ?? [];
    const escolaPermitida = !filter.escola || idsEscola.includes(String(turma?.escola));
    return consulta(turma && escolaPermitida && !turma.arquivada ? turmaDocumento(turma) : null);
  });
  substituir(Turma, 'find', filter => {
    const idsEscola = filter.escola?.$in?.map(String) ?? [];
    return consulta([...turmas.values()].filter(turma => idsEscola.includes(String(turma.escola)) && !turma.arquivada));
  });
  substituir(Turma, 'create', async data => {
    operacoes.turmaCriada += 1;
    const turma = { ...data, _id: '507f1f77bcf86cd799439099', arquivada: false };
    turmas.set(turma._id, turma);
    return turma;
  });
  substituir(Aluno, 'findById', async id => alunos.get(String(id)) ?? null);
  substituir(Aluno, 'find', filter => consulta([...alunos.values()].filter(aluno => String(aluno.turma) === String(filter.turma))));
  substituir(Aluno, 'findOne', async filter => [...alunos.values()].find(aluno => aluno.ra === filter.ra && String(aluno._id) !== String(filter._id?.$ne)) ?? null);
  substituir(Aluno, 'create', async data => {
    operacoes.alunoCriado += 1;
    const aluno = alunoFixture('507f1f77bcf86cd799439098', data.turma);
    Object.assign(aluno, data);
    alunos.set(aluno._id, aluno);
    return aluno;
  });
}

before(async () => {
  process.env.JWT_SECRET = segredoTeste;
  servidor = app.listen(0, '127.0.0.1');
  await new Promise(resolve => servidor.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${servidor.address().port}/api`;
});

beforeEach(prepararMocks);

afterEach(() => {
  for (const [key, method] of originais) {
    const [modelName, methodName] = key.split('.');
    const model = { Aluno, Escola, Professor, Turma }[modelName];
    model[methodName] = method;
  }
  originais.clear();
});

after(async () => {
  if (servidor) await new Promise((resolve, reject) => servidor.close(error => error ? reject(error) : resolve()));
});

test('rotas protegidas retornam 401 sem token, com token inválido ou expirado', async () => {
  const rotas = [
    ['GET', '/escolas'],
    ['POST', '/escolas'],
    ['GET', '/turmas'],
    ['POST', '/turmas'],
    ['GET', `/turmas/${turmaAId}`],
    ['PUT', `/turmas/${turmaAId}`],
    ['PATCH', `/turmas/${turmaAId}/senha-acesso`],
    ['PATCH', `/turmas/${turmaAId}/arquivar`],
    ['POST', '/alunos'],
    ['GET', `/alunos/turma/${turmaAId}`],
    ['PUT', `/alunos/${alunoAId}`],
    ['PATCH', '/alunos/cadastro-inicial']
  ];
  const expirado = jwt.sign({ tipo: 'professor' }, segredoTeste, { subject: professorId, expiresIn: '-1s' });
  const invalido = jwt.sign({ tipo: 'professor' }, 'outro-segredo', { subject: professorId });

  for (const [method, rota] of rotas) {
    for (const token of [undefined, invalido, expirado]) {
      const response = await requisitar(rota, { method, token, body: method === 'PATCH' ? {} : undefined });
      assert.equal(response.status, 401, `${method} ${rota}`);
    }
  }
});

test('perfis incompatíveis recebem 403 nos gates de administrador, professor e aluno', async () => {
  const casos = [
    ['/escolas', 'professor', 'GET'],
    ['/escolas', 'aluno', 'GET'],
    ['/turmas', 'aluno', 'GET'],
    ['/turmas', 'administrador', 'GET'],
    ['/alunos', 'aluno', 'POST'],
    [`/alunos/${alunoAId}`, 'aluno', 'PUT'],
    [`/alunos/turma/${turmaAId}`, 'aluno', 'GET'],
    [`/alunos/turma/${turmaAId}`, 'administrador', 'GET'],
    ['/alunos/cadastro-inicial', 'professor', 'PATCH'],
    ['/alunos/cadastro-inicial', 'administrador', 'PATCH']
  ];

  for (const [rota, tipo, method] of casos) {
    const token = emitirToken(tipo, tipo === 'aluno' ? alunoAId : tipo === 'professor' ? professorId : 'admin-configurado');
    const response = await requisitar(rota, { method, token, body: method === 'PATCH' ? {} : undefined });
    assert.equal(response.status, 403, `${method} ${rota} (${tipo})`);
  }
});

test('professor não cria turma em escola sem vínculo e a tentativa não cria registro', async () => {
  const response = await requisitar('/turmas', {
    method: 'POST',
    token: emitirToken('professor', professorId),
    body: { nome: 'Não criar', escolaId: escolaBId, anoEscolar: 2026 }
  });
  assert.equal(response.status, 403);
  assert.equal(operacoes.turmaCriada, 0);
});

test('professor não consulta nem altera turma de outra escola', async () => {
  const token = emitirToken('professor', professorId);
  const consulta = await requisitar(`/turmas/${turmaBId}`, { token });
  const alteracao = await requisitar(`/turmas/${turmaBId}`, {
    method: 'PUT', token, body: { nome: 'Não alterar' }
  });
  const senha = await requisitar(`/turmas/${turmaBId}/senha-acesso`, {
    method: 'PATCH', token, body: { senha: '1234' }
  });
  const arquivamento = await requisitar(`/turmas/${turmaBId}/arquivar`, {
    method: 'PATCH', token, body: {}
  });
  assert.equal(consulta.status, 403);
  assert.equal(alteracao.status, 403);
  assert.equal(senha.status, 403);
  assert.equal(arquivamento.status, 403);
  assert.equal(operacoes.turmaSalva, 0);
  assert.equal(turmas.get(turmaBId).nome, 'Turma B');
  assert.equal(turmas.get(turmaBId).arquivada, false);
});

test('professor não lista nem altera alunos de outra escola', async () => {
  const token = emitirToken('professor', professorId);
  const consulta = await requisitar(`/alunos/turma/${turmaBId}`, { token });
  const alteracao = await requisitar(`/alunos/${alunoBId}`, {
    method: 'PUT', token, body: { ra: 'RA-ALTERADO' }
  });
  assert.equal(consulta.status, 403);
  assert.equal(alteracao.status, 403);
  assert.equal(operacoes.alunoSalvo, 0);
  assert.equal(alunos.get(alunoBId).ra, 'RA-B');
});

test('professor não transfere aluno acessível para turma de outra escola', async () => {
  const response = await requisitar(`/alunos/${alunoAId}`, {
    method: 'PUT',
    token: emitirToken('professor', professorId),
    body: { turmaId: turmaBId }
  });
  assert.equal(response.status, 403);
  assert.equal(operacoes.alunoSalvo, 0);
  assert.equal(String(alunos.get(alunoAId).turma), turmaAId);
});

test('professor autorizado consulta e altera turma e alunos da própria escola', async () => {
  const token = emitirToken('professor', professorId);
  const listagem = await requisitar('/turmas', { token });
  assert.equal(listagem.status, 200);
  const resultadoLista = await listagem.json();
  assert.deepEqual(resultadoLista.turmas.map(turma => turma._id), [turmaAId]);
  assert.equal((await requisitar(`/turmas/${turmaAId}`, { token })).status, 200);
  assert.equal((await requisitar(`/alunos/turma/${turmaAId}`, { token })).status, 200);
  assert.equal((await requisitar(`/turmas/${turmaAId}`, {
    method: 'PUT', token, body: { nome: 'Turma A atualizada' }
  })).status, 200);
  assert.equal((await requisitar(`/alunos/${alunoAId}`, {
    method: 'PUT', token, body: { ra: 'RA-A-ATUALIZADO' }
  })).status, 200);
  assert.equal(operacoes.turmaSalva, 1);
  assert.equal(operacoes.alunoSalvo, 1);
});

test('perfis autorizados avançam e aluno só altera cadastro pelo subject do token', async () => {
  const adminResponse = await requisitar('/escolas', { token: emitirToken('administrador', 'admin-configurado') });
  assert.equal(adminResponse.status, 200);

  const alunoResponse = await requisitar('/alunos/cadastro-inicial', {
    method: 'PATCH',
    token: emitirToken('aluno', alunoAId),
    body: {
      id: alunoBId,
      alunoId: alunoBId,
      nomeCompleto: 'Nome próprio atualizado',
      codigoPermanente: 'COD-A',
      sexo: 'nao_informado'
    }
  });
  assert.equal(alunoResponse.status, 200);
  assert.equal(alunos.get(alunoAId).nomeCompleto, 'Nome próprio atualizado');
  assert.equal(alunos.get(alunoBId).nomeCompleto, 'Aluno B');
  assert.equal(operacoes.alunoSalvo, 1);
});

test('professor autorizado cria turma e aluno na própria escola', async () => {
  const token = emitirToken('professor', professorId);
  const turma = await requisitar('/turmas', {
    method: 'POST', token,
    body: { nome: 'Nova turma A', escolaId: escolaAId, anoEscolar: 2026 }
  });
  assert.equal(turma.status, 201);

  const aluno = await requisitar('/alunos', {
    method: 'POST', token,
    body: { ra: 'RA-NOVO', turmaId: turmaAId }
  });
  assert.equal(aluno.status, 201);
  assert.equal(operacoes.turmaCriada, 1);
  assert.equal(operacoes.alunoCriado, 1);
});
