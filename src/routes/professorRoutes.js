import { Router } from 'express';
import bcrypt from 'bcryptjs';
import Professor from '../models/Professor.js';
import Escola from '../models/Escola.js';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const { nome, email, senha, codigoPermanente } = req.body;

    if (
      typeof nome !== 'string' ||
      typeof email !== 'string' ||
      typeof senha !== 'string' ||
      typeof codigoPermanente !== 'string' ||
      !nome.trim() ||
      !email.trim() ||
      !senha ||
      !codigoPermanente.trim()
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem:
          'Nome, e-mail, senha e código permanente da escola são obrigatórios.'
      });
    }

    const emailNormalizado = email.trim().toLowerCase();
    const codigoNormalizado = codigoPermanente.trim();

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

    const escola = await Escola.findOne({
      codigoPermanente: codigoNormalizado
    });

    if (!escola) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Código permanente da escola inválido.'
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
      senha: senhaHash,
      escolas: [escola._id]
    });

    return res.status(201).json({
      sucesso: true,
      mensagem: 'Professor cadastrado com sucesso.',
      professor: {
        id: professor._id,
        nome: professor.nome,
        email: professor.email,
        escolas: professor.escolas
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
