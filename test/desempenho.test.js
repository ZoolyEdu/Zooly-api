import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import Aluno from '../src/models/Aluno.js';
import Atividade from '../src/models/Atividade.js';
import ProgressoAtividade from '../src/models/ProgressoAtividade.js';
import Professor from '../src/models/Professor.js';
import Turma from '../src/models/Turma.js';
import { calcularPeriodoSemanal } from '../src/services/desempenhoService.js';

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
let servidor, baseUrl, jwtAnterior, escolasPermitidas, progressoA;

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
  progressoA = [{ atividade: atividadeId, status: 'concluida', iniciadaEm: new Date('2026-10-19T03:00:00.000Z'), concluidaEm: new Date('2026-10-26T03:00:00.000Z'), respostasRegistradasEm: new Date('2026-10-26T02:59:59.999Z'), respostas: [
      { questaoId: q1, alternativasSelecionadas: [alt2] },
      { questaoId: q2, alternativasSelecionadas: [alt1, alt2] }
    ] }];
  substituir(ProgressoAtividade, 'find', async filtro => filtro.aluno === alunoA ? progressoA : []);
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

test('calcula semana de segunda a segunda no fuso de São Paulo com fim exclusivo', () => {
  const periodo = calcularPeriodoSemanal('2026-10-21');
  assert.equal(periodo.inicio.toISOString(), '2026-10-19T03:00:00.000Z');
  assert.equal(periodo.fim.toISOString(), '2026-10-26T03:00:00.000Z');
  assert.equal(calcularPeriodoSemanal('2026-02-30'), null);
  assert.equal(calcularPeriodoSemanal('2026/10/21'), null);
});

test('relatório semanal inclui somente datas dentro do período e mantém a consulta somente leitura', async () => {
  const antes = structuredClone(progressoA);
  const response = await get(`/desempenho/turmas/${turmaA}/semanal?data=2026-10-21`, token());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.periodo.inicio, '2026-10-19T03:00:00.000Z');
  assert.equal(body.periodo.fim, '2026-10-26T03:00:00.000Z');
  assert.equal(body.periodo.fuso, 'America/Sao_Paulo');
  assert.equal(typeof body.periodo.disponivel, 'boolean');
  assert.equal(body.indicadores.atividadesIniciadas, 1);
  assert.equal(body.indicadores.atividadesConcluidas, 0);
  assert.equal(body.indicadores.respostasRegistradas, 2);
  assert.equal(body.indicadores.acertos, 1);
  assert.equal(body.indicadores.erros, 1);
  assert.equal(body.alunos.length, 2);
  assert.deepEqual(body.alunos[1].indicadores, { atividadesIniciadas: 0, atividadesConcluidas: 0, respostasRegistradas: 0, respostasSemData: 0, acertos: 0, erros: 0, percentualAcerto: null });
  assert.deepEqual(progressoA, antes);
  assert.equal(JSON.stringify(body).match(/saldo|moeda|compra|financeir/gi), null);

  progressoA[0].respostasRegistradasEm = new Date('2026-10-26T03:00:00.000Z');
  const limiteFinal = await get(`/desempenho/turmas/${turmaA}/semanal?data=2026-10-21`, token());
  const relatorioLimite = await limiteFinal.json();
  assert.equal(relatorioLimite.alunos[0].indicadores.respostasRegistradas, 0);
  assert.equal(relatorioLimite.alunos[0].indicadores.percentualAcerto, null);

  progressoA[0].respostasRegistradasEm = new Date('2026-10-26T02:59:59.999Z');
  progressoA[0].concluidaEm = new Date('2026-10-26T02:59:59.999Z');
  const concluidaNoPeriodo = await get(`/desempenho/turmas/${turmaA}/semanal?data=2026-10-21`, token());
  const relatorioConclusao = await concluidaNoPeriodo.json();
  assert.equal(relatorioConclusao.alunos[0].indicadores.atividadesConcluidas, 1);
});

test('respostas legadas sem timestamp são identificadas e não atribuídas à semana', async () => {
  progressoA[0].respostasRegistradasEm = null;
  const response = await get(`/desempenho/turmas/${turmaA}/semanal?data=2026-10-21`, token());
  const body = await response.json();
  assert.equal(body.alunos[0].indicadores.respostasRegistradas, 0);
  assert.equal(body.alunos[0].indicadores.respostasSemData, 2);
  assert.equal(body.alunos[0].indicadores.percentualAcerto, null);
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
  assert.equal((await get(`/desempenho/turmas/${turmaA}/semanal?data=2026-10-21`, token('aluno', alunoA))).status, 403);
  assert.equal((await get(`/desempenho/turmas/${turmaA}/semanal`, token())).status, 400);
  assert.equal((await get(`/desempenho/turmas/invalido/semanal?data=2026-10-21`, token())).status, 400);
  assert.equal((await get('/desempenho/turmas/507f1f77bcf86cd799439199/semanal?data=2026-10-21', token())).status, 404);
});

test('professor não consulta outra escola e trocar ID de aluno não amplia acesso', async () => {
  assert.equal((await get(`/desempenho/turmas/${turmaB}`, token())).status, 403);
  assert.equal((await get(`/desempenho/turmas/${turmaB}/semanal?data=2026-10-21`, token())).status, 403);
  assert.equal((await get(`/desempenho/alunos/${alunoB}`, token())).status, 404);
});
