import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import Escola from '../models/Escola.js';
import Professor from '../models/Professor.js';
import Turma from '../models/Turma.js';

async function obterProfessor(professorId) {
  if (!mongoose.isValidObjectId(professorId)) return null;
  return Professor.findById(professorId).select('escolas');
}

function professorTemAcesso(professor, turma) {
  return professor.escolas.some(
    escolaId => escolaId.toString() === turma.escola.toString()
  );
}

function gerarCodigoPermanente() {
  return `TUR-${randomBytes(6).toString('hex').toUpperCase()}`;
}

async function cadastrar({ body, professorId }) {
  const { nome, escolaId, anoEscolar } = body;

  if (
    typeof nome !== 'string' ||
    !nome.trim() ||
    typeof escolaId !== 'string' ||
    !mongoose.isValidObjectId(escolaId) ||
    !Number.isInteger(anoEscolar) ||
    anoEscolar < 2000 ||
    anoEscolar > 2100
  ) return { erro: 'dados-invalidos' };

  const professor = await obterProfessor(professorId);
  if (!professor) return { erro: 'professor-nao-encontrado' };

  const escolaAutorizada = professor.escolas.some(id => id.toString() === escolaId);
  if (!escolaAutorizada) return { erro: 'professor-sem-vinculo-escola' };

  const escola = await Escola.findById(escolaId);
  if (!escola) return { erro: 'escola-nao-encontrada' };

  let turma;
  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    const codigoPermanente = gerarCodigoPermanente();
    try {
      turma = await Turma.create({
        nome: nome.trim(),
        codigoPermanente,
        anoEscolar,
        escola: escola._id,
        professorResponsavel: professor._id
      });
      break;
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }

  if (!turma) return { erro: 'codigo-nao-gerado' };
  return { turma };
}

async function listar(professorId) {
  const professor = await obterProfessor(professorId);
  if (!professor) return { erro: 'professor-nao-encontrado' };

  const turmas = await Turma.find({
    escola: { $in: professor.escolas },
    arquivada: false
  })
    .populate('escola', 'nome codigoPermanente')
    .populate('professorResponsavel', 'nome email')
    .sort({ nome: 1 });

  return { turmas };
}

async function consultar({ turmaId, professorId }) {
  if (!mongoose.isValidObjectId(turmaId)) return { erro: 'id-invalido' };

  const professor = await obterProfessor(professorId);
  if (!professor) return { erro: 'professor-nao-encontrado' };

  const turma = await Turma.findOne({ _id: turmaId, arquivada: false });
  if (!turma) return { erro: 'turma-nao-encontrada' };
  if (!professorTemAcesso(professor, turma)) return { erro: 'acesso-nao-autorizado' };

  await turma.populate('escola', 'nome codigoPermanente');
  await turma.populate('professorResponsavel', 'nome email');
  return { turma };
}

async function atualizar({ turmaId, professorId, body }) {
  if (!mongoose.isValidObjectId(turmaId)) return { erro: 'id-invalido' };

  const professor = await obterProfessor(professorId);
  if (!professor) return { erro: 'professor-nao-encontrado' };

  const turma = await Turma.findById(turmaId);
  if (!turma || turma.arquivada) return { erro: 'turma-nao-encontrada' };
  if (!professorTemAcesso(professor, turma)) return { erro: 'acesso-nao-autorizado' };

  const { nome, anoEscolar } = body;

  if (Object.hasOwn(body, 'nome')) {
    if (typeof nome !== 'string' || !nome.trim()) return { erro: 'nome-invalido' };
    turma.nome = nome.trim();
  }

  if (Object.hasOwn(body, 'anoEscolar')) {
    if (!Number.isInteger(anoEscolar) || anoEscolar < 2000 || anoEscolar > 2100) {
      return { erro: 'ano-escolar-invalido' };
    }
    turma.anoEscolar = anoEscolar;
  }

  await turma.save();
  return { turma };
}

async function definirSenhaAcesso({ turmaId, professorId, body }) {
  if (!mongoose.isValidObjectId(turmaId)) return { erro: 'id-invalido' };

  const { senha } = body;
  if (typeof senha !== 'string' || senha.trim().length < 4 || senha.trim().length > 20) {
    return { erro: 'senha-invalida' };
  }

  const professor = await obterProfessor(professorId);
  if (!professor) return { erro: 'professor-nao-encontrado' };

  const turma = await Turma.findById(turmaId);
  if (!turma || turma.arquivada) return { erro: 'turma-ou-arquivada-nao-encontrada' };
  if (!professorTemAcesso(professor, turma)) return { erro: 'acesso-nao-autorizado' };

  turma.senhaAcessoHash = await bcrypt.hash(senha.trim(), 10);
  await turma.save();
  return { configurada: true };
}

async function arquivar({ turmaId, professorId }) {
  if (!mongoose.isValidObjectId(turmaId)) return { erro: 'id-invalido' };

  const professor = await obterProfessor(professorId);
  if (!professor) return { erro: 'professor-nao-encontrado' };

  const turma = await Turma.findById(turmaId);
  if (!turma || turma.arquivada) return { erro: 'turma-ja-arquivada-ou-inexistente' };
  if (!professorTemAcesso(professor, turma)) return { erro: 'acesso-nao-autorizado' };

  turma.arquivada = true;
  await turma.save();
  return { arquivada: true };
}

export default { cadastrar, listar, consultar, atualizar, definirSenhaAcesso, arquivar };
