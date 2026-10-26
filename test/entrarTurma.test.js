import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import Aluno from '../src/models/Aluno.js';
import Turma from '../src/models/Turma.js';

const segredoTeste = 'segredo-local-entrada-turma';
const alunoNovoId = '507f1f77bcf86cd799439301';
const alunoExistenteId = '507f1f77bcf86cd799439302';
const turmaId = '507f1f77bcf86cd799439303';
const outraTurmaId = '507f1f77bcf86cd799439304';
const raAluno = 'RA-ENTRADA';
const codigoTurma = 'TURMA-TESTE';
const senhaTurma = 'senha-compartilhada';
const hashTurma = await bcrypt.hash(senhaTurma, 4);
const mensagemCredenciaisInvalidas = 'Código da turma ou senha inválidos.';
const mensagemCamposObrigatorios = 'RA, código da turma e senha são obrigatórios.';
const mensagemConfiguracaoAusente = 'Autenticação não configurada no servidor.';
const mensagemConflitoTurma = 'Este RA já está associado a outra turma.';
const mensagemConflitoCadastro = 'Este RA já está associado a outro cadastro.';

const originaisModelos = new Map();
const originaisAmbiente = new Map();
let servidor;
let baseUrl;
let alunos;
let turmaAtual;
let modoCriacao;
let resultadoCorrida;
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
    _id: alunoNovoId,
    ra: raAluno,
    nomeCompleto: null,
    turma: turmaId,
    cadastroInicialConcluido: false,
    ...overrides
  };
}

function turmaFixture(overrides = {}) {
  return {
    _id: turmaId,
    codigoPermanente: codigoTurma,
    arquivada: false,
    senhaAcessoHash: hashTurma,
    ...overrides
  };
}

function configurarMocks() {
  alunos = new Map();
  turmaAtual = turmaFixture();
  modoCriacao = 'normal';
  resultadoCorrida = 'mesma-turma';
  chamadas = {
    buscasTurma: [],
    projecoes: [],
    buscasAluno: [],
    criacoes: []
  };

  substituir(Turma, 'findOne', filtro => {
    chamadas.buscasTurma.push(filtro);
    const turma = turmaAtual &&
      turmaAtual.codigoPermanente === filtro.codigoPermanente
      ? turmaAtual
      : null;
    return query(turma);
  });

  substituir(Aluno, 'findOne', async filtro => {
    chamadas.buscasAluno.push(filtro);
    return alunos.get(filtro.ra) ?? null;
  });

  substituir(Aluno, 'create', async dados => {
    chamadas.criacoes.push(dados);

    if (modoCriacao === 'duplicado') {
      if (resultadoCorrida === 'mesma-turma') {
        alunos.set(dados.ra, alunoFixture({
          _id: alunoExistenteId,
          nomeCompleto: 'Aluno Reaparecido',
          cadastroInicialConcluido: true,
          turma: turmaId
        }));
      } else if (resultadoCorrida === 'outra-turma') {
        alunos.set(dados.ra, alunoFixture({
          _id: alunoExistenteId,
          turma: outraTurmaId
        }));
      }

      const erro = new Error('duplicate key');
      erro.code = 11000;
      throw erro;
    }

    const aluno = alunoFixture({ ...dados });
    alunos.set(aluno.ra, aluno);
    return aluno;
  });
}

async function postEntrarTurma(body) {
  return fetch(`${baseUrl}/aluno/entrar-turma`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function dadosEntrada(overrides = {}) {
  return {
    ra: raAluno,
    codigoPermanente: codigoTurma,
    senha: senhaTurma,
    ...overrides
  };
}

function assertErroCredenciais(resposta, corpo) {
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

test('entrada válida cria aluno, mantém cadastro pendente e emite JWT verificável', async () => {
  process.env.JWT_EXPIRES_IN = '30m';

  const resposta = await postEntrarTurma(dadosEntrada({
    ra: ` ${raAluno} `,
    codigoPermanente: ` ${codigoTurma.toLowerCase()} `
  }));
  const corpo = await resposta.json();
  const payload = jwt.verify(corpo.token, segredoTeste);

  assert.equal(resposta.status, 201);
  assert.deepEqual(chamadas.buscasTurma, [{ codigoPermanente: codigoTurma }]);
  assert.deepEqual(chamadas.projecoes, ['+senhaAcessoHash']);
  assert.deepEqual(chamadas.buscasAluno, [{ ra: raAluno }]);
  assert.deepEqual(chamadas.criacoes, [{ ra: raAluno, turma: turmaId }]);
  assert.equal(corpo.sucesso, true);
  assert.equal(corpo.mensagem, 'Entrada na turma realizada. Conclua seu cadastro inicial.');
  assert.equal(corpo.alunoNovo, true);
  assert.equal(corpo.cadastroInicialPendente, true);
  assert.deepEqual(corpo.usuario, {
    id: alunoNovoId,
    ra: raAluno,
    nome: null,
    turma: turmaId,
    tipo: 'aluno'
  });
  assert.equal(payload.tipo, 'aluno');
  assert.equal(payload.nome, 'Aluno');
  assert.equal(payload.sub, alunoNovoId);
  assert.equal(payload.exp - payload.iat, 30 * 60);
  assert.equal(JSON.stringify(corpo).includes(hashTurma), false);
  assert.equal(JSON.stringify(corpo).includes(senhaTurma), false);
});

test('aluno já vinculado à mesma turma é reutilizado sem nova criação', async () => {
  const existente = alunoFixture({
    _id: alunoExistenteId,
    nomeCompleto: 'Aluno Existente',
    cadastroInicialConcluido: true
  });
  alunos.set(raAluno, existente);

  const resposta = await postEntrarTurma(dadosEntrada());
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.equal(corpo.mensagem, 'Entrada na turma realizada com sucesso.');
  assert.equal(corpo.alunoNovo, false);
  assert.equal(corpo.cadastroInicialPendente, false);
  assert.equal(corpo.usuario.id, alunoExistenteId);
  assert.equal(corpo.usuario.nome, 'Aluno Existente');
  assert.equal(chamadas.criacoes.length, 0);
});

test('RA já associado a outra turma retorna conflito específico sem criar aluno', async () => {
  alunos.set(raAluno, alunoFixture({ turma: outraTurmaId }));

  const resposta = await postEntrarTurma(dadosEntrada());

  assert.equal(resposta.status, 409);
  assert.deepEqual(await resposta.json(), {
    sucesso: false,
    mensagem: mensagemConflitoTurma
  });
  assert.equal(chamadas.criacoes.length, 0);
});

test('após colisão 11000, aluno encontrado na mesma turma é reutilizado', async () => {
  modoCriacao = 'duplicado';
  resultadoCorrida = 'mesma-turma';

  const resposta = await postEntrarTurma(dadosEntrada());
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.equal(corpo.mensagem, 'Entrada na turma realizada com sucesso.');
  assert.equal(corpo.alunoNovo, false);
  assert.equal(corpo.usuario.id, alunoExistenteId);
  assert.equal(chamadas.criacoes.length, 1);
  assert.deepEqual(chamadas.buscasAluno, [{ ra: raAluno }, { ra: raAluno }]);
});

test('após colisão 11000, aluno ausente ou de outra turma recebe o conflito de cadastro', async () => {
  for (const cenario of ['ausente', 'outra-turma']) {
    alunos = new Map();
    modoCriacao = 'duplicado';
    resultadoCorrida = cenario;

    const resposta = await postEntrarTurma(dadosEntrada());

    assert.equal(resposta.status, 409, cenario);
    assert.deepEqual(await resposta.json(), {
      sucesso: false,
      mensagem: mensagemConflitoCadastro
    }, cenario);
  }
});

test('turma inexistente, arquivada, sem hash ou senha incorreta retorna 401 genérico', async () => {
  const cenarios = [
    ['turma inexistente', null, senhaTurma],
    ['turma arquivada', turmaFixture({ arquivada: true }), senhaTurma],
    ['hash ausente', turmaFixture({ senhaAcessoHash: null }), senhaTurma],
    ['senha incorreta', turmaFixture(), 'senha-incorreta']
  ];

  for (const [nome, turma, senha] of cenarios) {
    turmaAtual = turma;
    const resposta = await postEntrarTurma(dadosEntrada({ senha }));

    assert.equal(resposta.status, 401, nome);
    assert.deepEqual(await resposta.json(), {
      sucesso: false,
      mensagem: mensagemCredenciaisInvalidas
    }, nome);
  }

  assert.equal(chamadas.criacoes.length, 0);
});

test('campos ausentes ou inválidos retornam HTTP 400', async () => {
  const cenarios = [
    {},
    { ra: '', codigoPermanente: codigoTurma, senha: senhaTurma },
    { ra: '   ', codigoPermanente: codigoTurma, senha: senhaTurma },
    { ra: raAluno, codigoPermanente: '', senha: senhaTurma },
    { ra: raAluno, codigoPermanente: '   ', senha: senhaTurma },
    { ra: raAluno, codigoPermanente: 123, senha: senhaTurma },
    { ra: raAluno, codigoPermanente: codigoTurma, senha: '' },
    { ra: raAluno, codigoPermanente: codigoTurma, senha: false }
  ];

  for (const corpo of cenarios) {
    const resposta = await postEntrarTurma(corpo);

    assert.equal(resposta.status, 400);
    assert.deepEqual(await resposta.json(), {
      sucesso: false,
      mensagem: mensagemCamposObrigatorios
    });
  }

  assert.deepEqual(chamadas.buscasTurma, []);
  assert.deepEqual(chamadas.buscasAluno, []);
  assert.equal(chamadas.criacoes.length, 0);
});

test('JWT_SECRET ausente retorna HTTP 500 antes de consultar os models', async () => {
  delete process.env.JWT_SECRET;

  const resposta = await postEntrarTurma(dadosEntrada());

  assert.equal(resposta.status, 500);
  assert.deepEqual(await resposta.json(), {
    sucesso: false,
    mensagem: mensagemConfiguracaoAusente
  });
  assert.deepEqual(chamadas.buscasTurma, []);
  assert.deepEqual(chamadas.buscasAluno, []);
});

test('JWT usa validade padrão de uma hora quando JWT_EXPIRES_IN não está definido', async () => {
  const resposta = await postEntrarTurma(dadosEntrada());
  const corpo = await resposta.json();
  const payload = jwt.verify(corpo.token, segredoTeste);

  assert.equal(resposta.status, 201);
  assert.equal(payload.exp - payload.iat, 60 * 60);
});

test('senha enviada é comparada sem aparar os espaços', async () => {
  const resposta = await postEntrarTurma(dadosEntrada({ senha: ` ${senhaTurma} ` }));

  assert.equal(resposta.status, 401);
  assert.deepEqual(await resposta.json(), {
    sucesso: false,
    mensagem: mensagemCredenciaisInvalidas
  });
  assert.equal(chamadas.criacoes.length, 0);
});
