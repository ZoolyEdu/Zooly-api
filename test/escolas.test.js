import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import Escola from '../src/models/Escola.js';
import Professor from '../src/models/Professor.js';
import Turma from '../src/models/Turma.js';

const segredoTeste = 'segredo-local-escolas-sem-dados-reais';
const administradorId = '507f1f77bcf86cd799439801';
const professorId = '507f1f77bcf86cd799439802';
const turmaId = '507f1f77bcf86cd799439803';
const escolaAId = '507f1f77bcf86cd799439804';
const escolaBId = '507f1f77bcf86cd799439805';
const originais = new Map();
let servidor;
let baseUrl;
let jwtAnterior;
let escolas;
let professores;
let turmas;

const dadosEscola = (sobrescritos = {}) => ({
  nome: 'Escola Zooly',
  cnpj: '11222333000181',
  codigoPermanente: 'ESC-ZOOLY',
  municipio: 'São Paulo',
  endereco: 'Rua das Flores, 10',
  email: 'contato@zooly.test',
  contato: '11999990000',
  ...sobrescritos
});

function substituir(modelo, metodo, implementacao) {
  const chave = `${modelo.modelName}.${metodo}`;
  if (!originais.has(chave)) originais.set(chave, modelo[metodo]);
  modelo[metodo] = implementacao;
}

function criarDocumentoEscola(dados, id) {
  const escola = new Escola(dados);
  if (id) escola._id = id;
  escola.save = async () => {
    await escola.validate();
    escolas.set(String(escola._id), escola);
    return escola;
  };
  return escola;
}

function erroDuplicidade() {
  const error = new Error('Campo único duplicado');
  error.code = 11000;
  return error;
}

function instalarMocks() {
  escolas = new Map([
    [escolaAId, criarDocumentoEscola(dadosEscola({ nome: 'Zooly B' }), escolaAId)],
    [escolaBId, criarDocumentoEscola(dadosEscola({ nome: 'Zooly A', codigoPermanente: 'ESC-OUTRA', email: 'outra@zooly.test' }), escolaBId)]
  ]);
  professores = new Map();
  turmas = new Map();

  substituir(Escola, 'create', async dados => {
    const escola = criarDocumentoEscola(dados);
    await escola.validate();
    const duplicada = [...escolas.values()].some(existente =>
      existente.codigoPermanente === escola.codigoPermanente ||
      (escola.cnpj && existente.cnpj === escola.cnpj)
    );
    if (duplicada) throw erroDuplicidade();
    escolas.set(String(escola._id), escola);
    return escola;
  });
  substituir(Escola, 'find', () => {
    let ordenacao;
    return {
      sort(especificacao) { ordenacao = especificacao; return this; },
      then(resolve, reject) {
        const resultado = [...escolas.values()];
        if (ordenacao?.nome === 1) resultado.sort((a, b) => a.nome.localeCompare(b.nome));
        return Promise.resolve(resultado).then(resolve, reject);
      }
    };
  });
  substituir(Escola, 'findById', async id => escolas.get(String(id)) ?? null);
  substituir(Escola, 'findByIdAndDelete', async id => {
    const escola = escolas.get(String(id)) ?? null;
    if (escola) escolas.delete(String(id));
    return escola;
  });
  substituir(Turma, 'exists', async filtro => [...turmas.values()].some(turma => String(turma.escola) === String(filtro.escola)));
  substituir(Professor, 'exists', async filtro => [...professores.values()].some(professor =>
    (professor.escolas ?? []).some(escolaId => String(escolaId) === String(filtro.escolas))
  ));
}

function token(tipo = 'administrador', subject = administradorId) {
  return jwt.sign({ tipo, nome: 'Teste' }, segredoTeste, { subject, expiresIn: '5m' });
}

async function request(path, { method = 'GET', accessToken = token(), body } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
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

beforeEach(instalarMocks);

afterEach(() => {
  for (const [chave, original] of originais) {
    const [nome, metodo] = chave.split('.');
    ({ Escola, Professor, Turma })[nome][metodo] = original;
  }
  originais.clear();
});

after(async () => {
  if (jwtAnterior === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = jwtAnterior;
  if (servidor) await new Promise((resolve, reject) => servidor.close(error => error ? reject(error) : resolve()));
});

test('CRUD de escolas exige autenticação e perfil de administrador', async () => {
  assert.equal((await request('/escolas', { accessToken: null })).status, 401);
  assert.equal((await request('/escolas', { accessToken: token('professor', professorId) })).status, 403);
  assert.equal((await request('/escolas', { accessToken: token('aluno', '507f1f77bcf86cd799439806') })).status, 403);
});

test('POST /escolas cria uma escola e retorna o contrato atual', async () => {
  const response = await request('/escolas', { method: 'POST', body: dadosEscola({ codigoPermanente: 'ESC-NOVA', cnpj: null }) });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.sucesso, true);
  assert.equal(body.mensagem, 'Escola cadastrada com sucesso.');
  assert.equal(body.escola.nome, 'Escola Zooly');
  assert.equal(body.escola.codigoPermanente, 'ESC-NOVA');
  assert.ok(body.escola._id);
});

test('POST /escolas preserva validações do model e trata duplicidade', async () => {
  const camposAusentes = await request('/escolas', { method: 'POST', body: { nome: 'Incompleta' } });
  const corpoAusente = await camposAusentes.json();
  assert.equal(camposAusentes.status, 400);
  assert.equal(corpoAusente.sucesso, false);
  assert.ok(corpoAusente.detalhes.some(mensagem => mensagem.includes('código permanente')));

  const cnpjInvalido = await request('/escolas', {
    method: 'POST',
    body: dadosEscola({ codigoPermanente: 'ESC-CNPJ-INVALIDO', cnpj: '123' })
  });
  assert.equal(cnpjInvalido.status, 400);
  assert.ok((await cnpjInvalido.json()).detalhes.some(mensagem => mensagem.includes('CNPJ')));

  const duplicada = await request('/escolas', { method: 'POST', body: dadosEscola({ codigoPermanente: 'ESC-ZOOLY', cnpj: null }) });
  assert.equal(duplicada.status, 409);
  assert.deepEqual(await duplicada.json(), {
    sucesso: false,
    mensagem: 'Já existe um registro com um dos dados informados.'
  });
});

test('GET /escolas lista em ordem alfabética com total', async () => {
  const response = await request('/escolas');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.sucesso, true);
  assert.equal(body.total, 2);
  assert.deepEqual(body.escolas.map(escola => escola.nome), ['Zooly A', 'Zooly B']);
});

test('GET /escolas/:id valida o identificador, encontra a escola ou retorna 404', async () => {
  const encontrada = await request(`/escolas/${escolaAId}`);
  assert.equal(encontrada.status, 200);
  assert.equal((await encontrada.json()).escola.nome, 'Zooly B');

  const invalida = await request('/escolas/id-invalido');
  assert.equal(invalida.status, 400);
  assert.deepEqual(await invalida.json(), { sucesso: false, mensagem: 'ID de escola inválido.' });

  const ausente = await request('/escolas/507f1f77bcf86cd799439899');
  assert.equal(ausente.status, 404);
  assert.deepEqual(await ausente.json(), { sucesso: false, mensagem: 'Escola não encontrada.' });
});

test('PUT /escolas/:id edita campos permitidos e ignora campos externos ao schema da rota', async () => {
  const response = await request(`/escolas/${escolaAId}`, {
    method: 'PUT',
    body: { nome: 'Escola Atualizada', municipio: 'Campinas', arquivada: true, professorResponsavel: professorId }
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.sucesso, true);
  assert.equal(body.mensagem, 'Escola atualizada com sucesso.');
  assert.equal(body.escola.nome, 'Escola Atualizada');
  assert.equal(body.escola.municipio, 'Campinas');
  assert.equal(body.escola.arquivada, undefined);
  assert.equal(body.escola.professorResponsavel, undefined);
});

test('PUT /escolas/:id mantém validação de ID, inexistência e model', async () => {
  const invalida = await request('/escolas/id-invalido', { method: 'PUT', body: { nome: 'X' } });
  assert.equal(invalida.status, 400);
  assert.deepEqual(await invalida.json(), { sucesso: false, mensagem: 'ID de escola inválido.' });

  const ausente = await request('/escolas/507f1f77bcf86cd799439899', { method: 'PUT', body: { nome: 'X' } });
  assert.equal(ausente.status, 404);
  assert.deepEqual(await ausente.json(), { sucesso: false, mensagem: 'Escola não encontrada.' });

  const antes = escolas.get(escolaAId).nome;
  const invalidaNoModel = await request(`/escolas/${escolaAId}`, { method: 'PUT', body: { email: 'email-invalido' } });
  assert.equal(invalidaNoModel.status, 400);
  assert.equal(escolas.get(escolaAId).nome, antes);
});

test('DELETE /escolas/:id mantém respostas atuais para ID inválido e escola inexistente', async () => {
  const invalida = await request('/escolas/id-invalido', { method: 'DELETE' });
  assert.equal(invalida.status, 400);
  assert.deepEqual(await invalida.json(), { sucesso: false, mensagem: 'ID de escola inválido.' });

  const ausente = await request('/escolas/507f1f77bcf86cd799439899', { method: 'DELETE' });
  assert.equal(ausente.status, 404);
  assert.deepEqual(await ausente.json(), { sucesso: false, mensagem: 'Escola não encontrada.' });
});

test('DELETE /escolas/:id exclui escola sem turmas ou professores vinculados', async () => {
  const response = await request(`/escolas/${escolaAId}`, { method: 'DELETE' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sucesso: true, mensagem: 'Escola excluída com sucesso.' });
  assert.equal(escolas.has(escolaAId), false);
});

test('DELETE bloqueia escola com turma vinculada e preserva os registros', async () => {
  turmas.set(turmaId, { _id: turmaId, escola: escolaAId });

  const response = await request(`/escolas/${escolaAId}`, { method: 'DELETE' });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    sucesso: false,
    mensagem: 'Não é possível excluir uma escola que possui turmas ou professores vinculados.'
  });
  assert.equal(escolas.has(escolaAId), true);
  assert.equal(turmas.has(turmaId), true);
  assert.equal(professores.size, 0);
});

test('DELETE bloqueia escola referenciada por professor e preserva os registros', async () => {
  professores.set(professorId, { _id: professorId, escolas: [escolaAId] });

  const response = await request(`/escolas/${escolaAId}`, { method: 'DELETE' });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    sucesso: false,
    mensagem: 'Não é possível excluir uma escola que possui turmas ou professores vinculados.'
  });
  assert.equal(escolas.has(escolaAId), true);
  assert.deepEqual(professores.get(professorId).escolas, [escolaAId]);
  assert.equal(turmas.size, 0);
});

test('DELETE bloqueia escola com turma e professor vinculados e não remove nenhum registro', async () => {
  turmas.set(turmaId, { _id: turmaId, escola: escolaAId });
  professores.set(professorId, { _id: professorId, escolas: [escolaAId] });

  const response = await request(`/escolas/${escolaAId}`, { method: 'DELETE' });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).mensagem, 'Não é possível excluir uma escola que possui turmas ou professores vinculados.');
  assert.equal(escolas.has(escolaAId), true);
  assert.equal(turmas.has(turmaId), true);
  assert.equal(professores.has(professorId), true);
});
