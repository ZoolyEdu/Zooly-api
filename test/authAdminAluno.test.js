import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import Aluno from '../src/models/Aluno.js';
import Turma from '../src/models/Turma.js';

const segredoTeste = 'segredo-local-autenticacao-testes';
const senhaTurma = 'senha-segura-turma-teste';
const senhaAdmin = 'senha-segura-admin-teste';
const turmaId = '507f1f77bcf86cd799439201';
const outraTurmaId = '507f1f77bcf86cd799439202';
const alunoId = '507f1f77bcf86cd799439203';
const raTeste = 'RA-TESTE-203';
const originais = new Map();
const variaveisAmbiente = ['JWT_SECRET', 'JWT_EXPIRES_IN', 'ADMIN_EMAIL', 'ADMIN_SENHA_HASH'];
let ambienteAnterior;
let servidor;
let baseUrl;
let hashTurma;
let hashAdmin;
let alunos;
let turmas;
let chamadas;

function query(value) {
  return {
    select(projection) {
      chamadas.projecoes.push(projection);
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject);
    }
  };
}

function substituir(modelo, metodo, implementacao) {
  const chave = `${modelo.modelName}.${metodo}`;
  if (!originais.has(chave)) originais.set(chave, modelo[metodo]);
  modelo[metodo] = implementacao;
}

function instalarMocks() {
  alunos = new Map();
  turmas = new Map([
    [turmaId, { _id: turmaId, arquivada: false, senhaAcessoHash: hashTurma }],
    [outraTurmaId, { _id: outraTurmaId, arquivada: false, senhaAcessoHash: hashTurma }]
  ]);
  chamadas = { consultasAluno: [], consultasTurmaId: [], consultasTurma: [], projecoes: [], criacoes: 0 };

  substituir(Aluno, 'findOne', filtro => {
    chamadas.consultasAluno.push(filtro);
    return query([...alunos.values()].find(aluno => aluno.ra === filtro.ra) ?? null);
  });
  substituir(Aluno, 'create', async dados => {
    chamadas.criacoes += 1;
    const aluno = {
      _id: alunoId,
      ra: dados.ra,
      turma: dados.turma,
      cadastroInicialConcluido: false,
      nomeCompleto: undefined
    };
    alunos.set(aluno.ra, aluno);
    return aluno;
  });
  substituir(Turma, 'findById', id => {
    chamadas.consultasTurmaId.push(id);
    return query(turmas.get(String(id)) ?? null);
  });
  substituir(Turma, 'findOne', filtro => {
    chamadas.consultasTurma.push(filtro);
    return query([...turmas.values()].find(turma =>
      turma.codigoPermanente === filtro.codigoPermanente
    ) ?? null);
  });
  turmas.get(turmaId).codigoPermanente = 'TURMA-TESTE-203';
  turmas.get(outraTurmaId).codigoPermanente = 'TURMA-OUTRA-203';
}

async function postJson(caminho, body) {
  return fetch(`${baseUrl}${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function verificarToken(token, tipo, subject) {
  const payload = jwt.verify(token, segredoTeste);
  assert.equal(payload.tipo, tipo);
  assert.equal(payload.sub, subject);
}

before(async () => {
  ambienteAnterior = Object.fromEntries(variaveisAmbiente.map(nome => [nome, process.env[nome]]));
  hashTurma = await bcrypt.hash(senhaTurma, 4);
  hashAdmin = await bcrypt.hash(senhaAdmin, 4);
  process.env.JWT_SECRET = segredoTeste;
  process.env.JWT_EXPIRES_IN = '5m';
  process.env.ADMIN_EMAIL = 'admin-teste@example.com';
  process.env.ADMIN_SENHA_HASH = hashAdmin;
  servidor = app.listen(0, '127.0.0.1');
  await new Promise(resolve => servidor.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${servidor.address().port}/api`;
});

beforeEach(instalarMocks);

afterEach(() => {
  for (const [chave, metodoOriginal] of originais) {
    const [nomeModelo, nomeMetodo] = chave.split('.');
    ({ Aluno, Turma })[nomeModelo][nomeMetodo] = metodoOriginal;
  }
  originais.clear();
});

after(async () => {
  for (const nome of variaveisAmbiente) {
    if (ambienteAnterior[nome] === undefined) delete process.env[nome];
    else process.env[nome] = ambienteAnterior[nome];
  }
  if (servidor) await new Promise((resolve, reject) => {
    servidor.close(erro => erro ? reject(erro) : resolve());
  });
});

test('login do administrador valida credenciais e emite token de administrador', async () => {
  const sucesso = await postJson('/auth/admin/login', {
    email: ' ADMIN-TESTE@EXAMPLE.COM ',
    senha: senhaAdmin
  });
  const corpo = await sucesso.json();
  assert.equal(sucesso.status, 200);
  assert.equal(corpo.usuario.tipo, 'administrador');
  verificarToken(corpo.token, 'administrador', 'admin-configurado');

  const falha = await postJson('/auth/admin/login', {
    email: 'admin-teste@example.com',
    senha: 'senha-incorreta'
  });
  assert.equal(falha.status, 401);
});

test('login do aluno usa a turma vinculada, confere a senha e emite token de aluno', async () => {
  alunos.set(raTeste, {
    _id: alunoId,
    ra: raTeste,
    turma: turmaId,
    nomeCompleto: 'Aluno de Teste',
    cadastroInicialConcluido: true
  });

  const sucesso = await postJson('/auth/aluno/login', { ra: ` ${raTeste} `, senha: senhaTurma });
  const corpo = await sucesso.json();
  assert.equal(sucesso.status, 200);
  assert.equal(corpo.usuario.turma, turmaId);
  assert.equal(corpo.cadastroInicialPendente, false);
  assert.deepEqual(chamadas.consultasTurmaId, [turmaId]);
  assert.ok(chamadas.projecoes.includes('+senhaAcessoHash'));
  verificarToken(corpo.token, 'aluno', alunoId);

  const senhaIncorreta = await postJson('/auth/aluno/login', { ra: raTeste, senha: 'senha-incorreta' });
  assert.equal(senhaIncorreta.status, 401);
  turmas.get(turmaId).arquivada = true;
  const turmaArquivada = await postJson('/auth/aluno/login', { ra: raTeste, senha: senhaTurma });
  assert.equal(turmaArquivada.status, 401);
});

test('entrada de aluno normaliza código, cria vínculo e não permite mover RA para outra turma', async () => {
  const sucesso = await postJson('/auth/aluno/entrar-turma', {
    ra: ` ${raTeste} `,
    codigoPermanente: ' turma-teste-203 ',
    senha: senhaTurma
  });
  const corpo = await sucesso.json();
  assert.equal(sucesso.status, 201);
  assert.equal(corpo.alunoNovo, true);
  assert.equal(corpo.usuario.ra, raTeste);
  assert.equal(String(corpo.usuario.turma), turmaId);
  assert.deepEqual(chamadas.consultasTurma, [{ codigoPermanente: 'TURMA-TESTE-203' }]);
  assert.ok(chamadas.projecoes.includes('+senhaAcessoHash'));
  assert.equal(chamadas.criacoes, 1);
  verificarToken(corpo.token, 'aluno', alunoId);

  const conflito = await postJson('/auth/aluno/entrar-turma', {
    ra: raTeste,
    codigoPermanente: 'TURMA-OUTRA-203',
    senha: senhaTurma
  });
  assert.equal(conflito.status, 409);
  assert.equal(chamadas.criacoes, 1);
});

test('entrada em turma rejeita senha incorreta sem criar cadastro', async () => {
  const resposta = await postJson('/auth/aluno/entrar-turma', {
    ra: raTeste,
    codigoPermanente: 'TURMA-TESTE-203',
    senha: 'senha-incorreta'
  });
  assert.equal(resposta.status, 401);
  assert.equal(chamadas.criacoes, 0);
});
