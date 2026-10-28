import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Aluno from '../models/Aluno.js';
import Professor from '../models/Professor.js';
import Turma from '../models/Turma.js';

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

async function loginAluno(ra, senha) {
  if (!process.env.JWT_SECRET) {
    return { erro: 'jwt-nao-configurado' };
  }

  const aluno = await Aluno.findOne({
    ra: ra.trim()
  });

  if (!aluno) {
    return { erro: 'credenciais-invalidas' };
  }

  const turma = await Turma.findById(aluno.turma)
    .select('+senhaAcessoHash');

  if (
    !turma ||
    turma.arquivada ||
    !turma.senhaAcessoHash ||
    !(await bcrypt.compare(senha, turma.senhaAcessoHash))
  ) {
    return { erro: 'credenciais-invalidas' };
  }

  const token = jwt.sign(
    {
      tipo: 'aluno',
      nome: aluno.nomeCompleto || 'Aluno'
    },
    process.env.JWT_SECRET,
    {
      subject: aluno._id.toString(),
      expiresIn: process.env.JWT_EXPIRES_IN || '1h'
    }
  );

  return { aluno, turma, token };
}

async function entrarTurma(ra, codigoPermanente, senha) {
  if (!process.env.JWT_SECRET) {
    return { erro: 'jwt-nao-configurado' };
  }

  const turma = await Turma.findOne({
    codigoPermanente: codigoPermanente.trim().toUpperCase()
  }).select('+senhaAcessoHash');

  if (
    !turma ||
    turma.arquivada ||
    !turma.senhaAcessoHash ||
    !(await bcrypt.compare(senha, turma.senhaAcessoHash))
  ) {
    return { erro: 'credenciais-invalidas' };
  }

  let aluno = await Aluno.findOne({
    ra: ra.trim()
  });

  if (aluno && aluno.turma.toString() !== turma._id.toString()) {
    return { erro: 'ra-associado-outra-turma' };
  }

  let alunoNovo = false;

  if (!aluno) {
    try {
      aluno = await Aluno.create({
        ra: ra.trim(),
        turma: turma._id
      });

      alunoNovo = true;
    } catch (errorCriacao) {
      if (errorCriacao.code !== 11000) {
        throw errorCriacao;
      }

      aluno = await Aluno.findOne({
        ra: ra.trim()
      });

      if (
        !aluno ||
        aluno.turma.toString() !== turma._id.toString()
      ) {
        return { erro: 'conflito-cadastro-aluno' };
      }
    }
  }

  const token = jwt.sign(
    {
      tipo: 'aluno',
      nome: aluno.nomeCompleto || 'Aluno'
    },
    process.env.JWT_SECRET,
    {
      subject: aluno._id.toString(),
      expiresIn: process.env.JWT_EXPIRES_IN || '1h'
    }
  );

  return { aluno, alunoNovo, token };
}

export default { loginProfessor, loginAdmin, loginAluno, entrarTurma };
