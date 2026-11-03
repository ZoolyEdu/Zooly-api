import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import Professor from "../models/Professor.js";
import Escola from "../models/Escola.js";
import { erroHttp } from "../utils/erros.js";

async function cadastrar({ nome, email, senha, codigoPermanente }) {
  const escola = await Escola.findOne({ codigoPermanente });

  if (!escola) {
    throw erroHttp("Código permanente da escola inválido.", 400);
  }

  const professorExistente = await Professor.findOne({ email });

  if (professorExistente) {
    throw erroHttp("Este e-mail já está cadastrado.", 409);
  }

  const senhaHash = await bcrypt.hash(senha, 12);

  return Professor.create({
    nome,
    email,
    senha: senhaHash,
    escolas: [escola._id],
  });
}

async function obterPerfil(professorId) {
  if (!mongoose.isValidObjectId(professorId)) return null;

  return Professor.findById(professorId)
    .select("nome email escolas")
    .populate(
      "escolas",
      "nome codigoPermanente municipio endereco email contato",
    );
}

export default { cadastrar, obterPerfil };
