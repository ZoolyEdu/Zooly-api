import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import Escola from '../src/models/Escola.js';
import Professor from '../src/models/Professor.js';
import Turma from '../src/models/Turma.js';

const segredoTeste = 'segredo-local-turma-routes';
const professorId = '507f1f77bcf86cd799439701';
const professorOutroId = '507f1f77bcf86cd799439702';
const escolaAId = '507f1f77bcf86cd799439711';
const escolaBId = '507f1f77bcf86cd799439712';
const turmaAId = '507f1f77bcf86cd799439721';
const turmaBId = '507f1f77bcf86cd799439722';

const originais = new Map();
let jwtAnterior;
let servidor;
let baseUrl;
let escolas;
let professores;
let turmas;
let chamadas;
let errosCriacao;

function substituir(modelo, metodo, implementacao) {
  const chave = `${modelo.modelName}.${metodo}`;
  if (!originais.has(chave)) originais.set(chave, modelo[metodo]);
  modelo[metodo] = implementacao;
}

function professorDocumento(id = professorId, escolasDoProfessor = [escolaAId]) {
  return { _id: id, escolas: escolasDoProfessor };
}

function turmaDocumento(id, escolaId, overrides = {}) {
  return {
    _id: id,
    nome: id === turmaAId ? 'Turma Alfa' : 'Turma Beta',
    codigoPermanente: id === turmaAId ? 'TURMA-A' : 'TURMA-B',
    anoEscolar: 2026,
    escola: escolaId,
    professorResponsavel: professorId,
    arquivada: false,
    async populate(campo, projecao) {
      chamadas.populate.push([String(this._id), campo, projecao]);
      if (campo === 'escola') this.escola = { _id: escolaId, nome: 'Escola A', codigoPermanente: 'ESC-A' };
      if (campo === 'professorResponsavel') {
        this.professorResponsavel = { _id: professorId, nome: 'Professora', email: 'professora@example.test' };
      }
      return this;
    },
    async save() {
      chamadas.salvas += 1;
      turmas.set(String(this._id), this);
      return this;
    },
    ...overrides
  };
}

function prepararMocks() {
  escolas = new Map([
    [escolaAId, { _id: escolaAId, nome: 'Escola A' }],
    [escolaBId, { _id: escolaBId, nome: 'Escola B' }]
  ]);
  professores = new Map([
    [professorId, professorDocumento()],
    [professorOutroId, professorDocumento(professorOutroId, [escolaBId])]
  ]);
  turmas = new Map([
    [turmaAId, turmaDocumento(turmaAId, escolaAId)],
    [turmaBId, turmaDocumento(turmaBId, escolaBId)],
    ['507f1f77bcf86cd799439723', turmaDocumento('507f1f77bcf86cd799439723', escolaAId, { nome: 'Turma Arquivada', arquivada: true })]
  ]);
  chamadas = {
    professor: [], escola: [], turmaId: [], turmaOne: [], filtroTurmas: null,
    populatesLista: [], ordenacaoLista: null, populate: [], dadosCriacao: [], salvas: 0
  };
  errosCriacao = [];

  substituir(Professor, 'findById', id => {
    chamadas.professor.push(String(id));
    return {
      select: async campos => {
        chamadas.selectProfessor = campos;
        return professores.get(String(id)) ?? null;
      }
    };
  });
  substituir(Escola, 'findById', async id => {
    chamadas.escola.push(String(id));
    return escolas.get(String(id)) ?? null;
  });
  substituir(Turma, 'findById', async id => {
    chamadas.turmaId.push(String(id));
    return turmas.get(String(id)) ?? null;
  });
  substituir(Turma, 'findOne', async filtro => {
    chamadas.turmaOne.push(filtro);
    const turma = turmas.get(String(filtro._id));
    return turma && !turma.arquivada ? turma : null;
  });
  substituir(Turma, 'find', filtro => {
    chamadas.filtroTurmas = filtro;
    return {
      populate(campo, projecao) {
        chamadas.populatesLista.push([campo, projecao]);
        return this;
      },
      sort: async ordenacao => {
        chamadas.ordenacaoLista = ordenacao;
        const escolasPermitidas = filtro.escola.$in.map(String);
        return [...turmas.values()]
          .filter(turma => !turma.arquivada && escolasPermitidas.includes(String(turma.escola)))
          .sort((a, b) => a.nome.localeCompare(b.nome));
      }
    };
  });
  substituir(Turma, 'create', async dados => {
    chamadas.dadosCriacao.push(dados);
    if (errosCriacao.length) throw errosCriacao.shift();
    const turma = turmaDocumento('507f1f77bcf86cd799439799', dados.escola, dados);
    turmas.set(String(turma._id), turma);
    return turma;
  });
}

function emitirToken(tipo = 'professor', subject = professorId) {
  return jwt.sign({ tipo, nome: 'Teste' }, segredoTeste, { subject, expiresIn: '5m' });
}

async function requisitar(path, { method = 'GET', token = emitirToken(), body } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
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
  for (const [chave, metodoOriginal] of originais) {
    const [nomeModelo, metodo] = chave.split('.');
    ({ Escola, Professor, Turma })[nomeModelo][metodo] = metodoOriginal;
  }
  originais.clear();
});

after(async () => {
  if (jwtAnterior === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = jwtAnterior;
  if (servidor) {
    await new Promise((resolve, reject) => servidor.close(erro => erro ? reject(erro) : resolve()));
  }
});

test('POST /turmas valida os campos e rejeita escola ou ano inválidos antes de persistir', async () => {
  const casos = [
    {},
    { nome: '   ', escolaId: escolaAId, anoEscolar: 2026 },
    { nome: 'Turma', escolaId: 'id-invalido', anoEscolar: 2026 },
    { nome: 'Turma', escolaId: escolaAId, anoEscolar: 1999 },
    { nome: 'Turma', escolaId: escolaAId, anoEscolar: 2026.5 }
  ];
  for (const body of casos) {
    const resposta = await requisitar('/turmas', { method: 'POST', body });
    assert.equal(resposta.status, 400);
    assert.deepEqual(await resposta.json(), {
      sucesso: false,
      mensagem: 'Informe nome, escola válida e ano escolar válido.'
    });
  }
  assert.deepEqual(chamadas.dadosCriacao, []);
});

test('POST /turmas usa a identidade do token, normaliza o nome e gera código permanente', async () => {
  const resposta = await requisitar('/turmas', {
    method: 'POST',
    body: {
      nome: '  Turma Nova  ', escolaId: escolaAId, anoEscolar: 2026,
      professorResponsavel: professorOutroId, codigoPermanente: 'CLIENTE'
    }
  });
  const corpo = await resposta.json();

  assert.equal(resposta.status, 201);
  assert.deepEqual(corpo, {
    sucesso: true,
    mensagem: 'Turma cadastrada com sucesso.',
    turma: corpo.turma
  });
  assert.match(corpo.turma.codigoPermanente, /^TUR-[A-F0-9]{12}$/);
  assert.equal(corpo.turma.nome, 'Turma Nova');
  assert.equal(corpo.turma.anoEscolar, 2026);
  assert.equal(corpo.turma.escola, escolaAId);
  assert.equal(corpo.turma.professorResponsavel, professorId);
  assert.deepEqual(chamadas.dadosCriacao[0], {
    nome: 'Turma Nova',
    codigoPermanente: corpo.turma.codigoPermanente,
    anoEscolar: 2026,
    escola: escolaAId,
    professorResponsavel: professorId
  });
});

test('POST /turmas responde conforme professor ausente, escola não vinculada ou escola inexistente', async () => {
  const semProfessor = await requisitar('/turmas', {
    method: 'POST', body: { nome: 'Turma', escolaId: escolaAId, anoEscolar: 2026 },
    token: emitirToken('professor', '507f1f77bcf86cd799439788')
  });
  assert.equal(semProfessor.status, 401);
  assert.deepEqual(await semProfessor.json(), { sucesso: false, mensagem: 'Professor não encontrado.' });

  const semVinculo = await requisitar('/turmas', {
    method: 'POST', body: { nome: 'Turma', escolaId: escolaBId, anoEscolar: 2026 }
  });
  assert.equal(semVinculo.status, 403);
  assert.deepEqual(await semVinculo.json(), { sucesso: false, mensagem: 'Você não está vinculado a esta escola.' });

  escolas.delete(escolaAId);
  const escolaAusente = await requisitar('/turmas', {
    method: 'POST', body: { nome: 'Turma', escolaId: escolaAId, anoEscolar: 2026 }
  });
  assert.equal(escolaAusente.status, 404);
  assert.deepEqual(await escolaAusente.json(), { sucesso: false, mensagem: 'Escola não encontrada.' });
  assert.equal(chamadas.dadosCriacao.length, 0);
});

test('POST /turmas tenta novamente até três vezes após colisão de código 11000', async () => {
  errosCriacao = [
    Object.assign(new Error('duplicate key'), { code: 11000 }),
    Object.assign(new Error('duplicate key'), { code: 11000 })
  ];
  const resposta = await requisitar('/turmas', {
    method: 'POST', body: { nome: 'Turma com colisões', escolaId: escolaAId, anoEscolar: 2026 }
  });
  const corpo = await resposta.json();

  assert.equal(resposta.status, 201);
  assert.equal(chamadas.dadosCriacao.length, 3);
  assert.equal(new Set(chamadas.dadosCriacao.map(dados => dados.codigoPermanente)).size, 3);
  assert.match(corpo.turma.codigoPermanente, /^TUR-[A-F0-9]{12}$/);
});

test('POST /turmas para após três colisões com a resposta de erro atual', async () => {
  errosCriacao = Array.from({ length: 3 }, () => Object.assign(new Error('duplicate key'), { code: 11000 }));
  const resposta = await requisitar('/turmas', {
    method: 'POST', body: { nome: 'Turma sem código', escolaId: escolaAId, anoEscolar: 2026 }
  });
  assert.equal(resposta.status, 500);
  assert.deepEqual(await resposta.json(), {
    sucesso: false,
    mensagem: 'Não foi possível gerar um código para a turma.'
  });
  assert.equal(chamadas.dadosCriacao.length, 3);
});

test('GET /turmas lista somente turmas ativas das escolas vinculadas e preenche relações', async () => {
  const resposta = await requisitar('/turmas');
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.equal(corpo.sucesso, true);
  assert.equal(corpo.total, 1);
  assert.deepEqual(corpo.turmas.map(turma => turma.nome), ['Turma Alfa']);
  assert.deepEqual(chamadas.filtroTurmas, { escola: { $in: [escolaAId] }, arquivada: false });
  assert.deepEqual(chamadas.populatesLista, [
    ['escola', 'nome codigoPermanente'],
    ['professorResponsavel', 'nome email']
  ]);
  assert.deepEqual(chamadas.ordenacaoLista, { nome: 1 });
});

test('GET /turmas/:id valida o ID e retorna 404 para turma inexistente ou arquivada', async () => {
  const invalido = await requisitar('/turmas/id-invalido');
  assert.equal(invalido.status, 400);
  assert.deepEqual(await invalido.json(), { sucesso: false, mensagem: 'ID de turma inválido.' });

  const inexistente = await requisitar('/turmas/507f1f77bcf86cd799439788');
  assert.equal(inexistente.status, 404);
  assert.deepEqual(await inexistente.json(), { sucesso: false, mensagem: 'Turma não encontrada.' });

  const arquivada = await requisitar('/turmas/507f1f77bcf86cd799439723');
  assert.equal(arquivada.status, 404);
  assert.deepEqual(chamadas.turmaOne, [
    { _id: '507f1f77bcf86cd799439788', arquivada: false },
    { _id: '507f1f77bcf86cd799439723', arquivada: false }
  ]);
});

test('GET /turmas/:id retorna turma autorizada com escola e professor preenchidos', async () => {
  const resposta = await requisitar(`/turmas/${turmaAId}`);
  const corpo = await resposta.json();
  assert.equal(resposta.status, 200);
  assert.equal(corpo.sucesso, true);
  assert.equal(corpo.turma.escola.nome, 'Escola A');
  assert.equal(corpo.turma.professorResponsavel.nome, 'Professora');
  assert.deepEqual(chamadas.populate, [
    [turmaAId, 'escola', 'nome codigoPermanente'],
    [turmaAId, 'professorResponsavel', 'nome email']
  ]);
});

test('PUT /turmas/:id altera nome e ano, ignora campos não permitidos e preserva demais dados', async () => {
  const resposta = await requisitar(`/turmas/${turmaAId}`, {
    method: 'PUT',
    body: { nome: '  Nome atualizado  ', anoEscolar: 2027, escola: escolaBId, professorResponsavel: professorOutroId, codigoPermanente: 'ALTERADO' }
  });
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.equal(corpo.sucesso, true);
  assert.equal(corpo.mensagem, 'Turma atualizada com sucesso.');
  assert.equal(corpo.turma.nome, 'Nome atualizado');
  assert.equal(corpo.turma.anoEscolar, 2027);
  assert.equal(corpo.turma.escola, escolaAId);
  assert.equal(corpo.turma.professorResponsavel, professorId);
  assert.equal(corpo.turma.codigoPermanente, 'TURMA-A');
  assert.equal(chamadas.salvas, 1);
});

test('PUT /turmas/:id valida nome e ano escolar e deixa turma intacta quando inválidos', async () => {
  const idInvalido = await requisitar('/turmas/id-invalido', { method: 'PUT', body: { nome: 'Nome' } });
  assert.equal(idInvalido.status, 400);
  assert.deepEqual(await idInvalido.json(), { sucesso: false, mensagem: 'ID de turma inválido.' });

  for (const body of [
    { nome: '' }, { nome: '   ' }, { nome: 7 },
    { anoEscolar: 1999 }, { anoEscolar: 2101 }, { anoEscolar: 2026.5 }
  ]) {
    const resposta = await requisitar(`/turmas/${turmaAId}`, { method: 'PUT', body });
    assert.equal(resposta.status, 400);
  }
  assert.equal(chamadas.salvas, 0);
  assert.equal(turmas.get(turmaAId).nome, 'Turma Alfa');
  assert.equal(turmas.get(turmaAId).anoEscolar, 2026);
});

test('PATCH /turmas/:id/senha-acesso valida comprimento e salva somente o hash bcrypt', async () => {
  const idInvalido = await requisitar('/turmas/id-invalido/senha-acesso', {
    method: 'PATCH', body: { senha: 'senha-segura' }
  });
  assert.equal(idInvalido.status, 400);
  assert.deepEqual(await idInvalido.json(), { sucesso: false, mensagem: 'ID de turma inválido.' });

  for (const senha of ['', ' 123 ', '123456789012345678901']) {
    const invalida = await requisitar(`/turmas/${turmaAId}/senha-acesso`, { method: 'PATCH', body: { senha } });
    assert.equal(invalida.status, 400);
    assert.deepEqual(await invalida.json(), {
      sucesso: false,
      mensagem: 'A senha deve ter entre 4 e 20 caracteres.'
    });
  }

  const resposta = await requisitar(`/turmas/${turmaAId}/senha-acesso`, {
    method: 'PATCH', body: { senha: '  senha segura  ' }
  });
  const corpo = await resposta.json();
  assert.equal(resposta.status, 200);
  assert.deepEqual(corpo, { sucesso: true, mensagem: 'Senha de acesso da turma configurada com sucesso.' });
  assert.equal(await bcrypt.compare('senha segura', turmas.get(turmaAId).senhaAcessoHash), true);
  assert.equal(JSON.stringify(corpo).includes('senha segura'), false);
});

test('PATCH /turmas/:id/senha-acesso retorna 404 para turma inexistente ou arquivada', async () => {
  const inexistente = await requisitar('/turmas/507f1f77bcf86cd799439788/senha-acesso', {
    method: 'PATCH', body: { senha: '1234' }
  });
  assert.equal(inexistente.status, 404);

  const arquivada = await requisitar('/turmas/507f1f77bcf86cd799439723/senha-acesso', {
    method: 'PATCH', body: { senha: '1234' }
  });
  assert.equal(arquivada.status, 404);
  assert.deepEqual(await arquivada.json(), { sucesso: false, mensagem: 'Turma não encontrada ou arquivada.' });
});

test('PATCH /turmas/:id/arquivar arquiva turma ativa e responde com mensagem atual', async () => {
  const resposta = await requisitar(`/turmas/${turmaAId}/arquivar`, { method: 'PATCH', body: {} });
  assert.equal(resposta.status, 200);
  assert.deepEqual(await resposta.json(), { sucesso: true, mensagem: 'Turma arquivada com sucesso.' });
  assert.equal(turmas.get(turmaAId).arquivada, true);
  assert.equal(chamadas.salvas, 1);
});

test('PATCH /turmas/:id/arquivar rejeita turma inexistente ou já arquivada', async () => {
  const idInvalido = await requisitar('/turmas/id-invalido/arquivar', { method: 'PATCH', body: {} });
  assert.equal(idInvalido.status, 400);
  assert.deepEqual(await idInvalido.json(), { sucesso: false, mensagem: 'ID de turma inválido.' });

  const inexistente = await requisitar('/turmas/507f1f77bcf86cd799439788/arquivar', { method: 'PATCH', body: {} });
  assert.equal(inexistente.status, 404);

  const arquivada = await requisitar('/turmas/507f1f77bcf86cd799439723/arquivar', { method: 'PATCH', body: {} });
  assert.equal(arquivada.status, 404);
  assert.deepEqual(await arquivada.json(), {
    sucesso: false,
    mensagem: 'Turma não encontrada ou já arquivada.'
  });
  assert.equal(chamadas.salvas, 0);
});
