import assert from 'node:assert/strict';
import { after, afterEach, before, describe, test } from 'node:test';
import mongoose from 'mongoose';
import Aluno from '../src/models/Aluno.js';
import Atividade from '../src/models/Atividade.js';
import AvatarAluno from '../src/models/AvatarAluno.js';
import Escola from '../src/models/Escola.js';
import MovimentacaoMoeda from '../src/models/MovimentacaoMoeda.js';
import Professor from '../src/models/Professor.js';
import ProgressoAtividade from '../src/models/ProgressoAtividade.js';
import Turma from '../src/models/Turma.js';
import { calcularSaldoMoedas, gastarMoedas } from '../src/services/moedaService.js';
import escolaService from '../src/services/escolaService.js';
import lojaService from '../src/services/lojaService.js';
import progressoService from '../src/services/progressoService.js';

const uriTeste = process.env.MONGODB_TEST_URI?.trim();
const executarSuite = uriTeste ? describe : describe.skip;
const modelosComIndices = [
  Aluno,
  Atividade,
  AvatarAluno,
  Escola,
  MovimentacaoMoeda,
  Professor,
  ProgressoAtividade,
  Turma
];
const idsCriados = new Map();
let contador = 0;

function validarDestino(uri) {
  let url;
  let nomeBanco;

  try {
    url = new URL(uri);
    nomeBanco = decodeURIComponent(
      url.pathname.replace(/^\/+/, '').split('/')[0] ?? ''
    );
  } catch {
    throw new Error(
      'MONGODB_TEST_URI não é uma URI MongoDB válida. O valor foi omitido.'
    );
  }

  if (!['mongodb:', 'mongodb+srv:'].includes(url.protocol)) {
    throw new Error(
      'MONGODB_TEST_URI precisa usar o protocolo MongoDB. O valor foi omitido.'
    );
  }

  const host = url.hostname.toLowerCase();
  const hostsLocais = ['localhost', '127.0.0.1', '[::1]', '::1'];

  if (!hostsLocais.includes(host)) {
    throw new Error(
      'Por segurança, os testes de integração só podem usar MongoDB local. O valor foi omitido.'
    );
  }

  if (!/(?:^|[_-])(?:test|testing)(?:$|[_-])/i.test(nomeBanco)) {
    throw new Error(
      'O nome do banco em MONGODB_TEST_URI precisa identificar explicitamente uma base de teste.'
    );
  }

  const uriProducao = process.env.MONGODB_URI?.trim();

  if (uriProducao) {
    let urlProducao;
    let bancoProducao;

    try {
      urlProducao = new URL(uriProducao);
      bancoProducao = decodeURIComponent(
        urlProducao.pathname.replace(/^\/+/, '').split('/')[0] ?? ''
      );
    } catch {
      throw new Error(
        'Não foi possível validar MONGODB_URI com segurança. Testes cancelados.'
      );
    }

    const mesmaPorta =
      (url.port || (url.protocol === 'mongodb+srv:' ? 'srv' : '27017')) ===
      (urlProducao.port ||
        (urlProducao.protocol === 'mongodb+srv:' ? 'srv' : '27017'));

    const mesmoDestino =
      host === urlProducao.hostname.toLowerCase() &&
      mesmaPorta &&
      nomeBanco === bancoProducao;

    if (mesmoDestino) {
      throw new Error(
        'MONGODB_TEST_URI não pode apontar para o mesmo destino de MONGODB_URI.'
      );
    }
  }
}


function registrar(modelo, id) {
  if (!idsCriados.has(modelo)) idsCriados.set(modelo, new Set());
  idsCriados.get(modelo).add(String(id));
}

async function inserir(modelo, dados) {
  const documento = new modelo(dados);
  registrar(modelo, documento._id);
  await documento.save();
  return documento;
}

function novoSufixo() {
  contador += 1;
  return `${Date.now()}-${contador}-${new mongoose.Types.ObjectId().toString()}`;
}

async function criarAluno() {
  const sufixo = novoSufixo();
  const aluno = await inserir(Aluno, {
    ra: `IT-${sufixo}`,
    turma: new mongoose.Types.ObjectId()
  });
  return aluno;
}

async function limparDocumentosCriados() {
  if (mongoose.connection.readyState !== 1) return;

  const alunos = [...(idsCriados.get(Aluno) ?? [])];
  const atividades = [...(idsCriados.get(Atividade) ?? [])];
  const idsMovimentacoes = {};
  if (alunos.length) idsMovimentacoes.aluno = { $in: alunos };
  if (atividades.length) idsMovimentacoes.atividade = { $in: atividades };

  if (Object.keys(idsMovimentacoes).length) {
    await MovimentacaoMoeda.deleteMany({ $or: Object.entries(idsMovimentacoes).map(([campo, valor]) => ({ [campo]: valor })) });
  }
  if (alunos.length) {
    await Promise.all([
      ProgressoAtividade.deleteMany({ aluno: { $in: alunos } }),
      AvatarAluno.deleteMany({ aluno: { $in: alunos } })
    ]);
  }

  for (const modelo of [Atividade, ProgressoAtividade, AvatarAluno, MovimentacaoMoeda, Aluno, Turma, Professor, Escola]) {
    const ids = [...(idsCriados.get(modelo) ?? [])];
    if (ids.length) await modelo.deleteMany({ _id: { $in: ids } });
  }
  idsCriados.clear();
}

executarSuite('Integração MongoDB (MONGODB_TEST_URI)', () => {
  before(async () => {
    validarDestino(uriTeste);
    try {
      await mongoose.connect(uriTeste, { serverSelectionTimeoutMS: 7000 });
    } catch {
      throw new Error('Não foi possível conectar ao MongoDB de teste. Verifique MONGODB_TEST_URI sem exibir seu valor.');
    }

    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== 'isdbgrid') {
      await mongoose.disconnect();
      throw new Error('O MongoDB configurado não anuncia suporte a transações; use um replica set ou mongos de teste.');
    }

    await Promise.all(modelosComIndices.map(modelo => modelo.init()));
  });

  afterEach(limparDocumentosCriados);

  after(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });

  test('compra de avatar registra débito e aquisição na mesma transação', async () => {
    const aluno = await criarAluno();
    await inserir(MovimentacaoMoeda, {
      aluno: aluno._id,
      tipo: 'ganho',
      quantidade: 100,
      motivo: 'Crédito inicial de teste'
    });

    const avatar = lojaService.buscarAvatarCatalogo('avatar-05');
    const compra = await lojaService.comprar({ alunoId: aluno._id, avatar });

    assert.equal(compra.saldo, 70);
    assert.equal(await calcularSaldoMoedas(aluno._id), 70);
    assert.equal(await MovimentacaoMoeda.countDocuments({ aluno: aluno._id, tipo: 'gasto', quantidade: avatar.preco }), 1);
    assert.equal(await AvatarAluno.countDocuments({ aluno: aluno._id, avatarId: avatar.id }), 1);
  });

  test('falha na gravação da aquisição reverte débito e atualização do aluno', async () => {
    const aluno = await criarAluno();
    await inserir(MovimentacaoMoeda, {
      aluno: aluno._id,
      tipo: 'ganho',
      quantidade: 100,
      motivo: 'Crédito inicial de rollback'
    });

    const criarAquisicaoOriginal = AvatarAluno.create;
    AvatarAluno.create = async () => { throw new Error('Falha de gravação injetada no teste.'); };
    try {
      await assert.rejects(
        lojaService.comprar({ alunoId: aluno._id, avatar: lojaService.buscarAvatarCatalogo('avatar-05') }),
        /Falha de gravação injetada/
      );
    } finally {
      AvatarAluno.create = criarAquisicaoOriginal;
    }

    assert.equal(await calcularSaldoMoedas(aluno._id), 100);
    assert.equal(await MovimentacaoMoeda.countDocuments({ aluno: aluno._id, tipo: 'gasto' }), 0);
    assert.equal(await AvatarAluno.countDocuments({ aluno: aluno._id }), 0);
    assert.equal((await Aluno.findById(aluno._id)).versaoMovimentacoesMoeda, 0);
  });

  test('gastos concorrentes respeitam saldo e o saldo final do aluno', async () => {
    const aluno = await criarAluno();
    await inserir(MovimentacaoMoeda, {
      aluno: aluno._id,
      tipo: 'ganho',
      quantidade: 100,
      motivo: 'Crédito para concorrência'
    });

    const resultados = await Promise.allSettled([
      gastarMoedas({ alunoId: aluno._id, quantidade: 70, motivo: 'Gasto concorrente A' }),
      gastarMoedas({ alunoId: aluno._id, quantidade: 70, motivo: 'Gasto concorrente B' })
    ]);

    assert.equal(resultados.filter(resultado => resultado.status === 'fulfilled').length, 1);
    assert.equal(resultados.filter(resultado => resultado.status === 'rejected' && resultado.reason.status === 409).length, 1);
    assert.equal(await calcularSaldoMoedas(aluno._id), 30);
    assert.equal(await MovimentacaoMoeda.countDocuments({ aluno: aluno._id, tipo: 'gasto' }), 1);
  });

  test('conclusões concorrentes concedem uma única recompensa por aluno e atividade', async () => {
    const aluno = await criarAluno();
    const atividadeId = new mongoose.Types.ObjectId();
    const atividade = await inserir(Atividade, {
      _id: atividadeId,
      turma: aluno.turma,
      professorCriador: new mongoose.Types.ObjectId(),
      titulo: `Atividade ${novoSufixo()}`,
      historia: { tipo: 'propria', texto: 'História de integração.' },
      status: 'publicada',
      publicadoEm: new Date()
    });
    registrar(Atividade, atividade._id);
    await inserir(ProgressoAtividade, { aluno: aluno._id, atividade: atividade._id, status: 'iniciada' });

    const resultados = await Promise.all([
      progressoService.concluir({ alunoId: aluno._id, atividadeId: atividade._id }),
      progressoService.concluir({ alunoId: aluno._id, atividadeId: atividade._id })
    ]);

    assert.equal(resultados.filter(resultado => resultado.resultado.movimentacao).length, 1);
    assert.equal(await MovimentacaoMoeda.countDocuments({ aluno: aluno._id, atividade: atividade._id, tipo: 'ganho' }), 1);
    assert.equal(await calcularSaldoMoedas(aluno._id), 10);
    assert.equal((await ProgressoAtividade.findOne({ aluno: aluno._id, atividade: atividade._id })).status, 'concluida');
  });

  test('índices únicos do banco impedem aquisições, progressos e recompensas duplicados', async () => {
    const aluno = await criarAluno();
    const atividadeId = new mongoose.Types.ObjectId();
    registrar(Atividade, atividadeId);

    await inserir(AvatarAluno, { aluno: aluno._id, avatarId: 'unico' });
    await assert.rejects(AvatarAluno.create({ aluno: aluno._id, avatarId: 'unico' }), erro => erro.code === 11000);

    await inserir(ProgressoAtividade, { aluno: aluno._id, atividade: atividadeId, status: 'iniciada' });
    await assert.rejects(ProgressoAtividade.create({ aluno: aluno._id, atividade: atividadeId, status: 'iniciada' }), erro => erro.code === 11000);

    const recompensa = {
      aluno: aluno._id,
      atividade: atividadeId,
      tipo: 'ganho',
      quantidade: 10,
      motivo: 'Conclusão de atividade'
    };
    await inserir(MovimentacaoMoeda, recompensa);
    await assert.rejects(MovimentacaoMoeda.create(recompensa), erro => erro.code === 11000);

    const indicesMovimentacao = await MovimentacaoMoeda.collection.listIndexes().toArray();
    assert.ok(indicesMovimentacao.some(indice => indice.name === 'uma_recompensa_por_atividade_aluno' && indice.unique));
  });

  test('escola referenciada por turma ou professor não é excluída', async () => {
    for (const vinculos of [
      { turma: true, professor: false },
      { turma: false, professor: true },
      { turma: true, professor: true }
    ]) {
      const sufixo = novoSufixo();
      const escola = await inserir(Escola, {
        nome: `Escola integração ${sufixo}`,
        codigoPermanente: `IT-ESC-${sufixo}`,
        municipio: 'Teste',
        endereco: 'Endereço de teste',
        email: `escola-${sufixo}@integration.test`,
        contato: '0000000000'
      });
      const professor = await inserir(Professor, {
        nome: `Professor ${sufixo}`,
        email: `professor-${sufixo}@integration.test`,
        senha: 'hash-de-teste',
        escolas: vinculos.professor ? [escola._id] : []
      });
      let turma;
      if (vinculos.turma) {
        turma = await inserir(Turma, {
          nome: `Turma ${sufixo}`,
          codigoPermanente: `IT-TUR-${sufixo}`,
          anoEscolar: 2026,
          escola: escola._id,
          professorResponsavel: professor._id
        });
      }

      const resultado = await escolaService.excluir(escola._id);

      assert.deepEqual(resultado, { erro: 'escola-vinculada' });
      assert.ok(await Escola.exists({ _id: escola._id }));
      if (turma) assert.ok(await Turma.exists({ _id: turma._id }));
      if (vinculos.professor) assert.ok(await Professor.exists({ _id: professor._id }));
    }
  });
});
