import mongoose from "mongoose";
import Aluno from "../models/Aluno.js";
import Professor from "../models/Professor.js";
import Turma from "../models/Turma.js";
import AvatarAluno from "../models/AvatarAluno.js";
import catalogoAvatares from "../config/catalogoAvatares.js";
import { normalizarRa } from "../utils/ra.js";

// Cada professor gerencia somente os alunos das turmas pelas quais é responsável.
function professorTemAcesso(professor, turma) {
  return String(turma.professorResponsavel) === String(professor._id);
}

async function cadastrar({ ra, turmaId, professorId }) {
  const raNormalizado = normalizarRa(ra);
  if (!raNormalizado) return { erro: "ra-invalido" };
  const turma = await Turma.findById(turmaId);

  if (!turma || turma.arquivada) return { erro: "turma-nao-encontrada" };

  const professor = await Professor.findById(professorId);

  if (!professor || !professorTemAcesso(professor, turma)) {
    return { erro: "sem-permissao-cadastro" };
  }

  const aluno = await Aluno.create({
    ra: raNormalizado,
    turma: turma._id,
  });

  return { aluno };
}

async function listarPorTurma({ turmaId, professorId }) {
  const turma = await Turma.findById(turmaId);

  if (!turma || turma.arquivada) return { erro: "turma-nao-encontrada" };

  const professor = await Professor.findById(professorId);

  if (!professor || !professorTemAcesso(professor, turma)) {
    return { erro: "sem-permissao-listagem" };
  }

  const alunos = await Aluno.find({ turma: turma._id })
    .select("_id ra nomeCompleto sexo cadastroInicialConcluido turma createdAt")
    .sort({ nomeCompleto: 1, _id: 1 });

  return { alunos };
}

async function atualizar({ alunoId, ra, turmaId, professorId }) {
  const aluno = await Aluno.findById(alunoId);

  if (!aluno) return { erro: "aluno-nao-encontrado" };

  const professor = await Professor.findById(professorId);
  const turmaAtual = await Turma.findById(aluno.turma);

  if (!professor || !turmaAtual || !professorTemAcesso(professor, turmaAtual)) {
    return { erro: "sem-permissao-edicao" };
  }

  // Reenviar o RA atual (mesmo antigo, fora do padrão) não é uma troca: nada muda.
  // Um RA diferente é um registro novo e precisa ter exatamente 13 dígitos.
  const mesmoRa = typeof ra === "string" && ra.trim() === aluno.ra;
  if (ra !== undefined && !mesmoRa) {
    const raNormalizado = normalizarRa(ra);

    if (!raNormalizado) return { erro: "ra-invalido" };

    const existente = await Aluno.findOne({
      ra: raNormalizado,
      _id: { $ne: aluno._id },
    });

    if (existente) return { erro: "ra-duplicado" };

    aluno.ra = raNormalizado;
  }

  if (turmaId !== undefined) {
    const novaTurma = await Turma.findById(turmaId);

    if (!novaTurma || novaTurma.arquivada) {
      return { erro: "nova-turma-nao-encontrada" };
    }

    if (!professorTemAcesso(professor, novaTurma)) {
      return { erro: "sem-permissao-nova-turma" };
    }

    aluno.turma = novaTurma._id;
  }

  await aluno.save();
  return { aluno };
}

async function concluirCadastroInicial({
  alunoId,
  nomeCompleto,
  codigoPermanente,
  sexo,
}) {
  const aluno = await Aluno.findById(alunoId);

  if (!aluno) return { erro: "aluno-nao-encontrado" };

  if (aluno.cadastroInicialConcluido) return { erro: "cadastro-ja-concluido" };

  const turma = await Turma.findById(aluno.turma);

  if (!turma || turma.arquivada) return { erro: "turma-nao-encontrada" };

  if (turma.codigoPermanente !== codigoPermanente.trim().toUpperCase()) {
    return { erro: "codigo-turma-invalido" };
  }

  aluno.nomeCompleto = nomeCompleto.trim();
  aluno.sexo = sexo;
  aluno.cadastroInicialConcluido = true;

  await aluno.save();
  return { aluno };
}

async function obterPerfil(alunoId) {
  if (!mongoose.isValidObjectId(alunoId)) return null;

  return Aluno.findById(alunoId)
    .select(
      "ra nomeCompleto sexo turma cadastroInicialConcluido avatarSelecionado",
    )
    .populate("turma", "nome periodo mascote");
}

async function selecionarAvatar({ alunoId, avatarId }) {
  if (!catalogoAvatares.some((avatar) => avatar.id === avatarId))
    return { erro: "avatar-nao-encontrado" };

  const possui = await AvatarAluno.exists({ aluno: alunoId, avatarId });
  if (!possui) return { erro: "avatar-nao-adquirido" };

  const atualizacao = await Aluno.updateOne(
    { _id: alunoId },
    { $set: { avatarSelecionado: avatarId } },
  );
  if ((atualizacao.matchedCount ?? atualizacao.n) === 0)
    return { erro: "aluno-nao-encontrado" };
  return { avatarSelecionado: avatarId };
}

export default {
  cadastrar,
  listarPorTurma,
  atualizar,
  concluirCadastroInicial,
  obterPerfil,
  selecionarAvatar,
};
