import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../src/app.js';
import Aluno from '../src/models/Aluno.js';
import Professor from '../src/models/Professor.js';
import Turma from '../src/models/Turma.js';

const segredoTeste = 'segredo-local-aluno-admin-routes';
const escolaAId = '507f1f77bcf86cd799439601';
const escolaBId = '507f1f77bcf86cd799439602';
const professorAId = '507f1f77bcf86cd799439611';
const professorBId = '507f1f77bcf86cd799439612';
const alunoAId = '507f1f77bcf86cd799439621';
const alunoBId = '507f1f77bcf86cd799439622';
const turmaAId = '507f1f77bcf86cd799439631';
const turmaOutraAId = '507f1f77bcf86cd799439632';
const turmaBId = '507f1f77bcf86cd799439633';

const originaisModelos = new Map();
let jwtAnterior;
let jwtAnteriorTeste;
let consoleErrorOriginal;
let servidor;
let baseUrl;
let alunos;
let professores;
let turmas;
let chamadas;
let erroCriacaoAluno;
let erroSaveAluno;

function erroCast(valor) {
  const erro = new Error(`Cast failed for ${valor}`);
  erro.name = 'CastError';
  return erro;
}

function substituir(modelo, metodo, implementacao) {
  const chave = `${modelo.modelName}.${metodo}`;
  if (!originaisModelos.has(chave)) {
    originaisModelos.set(chave, modelo[metodo]);
  }
  modelo[metodo] = implementacao;
}

function alunoFixture(id, overrides = {}) {
  return {
    _id: id,
    ra: id === alunoAId ? 'RA-A' : 'RA-B',
    nomeCompleto: id === alunoAId ? 'Aluno A' : 'Aluno B',
    sexo: 'nao_informado',
    turma: turmaAId,
    cadastroInicialConcluido: false,
    avatarSelecionado: 'campo-interno',
    createdAt: new Date('2026-01-02T12:00:00.000Z'),
    async save() {
      if (erroSaveAluno) throw erroSaveAluno;
      alunos.set(String(this._id), this);
      return this;
    },
    ...overrides
  };
}

function turmaFixture(id, escola, overrides = {}) {
  return {
    _id: id,
    escola,
    codigoPermanente: id === turmaAId ? 'COD-A' : id === turmaOutraAId ? 'COD-A2' : 'COD-B',
    arquivada: false,
    ...overrides
  };
}

function queryAlunos(resultado, filtro) {
  let projecao;
  let ordenacao;
  return {
    select(valor) {
      projecao = valor;
      chamadas.projecoesAlunos.push(valor);
      return this;
    },
    sort(valor) {
      ordenacao = valor;
      chamadas.ordenacoesAlunos.push(valor);
      return this;
    },
    then(resolve, reject) {
      const selecionados = resultado
        .filter(aluno => String(aluno.turma) === String(filtro.turma))
        .sort((a, b) => {
          for (const [campo, direcao] of Object.entries(ordenacao ?? {})) {
            const valorA = a[campo] ?? '';
            const valorB = b[campo] ?? '';
            const comparacao = String(valorA).localeCompare(String(valorB));
            if (comparacao) return comparacao * direcao;
          }
          return 0;
        })
        .map(aluno => {
          const dados = { _id: aluno._id };
          for (const campo of String(projecao ?? '').split(/\s+/).filter(Boolean)) {
            if (Object.hasOwn(aluno, campo)) dados[campo] = aluno[campo];
          }
          return dados;
        });
      return Promise.resolve(selecionados).then(resolve, reject);
    }
  };
}

function instalarMocks() {
  alunos = new Map([
    [alunoAId, alunoFixture(alunoAId)],
    [alunoBId, alunoFixture(alunoBId, { turma: turmaBId })]
  ]);
  professores = new Map([
    [professorAId, { _id: professorAId, escolas: [escolaAId] }],
    [professorBId, { _id: professorBId, escolas: [escolaBId] }]
  ]);
  turmas = new Map([
    [turmaAId, turmaFixture(turmaAId, escolaAId)],
    [turmaOutraAId, turmaFixture(turmaOutraAId, escolaAId)],
    [turmaBId, turmaFixture(turmaBId, escolaBId)]
  ]);
  chamadas = {
    buscasAlunoId: [],
    buscasAlunoRa: [],
    filtrosListagem: [],
    projecoesAlunos: [],
    ordenacoesAlunos: [],
    buscasProfessor: [],
    buscasTurma: [],
    criacoesAluno: []
  };
  erroCriacaoAluno = null;
  erroSaveAluno = null;

  substituir(Aluno, 'findById', async id => {
    chamadas.buscasAlunoId.push(String(id));
    if (!mongoose.isValidObjectId(id)) throw erroCast(id);
    return alunos.get(String(id)) ?? null;
  });

  substituir(Aluno, 'findOne', async filtro => {
    chamadas.buscasAlunoRa.push(filtro);
    return [...alunos.values()].find(aluno =>
      aluno.ra === filtro.ra &&
      (!filtro._id?.$ne || String(aluno._id) !== String(filtro._id.$ne))
    ) ?? null;
  });

  substituir(Aluno, 'find', filtro => {
    chamadas.filtrosListagem.push(filtro);
    return queryAlunos([...alunos.values()], filtro);
  });

  substituir(Aluno, 'create', async dados => {
    chamadas.criacoesAluno.push(dados);
    if (erroCriacaoAluno) throw erroCriacaoAluno;
    const aluno = alunoFixture('507f1f77bcf86cd799439699', {
      ra: dados.ra,
      turma: dados.turma
    });
    alunos.set(String(aluno._id), aluno);
    return aluno;
  });

  substituir(Professor, 'findById', async id => {
    chamadas.buscasProfessor.push(String(id));
    return professores.get(String(id)) ?? null;
  });

  substituir(Turma, 'findById', async id => {
    chamadas.buscasTurma.push(String(id));
    if (!mongoose.isValidObjectId(id)) throw erroCast(id);
    return turmas.get(String(id)) ?? null;
  });
}

function token(tipo, subject) {
  return jwt.sign({ tipo, nome: 'Teste' }, segredoTeste, {
    subject,
    expiresIn: '5m'
  });
}

async function request(path, { method = 'GET', accessToken, body } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

async function postAluno(body, professor = professorAId) {
  return request('/alunos', {
    method: 'POST',
    accessToken: token('professor', professor),
    body
  });
}

async function listarAlunos(turmaId, professor = professorAId) {
  return request(`/alunos/turma/${turmaId}`, {
    accessToken: token('professor', professor)
  });
}

async function editarAluno(id, body, professor = professorAId) {
  return request(`/alunos/${id}`, {
    method: 'PUT',
    accessToken: token('professor', professor),
    body
  });
}

async function concluirCadastro(body, subject = alunoAId) {
  return request('/alunos/cadastro-inicial', {
    method: 'PATCH',
    accessToken: token('aluno', subject),
    body
  });
}

before(async () => {
  jwtAnterior = process.env.JWT_SECRET;
  consoleErrorOriginal = console.error;
  servidor = app.listen(0, '127.0.0.1');
  await new Promise(resolve => servidor.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${servidor.address().port}/api`;
});

beforeEach(() => {
  jwtAnteriorTeste = process.env.JWT_SECRET;
  process.env.JWT_SECRET = segredoTeste;
  console.error = () => {};
  instalarMocks();
});

afterEach(() => {
  for (const [chave, metodoOriginal] of originaisModelos) {
    const [nomeModelo, metodo] = chave.split('.');
    const modelo = { Aluno, Professor, Turma }[nomeModelo];
    modelo[metodo] = metodoOriginal;
  }
  originaisModelos.clear();
  if (jwtAnteriorTeste === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = jwtAnteriorTeste;
  console.error = consoleErrorOriginal;
});

after(async () => {
  if (jwtAnterior === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = jwtAnterior;
  console.error = consoleErrorOriginal;
  if (servidor) {
    await new Promise((resolve, reject) => {
      servidor.close(erro => erro ? reject(erro) : resolve());
    });
  }
});

test('POST /alunos cria aluno pendente na turma autorizada e normaliza o RA', async () => {
  const resposta = await postAluno({ ra: '  RA-NOVO  ', turmaId: turmaAId });
  const corpo = await resposta.json();

  assert.equal(resposta.status, 201);
  assert.deepEqual(corpo, {
    sucesso: true,
    mensagem: 'Aluno cadastrado. O cadastro inicial está pendente.',
    aluno: {
      id: '507f1f77bcf86cd799439699',
      ra: 'RA-NOVO',
      turma: turmaAId,
      cadastroInicialConcluido: false
    }
  });
  assert.deepEqual(chamadas.criacoesAluno, [{ ra: 'RA-NOVO', turma: turmaAId }]);
  assert.deepEqual(chamadas.buscasProfessor, [professorAId]);
});

test('POST /alunos rejeita RA ou turma ausentes antes de consultar os models', async () => {
  for (const body of [{}, { ra: 'RA-NOVO' }, { turmaId: turmaAId }, { ra: '', turmaId: turmaAId }]) {
    const resposta = await postAluno(body);
    assert.equal(resposta.status, 400);
    assert.deepEqual(await resposta.json(), {
      sucesso: false,
      mensagem: 'O RA e a turma são obrigatórios.'
    });
  }
  assert.deepEqual(chamadas.buscasTurma, []);
  assert.deepEqual(chamadas.criacoesAluno, []);
});

test('POST /alunos rejeita turma inexistente ou arquivada e ID inválido com respostas atuais', async () => {
  turmas.get(turmaAId).arquivada = true;
  const arquivada = await postAluno({ ra: 'RA-NOVO', turmaId: turmaAId });
  assert.equal(arquivada.status, 404);
  assert.deepEqual(await arquivada.json(), {
    sucesso: false,
    mensagem: 'Turma não encontrada ou arquivada.'
  });

  const inexistente = await postAluno({ ra: 'RA-NOVO', turmaId: '507f1f77bcf86cd799439688' });
  assert.equal(inexistente.status, 404);

  const malformada = await postAluno({ ra: 'RA-NOVO', turmaId: 'turma-invalida' });
  assert.equal(malformada.status, 400);
  assert.deepEqual(await malformada.json(), {
    sucesso: false,
    mensagem: 'O ID informado é inválido.'
  });
  assert.deepEqual(chamadas.criacoesAluno, []);
});

test('POST /alunos exige vínculo do professor com a escola da turma', async () => {
  const semVinculo = await postAluno({ ra: 'RA-NOVO', turmaId: turmaBId });
  assert.equal(semVinculo.status, 403);
  assert.deepEqual(await semVinculo.json(), {
    sucesso: false,
    mensagem: 'Você não tem permissão para cadastrar alunos nesta turma.'
  });

  professores.delete(professorAId);
  const professorAusente = await postAluno({ ra: 'RA-NOVO', turmaId: turmaAId });
  assert.equal(professorAusente.status, 403);
  assert.equal(chamadas.criacoesAluno.length, 0);
});

test('POST /alunos mapeia duplicidade MongoDB para HTTP 409', async () => {
  erroCriacaoAluno = Object.assign(new Error('duplicate key'), { code: 11000 });

  const resposta = await postAluno({ ra: 'RA-EXISTENTE', turmaId: turmaAId });

  assert.equal(resposta.status, 409);
  assert.deepEqual(await resposta.json(), {
    sucesso: false,
    mensagem: 'Já existe um aluno cadastrado com este RA.'
  });
});

test('GET /alunos/turma/:turmaId retorna os campos públicos sem RA e ordena por nome e ID', async () => {
  alunos.delete(alunoAId);
  alunos.set('507f1f77bcf86cd799439641', alunoFixture('507f1f77bcf86cd799439641', {
    ra: 'RA-C', nomeCompleto: 'Caio', turma: turmaAId, campoPrivado: 'não expor'
  }));
  alunos.set('507f1f77bcf86cd799439642', alunoFixture('507f1f77bcf86cd799439642', {
    ra: 'RA-A', nomeCompleto: 'Ana', turma: turmaAId, campoPrivado: 'não expor'
  }));
  alunos.set('507f1f77bcf86cd799439643', alunoFixture('507f1f77bcf86cd799439643', {
    ra: 'RA-B', nomeCompleto: 'Ana', turma: turmaAId, campoPrivado: 'não expor'
  }));

  const resposta = await listarAlunos(turmaAId);
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.equal(corpo.total, 3);
  assert.deepEqual(corpo.alunos.map(aluno => aluno.nomeCompleto), ['Ana', 'Ana', 'Caio']);
  assert.ok(corpo.alunos.every(aluno => !Object.hasOwn(aluno, 'ra')));
  assert.equal(corpo.alunos.some(aluno => String(aluno._id) === alunoBId), false);
  assert.deepEqual(chamadas.filtrosListagem, [{ turma: turmaAId }]);
  assert.deepEqual(chamadas.projecoesAlunos, ['_id nomeCompleto sexo cadastroInicialConcluido turma createdAt']);
  assert.deepEqual(chamadas.ordenacoesAlunos, [{ nomeCompleto: 1, _id: 1 }]);
  assert.ok(corpo.alunos.every(aluno =>
    Object.keys(aluno).sort().join(',') === '_id,cadastroInicialConcluido,createdAt,nomeCompleto,sexo,turma'
  ));
  assert.equal(JSON.stringify(corpo).includes('campoPrivado'), false);
});

test('GET /alunos/turma/:turmaId retorna 200 e lista vazia quando não há alunos', async () => {
  alunos = new Map();

  const resposta = await listarAlunos(turmaAId);
  assert.equal(resposta.status, 200);
  assert.deepEqual(await resposta.json(), { sucesso: true, total: 0, alunos: [] });
});

test('GET /alunos/turma/:turmaId preserva 404, 403 e 400 de turma e escola', async () => {
  const inexistente = await listarAlunos('507f1f77bcf86cd799439688');
  assert.equal(inexistente.status, 404);
  assert.deepEqual(await inexistente.json(), {
    sucesso: false,
    mensagem: 'Turma não encontrada ou arquivada.'
  });

  const malformada = await listarAlunos('turma-invalida');
  assert.equal(malformada.status, 400);
  assert.deepEqual(await malformada.json(), {
    sucesso: false,
    mensagem: 'O ID da turma informado é inválido.'
  });

  const semAcesso = await listarAlunos(turmaBId);
  assert.equal(semAcesso.status, 403);
  assert.deepEqual(await semAcesso.json(), {
    sucesso: false,
    mensagem: 'Você não tem permissão para consultar esta turma.'
  });
});

test('PUT /alunos/:alunoId exige pelo menos RA ou turma', async () => {
  const resposta = await editarAluno(alunoAId, {});

  assert.equal(resposta.status, 400);
  assert.deepEqual(await resposta.json(), {
    sucesso: false,
    mensagem: 'Informe o RA ou a turma para atualizar.'
  });
  assert.deepEqual(chamadas.buscasAlunoId, []);
});

test('PUT /alunos/:alunoId atualiza RA normalizado e retorna os dados atuais do aluno', async () => {
  const resposta = await editarAluno(alunoAId, { ra: '  RA-A-NOVO  ' });
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.deepEqual(corpo, {
    sucesso: true,
    mensagem: 'Aluno atualizado com sucesso.',
    aluno: {
      id: alunoAId,
      ra: 'RA-A-NOVO',
      nomeCompleto: 'Aluno A',
      sexo: 'nao_informado',
      turma: turmaAId,
      cadastroInicialConcluido: false
    }
  });
  assert.deepEqual(chamadas.buscasAlunoRa, [{ ra: 'RA-A-NOVO', _id: { $ne: alunoAId } }]);
  assert.equal(alunos.get(alunoAId).ra, 'RA-A-NOVO');
});

test('PUT /alunos/:alunoId rejeita RA vazio ou já utilizado', async () => {
  const vazio = await editarAluno(alunoAId, { ra: '   ' });
  assert.equal(vazio.status, 400);
  assert.deepEqual(await vazio.json(), {
    sucesso: false,
    mensagem: 'O RA não pode ficar vazio.'
  });

  alunos.get(alunoBId).ra = 'RA-DUPLICADO';
  const duplicado = await editarAluno(alunoAId, { ra: ' RA-DUPLICADO ' });
  assert.equal(duplicado.status, 409);
  assert.deepEqual(await duplicado.json(), {
    sucesso: false,
    mensagem: 'Já existe outro aluno cadastrado com este RA.'
  });
  assert.equal(alunos.get(alunoAId).ra, 'RA-A');
});

test('PUT /alunos/:alunoId transfere aluno para outra turma da escola autorizada', async () => {
  const resposta = await editarAluno(alunoAId, { turmaId: turmaOutraAId });
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.equal(corpo.aluno.turma, turmaOutraAId);
  assert.equal(alunos.get(alunoAId).turma, turmaOutraAId);
});

test('PUT /alunos/:alunoId valida acesso à turma atual e à turma de destino', async () => {
  alunos.get(alunoAId).turma = turmaBId;
  const semAcessoAtual = await editarAluno(alunoAId, { ra: 'RA-NOVO' });
  assert.equal(semAcessoAtual.status, 403);
  assert.deepEqual(await semAcessoAtual.json(), {
    sucesso: false,
    mensagem: 'Você não tem permissão para editar este aluno.'
  });

  alunos.get(alunoAId).turma = turmaAId;
  const turmaDestinoNegada = await editarAluno(alunoAId, { turmaId: turmaBId });
  assert.equal(turmaDestinoNegada.status, 403);
  assert.deepEqual(await turmaDestinoNegada.json(), {
    sucesso: false,
    mensagem: 'Você não tem permissão para usar esta turma.'
  });

  turmas.get(turmaOutraAId).arquivada = true;
  const arquivada = await editarAluno(alunoAId, { turmaId: turmaOutraAId });
  assert.equal(arquivada.status, 404);
  assert.deepEqual(await arquivada.json(), {
    sucesso: false,
    mensagem: 'Nova turma não encontrada ou arquivada.'
  });
});

test('PUT /alunos/:alunoId preserva respostas para aluno ausente, ID inválido e duplicidade no save', async () => {
  const inexistente = await editarAluno('507f1f77bcf86cd799439688', { ra: 'RA-X' });
  assert.equal(inexistente.status, 404);
  assert.deepEqual(await inexistente.json(), {
    sucesso: false,
    mensagem: 'Aluno não encontrado.'
  });

  const malformado = await editarAluno('id-invalido', { ra: 'RA-X' });
  assert.equal(malformado.status, 400);
  assert.deepEqual(await malformado.json(), {
    sucesso: false,
    mensagem: 'O ID informado é inválido.'
  });

  erroSaveAluno = Object.assign(new Error('duplicate key'), { code: 11000 });
  const duplicidadeNoSave = await editarAluno(alunoAId, { turmaId: turmaOutraAId });
  assert.equal(duplicidadeNoSave.status, 409);
  assert.deepEqual(await duplicidadeNoSave.json(), {
    sucesso: false,
    mensagem: 'Já existe outro aluno cadastrado com este RA.'
  });
});

test('PATCH /alunos/cadastro-inicial valida campos, sexo permitido e normaliza nome e código', async () => {
  for (const body of [
    {},
    { nomeCompleto: 'Nome', codigoPermanente: 'COD-A' },
    { nomeCompleto: '   ', codigoPermanente: 'COD-A', sexo: 'nao_informado' },
    { nomeCompleto: 'Nome', codigoPermanente: '   ', sexo: 'nao_informado' },
    { nomeCompleto: 'Nome', codigoPermanente: 'COD-A', sexo: 'outro' }
  ]) {
    const resposta = await concluirCadastro(body);
    assert.equal(resposta.status, 400);
    assert.deepEqual(await resposta.json(), {
      sucesso: false,
      mensagem: 'Informe nome completo, código da turma e sexo válido.'
    });
  }
  assert.deepEqual(chamadas.buscasAlunoId, []);

  const sucesso = await concluirCadastro({
    nomeCompleto: '  Nome Completo  ',
    codigoPermanente: ' cod-a ',
    sexo: 'feminino'
  });
  assert.equal(sucesso.status, 200);
  assert.deepEqual(await sucesso.json(), {
    sucesso: true,
    mensagem: 'Cadastro inicial concluído com sucesso.',
    aluno: {
      id: alunoAId,
      ra: 'RA-A',
      nomeCompleto: 'Nome Completo',
      sexo: 'feminino',
      turma: turmaAId,
      cadastroInicialConcluido: true
    }
  });
});

test('PATCH /alunos/cadastro-inicial cobre aluno inexistente, cadastro concluído e CastError', async () => {
  alunos.delete(alunoAId);
  const inexistente = await concluirCadastro({ nomeCompleto: 'Nome', codigoPermanente: 'COD-A', sexo: 'masculino' });
  assert.equal(inexistente.status, 404);
  assert.deepEqual(await inexistente.json(), {
    sucesso: false,
    mensagem: 'Aluno não encontrado.'
  });

  alunos.set(alunoAId, alunoFixture(alunoAId, { cadastroInicialConcluido: true }));
  const concluido = await concluirCadastro({ nomeCompleto: 'Nome', codigoPermanente: 'COD-A', sexo: 'masculino' });
  assert.equal(concluido.status, 409);
  assert.deepEqual(await concluido.json(), {
    sucesso: false,
    mensagem: 'O cadastro inicial já foi concluído.'
  });

  const cast = await concluirCadastro({ nomeCompleto: 'Nome', codigoPermanente: 'COD-A', sexo: 'masculino' }, 'subject-invalido');
  assert.equal(cast.status, 400);
  assert.deepEqual(await cast.json(), {
    sucesso: false,
    mensagem: 'Identificação do aluno inválida.'
  });
});

test('PATCH /alunos/cadastro-inicial rejeita turma ausente, arquivada ou código de outra turma', async () => {
  turmas.delete(turmaAId);
  const ausente = await concluirCadastro({ nomeCompleto: 'Nome', codigoPermanente: 'COD-A', sexo: 'masculino' });
  assert.equal(ausente.status, 404);
  assert.deepEqual(await ausente.json(), {
    sucesso: false,
    mensagem: 'Turma não encontrada ou arquivada.'
  });

  turmas.set(turmaAId, turmaFixture(turmaAId, escolaAId, { arquivada: true }));
  const arquivada = await concluirCadastro({ nomeCompleto: 'Nome', codigoPermanente: 'COD-A', sexo: 'masculino' });
  assert.equal(arquivada.status, 404);

  turmas.set(turmaAId, turmaFixture(turmaAId, escolaAId));
  const codigoDiferente = await concluirCadastro({ nomeCompleto: 'Nome', codigoPermanente: 'COD-B', sexo: 'masculino' });
  assert.equal(codigoDiferente.status, 400);
  assert.deepEqual(await codigoDiferente.json(), {
    sucesso: false,
    mensagem: 'O código informado não corresponde à turma do aluno.'
  });
});

test('PATCH /alunos/cadastro-inicial mantém HTTP 500 e mensagem própria para erro inesperado', async () => {
  erroSaveAluno = new Error('detalhe interno não deve aparecer');

  const resposta = await concluirCadastro({
    nomeCompleto: 'Nome',
    codigoPermanente: 'COD-A',
    sexo: 'nao_informado'
  });

  assert.equal(resposta.status, 500);
  assert.deepEqual(await resposta.json(), {
    sucesso: false,
    mensagem: 'Erro interno ao concluir cadastro inicial.'
  });
});
