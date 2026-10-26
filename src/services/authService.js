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

async function loginAdmin(email, senha) {
  const emailAdmin = process.env.ADMIN_EMAIL;
  const hashAdmin = process.env.ADMIN_SENHA_HASH;

  if (!process.env.JWT_SECRET || !emailAdmin || !hashAdmin) {
    return { erro: 'configuracao-admin-nao-configurada' };
  }

  const emailValido =
    email.trim().toLowerCase() === emailAdmin.trim().toLowerCase();
  const senhaValida = await bcrypt.compare(senha, hashAdmin);

  if (!emailValido || !senhaValida) {
    return { erro: 'credenciais-invalidas' };
  }

  const token = jwt.sign(
    {
      tipo: 'administrador',
      nome: 'Administrador'
    },
    process.env.JWT_SECRET,
    {
      subject: 'admin-configurado',
      expiresIn: process.env.JWT_EXPIRES_IN || '1h'
    }
  );

  return { token, emailAdmin };
}

export default { loginProfessor, loginAdmin };
