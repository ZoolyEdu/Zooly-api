import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Professor from '../models/Professor.js';

async function loginProfessor(email, senha) {
  if (!process.env.JWT_SECRET) {
    return { erro: 'jwt-nao-configurado' };
  }

  const professor = await Professor.findOne({
    email: email.trim().toLowerCase()
  }).select('+senha');

  if (!professor || !(await bcrypt.compare(senha, professor.senha))) {
    return { erro: 'credenciais-invalidas' };
  }

  const token = jwt.sign(
    {
      tipo: 'professor',
      nome: professor.nome
    },
    process.env.JWT_SECRET,
    {
      subject: professor._id.toString(),
      expiresIn: process.env.JWT_EXPIRES_IN || '1h'
    }
  );

  return { professor, token };
}

export default { loginProfessor };
