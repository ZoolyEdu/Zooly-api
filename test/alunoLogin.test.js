import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import Aluno from '../src/models/Aluno.js';
import Turma from '../src/models/Turma.js';

const segredoTeste = 'segredo-local-login-aluno';
const alunoId = '507f1f77bcf86cd799439201';
const turmaId = '507f1f77bcf86cd799439202';
const raAluno = 'RA-TESTE';
const senhaTurma = 'senha-compartilhada';
const hashTurma = await bcrypt.hash(senhaTurma, 4);
const mensagemCredenciaisInvalidas = 'RA ou senha inválidos.';
const mensagemCamposObrigatorios = 'RA e senha são obrigatórios.';
const mensagemConfiguracaoAusente = 'Autenticação não configurada no servidor.';

const originaisModelos = new Map();
const originaisAmbiente = new Map();
let servidor;
let baseUrl;
let alunoAtual;
let turmaAtual;
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
  if (!originaisModelos.has(chave)) originaisModelos.set(chave, modelo[metodo]);
  modelo[metodo] = implementacao;
}

function alunoFixture(overrides = {}) {
  return {
    _id: alunoId,
    ra: raAluno,
    nomeCompleto: 'Aluno de Teste',
    turma: turmaId,
    cadastroInicialConcluido: false,
    ...overrides
  };
}

function configurarMocks() {
  alunoAtual = alunoFixture();
  turmaAtual = {
    _id: turmaId,
    arquivada: false,
    senhaAcessoHash: hashTurma
  };
  chamadas = { buscasAluno: [], buscasTurma: [], projecoes: [] };

  substituir(Aluno, 'findOne', async filtro => {
    chamadas.buscasAluno.push(filtro);
    return alunoAtual && alunoAtual.ra === filtro.ra ? alunoAtual : null;
  });

  substituir(Turma, 'findById', id => {
    chamadas.buscasTurma.push(id);
    return query(turmaAtual);
  });
}

async function postLogin(body) {
  return fetch(`${baseUrl}/aluno/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function respostaCredenciaisInvalidas(resposta, corpo) {
  assert.equal(resposta.status, 401);
  assert.deepEqual(corpo, {
    sucesso: false,
    mensagem: mensagemCredenciaisInvalidas
  });
}

before(async () => {
  servidor = app.listen(0, '127.0.0.1');
  await new Promise(resolve => servidor.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${servidor.address().port}/api/auth`;
});

beforeEach(() => {
  for (const nome of ['JWT_SECRET', 'JWT_EXPIRES_IN']) {
    originaisAmbiente.set(nome, process.env[nome]);
  }
  process.env.JWT_SECRET = segredoTeste;
  delete process.env.JWT_EXPIRES_IN;
  configurarMocks();
});

afterEach(() => {
  for (const [chave, metodoOriginal] of originaisModelos) {
    const [nomeModelo, nomeMetodo] = chave.split('.');
    const modelo = { Aluno, Turma }[nomeModelo];
    modelo[nomeMetodo] = metodoOriginal;
  }
  originaisModelos.clear();

  for (const [nome, valor] of originaisAmbiente) {
    if (valor === undefined) delete process.env[nome];
    else process.env[nome] = valor;
  }
  originaisAmbiente.clear();
});

after(async () => {
  if (servidor) {
    await new Promise((resolve, reject) => {
      servidor.close(erro => erro ? reject(erro) : resolve());
    });
  }
});

test('login válido consulta o hash protegido e emite JWT do aluno com validade configurada', async () => {
  process.env.JWT_EXPIRES_IN = '45m';
  alunoAtual = alunoFixture({ cadastroInicialConcluido: true });

  const resposta = await postLogin({ ra: ` ${raAluno} `, senha: senhaTurma });
  const corpo = await resposta.json();
  const payload = jwt.verify(corpo.token, segredoTeste);

  assert.equal(resposta.status, 200);
  assert.deepEqual(chamadas.buscasAluno, [{ ra: raAluno }]);
  assert.deepEqual(chamadas.buscasTurma, [turmaId]);
  assert.deepEqual(chamadas.projecoes, ['+senhaAcessoHash']);
  assert.equal(corpo.sucesso, true);
  assert.equal(corpo.mensagem, 'Login realizado com sucesso.');
  assert.equal(corpo.cadastroInicialPendente, false);
  assert.deepEqual(corpo.usuario, {
    id: alunoId,
    ra: raAluno,
    nome: 'Aluno de Teste',
    turma: turmaId,
    tipo: 'aluno'
  });
  assert.equal(payload.tipo, 'aluno');
  assert.equal(payload.nome, 'Aluno de Teste');
  assert.equal(payload.sub, alunoId);
  assert.equal(payload.exp - payload.iat, 45 * 60);
  assert.equal(Object.hasOwn(corpo.usuario, 'senha'), false);
  assert.equal(JSON.stringify(corpo).includes(hashTurma), false);
  assert.equal(JSON.stringify(corpo).includes(senhaTurma), false);
});

test('login aceita aluno com cadastro inicial pendente e retorna mensagem e indicador atuais', async () => {
  alunoAtual = alunoFixture({ cadastroInicialConcluido: false });

  const resposta = await postLogin({ ra: raAluno, senha: senhaTurma });
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.equal(corpo.mensagem, 'Login realizado. É necessário concluir o cadastro inicial.');
  assert.equal(corpo.cadastroInicialPendente, true);
});

test('senha incorreta retorna 401 com a resposta genérica', async () => {
  const resposta = await postLogin({ ra: raAluno, senha: 'senha-incorreta' });

  respostaCredenciaisInvalidas(resposta, await resposta.json());
});

test('aluno inexistente retorna 401 com a mesma resposta genérica', async () => {
  const resposta = await postLogin({ ra: 'RA-INEXISTENTE', senha: senhaTurma });

  respostaCredenciaisInvalidas(resposta, await resposta.json());
  assert.deepEqual(chamadas.buscasAluno, [{ ra: 'RA-INEXISTENTE' }]);
  assert.deepEqual(chamadas.buscasTurma, []);
});

test('turma inexistente, arquivada ou sem hash de acesso rejeita o login com 401 genérico', async () => {
  const cenarios = [
    ['turma inexistente', null],
    ['turma arquivada', { _id: turmaId, arquivada: true, senhaAcessoHash: hashTurma }],
    ['hash ausente', { _id: turmaId, arquivada: false, senhaAcessoHash: null }]
  ];

  for (const [nome, turma] of cenarios) {
    turmaAtual = turma;
    const resposta = await postLogin({ ra: raAluno, senha: senhaTurma });

    assert.equal(resposta.status, 401, nome);
    assert.deepEqual(await resposta.json(), {
      sucesso: false,
      mensagem: mensagemCredenciaisInvalidas
    }, nome);
  }
});

test('campos ausentes ou inválidos retornam HTTP 400 com o contrato atual', async () => {
  for (const corpo of [
    {},
    { ra: '', senha: senhaTurma },
    { ra: '   ', senha: senhaTurma },
    { ra: 123, senha: senhaTurma },
    { ra: raAluno, senha: '' },
    { ra: raAluno, senha: false }
  ]) {
    const resposta = await postLogin(corpo);

    assert.equal(resposta.status, 400);
    assert.deepEqual(await resposta.json(), {
      sucesso: false,
      mensagem: mensagemCamposObrigatorios
    });
  }

  assert.deepEqual(chamadas.buscasAluno, []);
});

test('JWT_SECRET ausente retorna HTTP 500 antes de consultar os models', async () => {
  delete process.env.JWT_SECRET;

  const resposta = await postLogin({ ra: raAluno, senha: senhaTurma });

  assert.equal(resposta.status, 500);
  assert.deepEqual(await resposta.json(), {
    sucesso: false,
    mensagem: mensagemConfiguracaoAusente
  });
  assert.deepEqual(chamadas.buscasAluno, []);
});

test('login usa validade padrão de uma hora quando JWT_EXPIRES_IN não está definido', async () => {
  const resposta = await postLogin({ ra: raAluno, senha: senhaTurma });
  const corpo = await resposta.json();
  const payload = jwt.verify(corpo.token, segredoTeste);

  assert.equal(resposta.status, 200);
  assert.equal(payload.exp - payload.iat, 60 * 60);
});

test('a senha é comparada sem aparar os espaços enviados', async () => {
  const resposta = await postLogin({ ra: raAluno, senha: ` ${senhaTurma} ` });

  respostaCredenciaisInvalidas(resposta, await resposta.json());
});
