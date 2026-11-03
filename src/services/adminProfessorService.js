import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import Atividade from "../models/Atividade.js";
import Escola from "../models/Escola.js";
import Professor from "../models/Professor.js";
import Turma from "../models/Turma.js";

function filtroBusca(termo) {
  const busca = typeof termo === "string" ? termo.trim() : "";
  if (!busca) return {};
  const seguro = busca.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    $or: [
      { nome: { $regex: seguro, $options: "i" } },
      { email: { $regex: seguro, $options: "i" } },
    ],
  };
}

async function listar(termo) {
  return Professor.find(filtroBusca(termo))
    .select("nome email escolas createdAt updatedAt")
    .populate("escolas", "nome codigoPermanente")
    .sort({ nome: 1 });
}

async function obterPorId(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return Professor.findById(id)
    .select("nome email escolas createdAt updatedAt")
    .populate("escolas", "nome codigoPermanente");
}

async function atualizar(id, dados) {
  if (!mongoose.isValidObjectId(id))
    return { erro: "professor-nao-encontrado" };
  const professor = await Professor.findById(id);
  if (!professor) return { erro: "professor-nao-encontrado" };

  if (Object.hasOwn(dados, "email")) {
    const duplicado = await Professor.findOne({
      email: dados.email,
      _id: { $ne: id },
    });
    if (duplicado) return { erro: "email-duplicado" };
    professor.email = dados.email;
  }
  if (Object.hasOwn(dados, "nome")) professor.nome = dados.nome;

  if (Object.hasOwn(dados, "codigoPermanente")) {
    const escola = await Escola.findOne({
      codigoPermanente: dados.codigoPermanente,
    });
    if (!escola) return { erro: "escola-nao-encontrada" };
    const jaVinculadoSomenteANovaEscola =
      professor.escolas?.length === 1 &&
      String(professor.escolas[0]) === String(escola._id);
    if (
      !jaVinculadoSomenteANovaEscola &&
      (await Turma.exists({ professorResponsavel: id }))
    ) {
      return { erro: "professor-vinculado" };
    }
    professor.escolas = [escola._id];
  }

  if (dados.senha) professor.senha = await bcrypt.hash(dados.senha, 12);
  await professor.save();
  return { professor: await obterPorId(id) };
}

async function excluir(id) {
  if (!mongoose.isValidObjectId(id))
    return { erro: "professor-nao-encontrado" };
  const professor = await Professor.findById(id);
  if (!professor) return { erro: "professor-nao-encontrado" };

  const [temTurmas, temAtividades] = await Promise.all([
    Turma.exists({ professorResponsavel: id }),
    Atividade.exists({ professorCriador: id }),
  ]);
  if (temTurmas || temAtividades) return { erro: "professor-vinculado" };

  await Professor.findByIdAndDelete(id);
  return { professor };
}

export default { listar, obterPorId, atualizar, excluir };
