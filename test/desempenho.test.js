import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import Aluno from '../src/models/Aluno.js';
import Atividade from '../src/models/Atividade.js';
import ProgressoAtividade from '../src/models/ProgressoAtividade.js';
import Professor from '../src/models/Professor.js';
import Turma from '../src/models/Turma.js';

const segredo = 'segredo-teste-desempenho';
const professorId = '507f1f77bcf86cd799439101';
const turmaA = '507f1f77bcf86cd799439102';
const turmaB = '507f1f77bcf86cd799439103';
const alunoA = '507f1f77bcf86cd799439104';
const alunoB = '507f1f77bcf86cd799439105';
const atividadeId = '507f1f77bcf86cd799439106';
const q1 = '507f1f77bcf86cd799439107';
const q2 = '507f1f77bcf86cd799439108';
const alt1 = '507f1f77bcf86cd799439109';
const alt2 = '507f1f77bcf86cd799439110';
const alt3 = '507f1f77bcf86cd799439111';
const originais = new Map();
let servidor, baseUrl, jwtAnterior, escolasPermitidas;

function substituir(modelo, metodo, fn) {
  const chave = `${modelo.modelName}.${metodo}`;
  if (!originais.has(chave)) originais.set(chave, modelo[metodo]);
  modelo[metodo] = fn;
}
function consulta(value) {
  return { select() { return this; }, sort() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } };
}
function token(tipo = 'professor', subject = professorId) {
  return jwt.sign({ tipo }, segredo, { subject, expiresIn: '5m' });
}
async function get(path, accessToken) {
  return fetch(`${baseUrl}${path}`, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
}

before(async () => {
  jwtAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = segredo;
  servidor = app.listen(0, '127.0.0.1');
  await new Promise(resolve => servidor.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${servidor.address().port}/api`;
});
beforeEach(() => {
  escolasPermitidas = ['507f1f77bcf86cd799439120'];
  substituir(Professor, 'findById', () => ({ select: async () => ({ _id: professorId, escolas: escolasPermitidas }) }));
  substituir(Turma, 'findById', async id => id === turmaA ? { _id: turmaA, nome: 'A', escola: escolasPermitidas[0], arquivada: false } : id === turmaB ? { _id: turmaB, nome: 'B', escola: '507f1f77bcf86cd799439121', arquivada: false } : null);
  substituir(Aluno, 'findById', async id => id === alunoA ? { _id: alunoA, ra: 'RA1', nomeCompleto: 'Ana', turma: turmaA } : null);
  substituir(Aluno, 'find', () => consulta([
    { _id: alunoA, ra: 'RA1', nomeCompleto: 'Ana', turma: turmaA },
    { _id: alunoB, ra: 'RA2', nomeCompleto: 'Bia', turma: turmaA }
  ]));
  substituir(Atividade, 'find', async () => [{ _id: atividadeId, titulo: 'Leitura', questoes: [
    { _id: q1, enunciado: 'Q1', respostasCorretas: [alt1] },
    { _id: q2, enunciado: 'Q2', respostasCorretas: [alt1, alt2] }
  ] }]);
  substituir(ProgressoAtividade, 'find', async filtro => filtro.aluno === alunoA ? [
    { atividade: atividadeId, status: 'concluida', respostas: [
      { questaoId: q1, alternativasSelecionadas: [alt2] },
      { questaoId: q2, alternativasSelecionadas: [alt1, alt2] }
    ] }
  ] : []);
});
afterEach(() => {
  for (const [chave, metodo] of originais) {
    const [nome, funcao] = chave.split('.');
    ({ Aluno, Atividade, ProgressoAtividade, Professor, Turma })[nome][funcao] = metodo;
  }
  originais.clear();
});
after(async () => {
  if (jwtAnterior === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = jwtAnterior;
  await new Promise((resolve, reject) => servidor.close(erro => erro ? reject(erro) : resolve()));
});

test('consolida respostas uma vez, acertos, erros, conclusão e múltiplas corretas sem dados financeiros', async () => {
  const response = await get(`/desempenho/alunos/${alunoA}`, token());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.indicadores, { atividadesIniciadas: 1, atividadesConcluidas: 1, respostasRegistradas: 2, acertos: 1, erros: 1, percentualAcerto: 50 });
  assert.equal(body.questoesComMaisErros[0].questaoId, q1);
  assert.equal(JSON.stringify(body).match(/saldo|moeda|compra|financeir/gi), null);
});

test('turma inclui aluno sem progresso e questão sem resposta não entra no denominador', async () => {
  const response = await get(`/desempenho/turmas/${turmaA}`, token());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.totalAlunos, 2);
  assert.deepEqual(body.alunos[1].indicadores, { atividadesIniciadas: 0, atividadesConcluidas: 0, respostasRegistradas: 0, acertos: 0, erros: 0, percentualAcerto: null });
});

test('protege endpoints contra falta de autenticação, perfil incorreto e IDs inválidos/inexistentes', async () => {
  assert.equal((await get(`/desempenho/turmas/${turmaA}`)).status, 401);
  assert.equal((await get(`/desempenho/turmas/${turmaA}`, token('aluno', alunoA))).status, 403);
  assert.equal((await get('/desempenho/turmas/invalido', token())).status, 400);
  assert.equal((await get('/desempenho/alunos/507f1f77bcf86cd799439199', token())).status, 404);
});

test('professor não consulta outra escola e trocar ID de aluno não amplia acesso', async () => {
  assert.equal((await get(`/desempenho/turmas/${turmaB}`, token())).status, 403);
  assert.equal((await get(`/desempenho/alunos/${alunoB}`, token())).status, 404);
});
