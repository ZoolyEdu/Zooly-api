import { Router } from 'express';
import bcrypt from 'bcryptjs';
import Professor from '../models/Professor.js';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const { nome, email, senha } = req.body;

    if (
      typeof nome !== 'string' ||
      typeof email !== 'string' ||
      typeof senha !== 'string' ||
      !nome.trim() ||
      !email.trim() ||
      !senha
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Nome, e-mail e senha são obrigatórios.'
      });
    }

    const emailNormalizado = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Informe um e-mail válido.'
      });
    }

    if (senha.length < 8) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'A senha deve ter pelo menos 8 caracteres.'
      });
    }

    const professorExistente = await Professor.findOne({
      email: emailNormalizado
    });

    if (professorExistente) {
      return res.status(409).json({
        sucesso: false,
        mensagem: 'Este e-mail já está cadastrado.'
      });
    }

    const senhaHash = await bcrypt.hash(senha, 12);

    const professor = await Professor.create({
      nome: nome.trim(),
      email: emailNormalizado,
      senha: senhaHash
    });

    return res.status(201).json({
      sucesso: true,
      mensagem: 'Professor cadastrado com sucesso.',
      professor: {
        id: professor._id,
        nome: professor.nome,
        email: professor.email
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        sucesso: false,
        mensagem: 'Este e-mail já está cadastrado.'
      });
    }

    next(error);
  }
});

export default router;