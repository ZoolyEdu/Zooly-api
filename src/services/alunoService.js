import Aluno from '../models/Aluno.js';
import Professor from '../models/Professor.js';
import Turma from '../models/Turma.js';

function professorTemAcesso(professor, turma) {
  return professor.escolas.some(
    escolaId => escolaId.toString() === turma.escola.toString()
  );
}

async function cadastrar({ ra, turmaId, professorId }) {
  const turma = await Turma.findById(turmaId);

  if (!turma || turma.arquivada) return { erro: 'turma-nao-encontrada' };

  const professor = await Professor.findById(professorId);

  if (!professor || !professorTemAcesso(professor, turma)) {
    return { erro: 'sem-permissao-cadastro' };
  }

  const aluno = await Aluno.create({
    ra: String(ra).trim(),
    turma: turma._id
  });

  return { aluno };
}

async function listarPorTurma({ turmaId, professorId }) {
  const turma = await Turma.findById(turmaId);

  if (!turma || turma.arquivada) return { erro: 'turma-nao-encontrada' };

  const professor = await Professor.findById(professorId);

  if (!professor || !professorTemAcesso(professor, turma)) {
    return { erro: 'sem-permissao-listagem' };
  }

  const alunos = await Aluno.find({ turma: turma._id })
    .select('ra nomeCompleto sexo cadastroInicialConcluido turma createdAt')
    .sort({ nomeCompleto: 1, ra: 1 });

  return { alunos };
}

async function atualizar({ alunoId, ra, turmaId, professorId }) {
  const aluno = await Aluno.findById(alunoId);

  if (!aluno) return { erro: 'aluno-nao-encontrado' };

  const professor = await Professor.findById(professorId);
  const turmaAtual = await Turma.findById(aluno.turma);

  if (!professor || !turmaAtual || !professorTemAcesso(professor, turmaAtual)) {
    return { erro: 'sem-permissao-edicao' };
  }

  if (ra !== undefined) {
    const raNormalizado = String(ra).trim();

    if (!raNormalizado) return { erro: 'ra-vazio' };

    const existente = await Aluno.findOne({
      ra: raNormalizado,
      _id: { $ne: aluno._id }
    });

    if (existente) return { erro: 'ra-duplicado' };

    aluno.ra = raNormalizado;
  }

  if (turmaId !== undefined) {
    const novaTurma = await Turma.findById(turmaId);

    if (!novaTurma || novaTurma.arquivada) {
      return { erro: 'nova-turma-nao-encontrada' };
    }

    if (!professorTemAcesso(professor, novaTurma)) {
      return { erro: 'sem-permissao-nova-turma' };
    }

    aluno.turma = novaTurma._id;
  }

  await aluno.save();
  return { aluno };
}

async function concluirCadastroInicial({ alunoId, nomeCompleto, codigoPermanente, sexo }) {
  const aluno = await Aluno.findById(alunoId);

  if (!aluno) return { erro: 'aluno-nao-encontrado' };

  if (aluno.cadastroInicialConcluido) return { erro: 'cadastro-ja-concluido' };

  const turma = await Turma.findById(aluno.turma);

  if (!turma || turma.arquivada) return { erro: 'turma-nao-encontrada' };

  if (turma.codigoPermanente !== codigoPermanente.trim().toUpperCase()) {
    return { erro: 'codigo-turma-invalido' };
  }

  aluno.nomeCompleto = nomeCompleto.trim();
  aluno.sexo = sexo;
  aluno.cadastroInicialConcluido = true;

  await aluno.save();
  return { aluno };
}

export default { cadastrar, listarPorTurma, atualizar, concluirCadastroInicial };
