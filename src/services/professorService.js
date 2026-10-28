import bcrypt from 'bcryptjs';
import Professor from '../models/Professor.js';
import Escola from '../models/Escola.js';

async function cadastrar({ nome, email, senha, codigoPermanente }) {
  const escola = await Escola.findOne({ codigoPermanente });

  if (!escola) {
    const error = new Error('Código permanente da escola inválido.');
    error.status = 400;
    throw error;
  }

  const professorExistente = await Professor.findOne({ email });

  if (professorExistente) {
    const error = new Error('Este e-mail já está cadastrado.');
    error.status = 409;
    throw error;
  }

  const senhaHash = await bcrypt.hash(senha, 12);

  return Professor.create({
    nome,
    email,
    senha: senhaHash,
    escolas: [escola._id]
  });
}

export default { cadastrar };
