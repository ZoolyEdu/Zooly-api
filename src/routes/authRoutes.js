
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Professor from '../models/Professor.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const { email, senha } = req.body;

    if (
      typeof email !== 'string' ||
      typeof senha !== 'string' ||
      !email.trim() ||
      !senha
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'E-mail e senha são obrigatórios.'
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        sucesso: false,
        mensagem: 'Autenticação não configurada no servidor.'
      });
    }

    const professor = await Professor.findOne({
      email: email.trim().toLowerCase()
    }).select('+senha');

    if (!professor || !(await bcrypt.compare(senha, professor.senha))) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'E-mail ou senha inválidos.'
      });
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

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Login realizado com sucesso.',
      token,
      usuario: {
        id: professor._id,
        nome: professor.nome,
        email: professor.email,
        tipo: 'professor'
      }
    });
  } catch (error) {
    next(error);
  }
});
router.post('/admin/login', async (req, res, next) => {
  try {
    const { email, senha } = req.body;

    if (
      typeof email !== 'string' ||
      typeof senha !== 'string' ||
      !email.trim() ||
      !senha
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'E-mail e senha são obrigatórios.'
      });
    }

    const emailAdmin = process.env.ADMIN_EMAIL;
    const hashAdmin = process.env.ADMIN_SENHA_HASH;

    if (!process.env.JWT_SECRET || !emailAdmin || !hashAdmin) {
      return res.status(500).json({
        sucesso: false,
        mensagem: 'Autenticação do administrador não configurada.'
      });
    }

    const emailValido =
      email.trim().toLowerCase() === emailAdmin.trim().toLowerCase();

    const senhaValida = await bcrypt.compare(senha, hashAdmin);

    if (!emailValido || !senhaValida) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'E-mail ou senha inválidos.'
      });
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

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Login de administrador realizado com sucesso.',
      token,
      usuario: {
        id: 'admin-configurado',
        nome: 'Administrador',
        email: emailAdmin,
        tipo: 'administrador'
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
