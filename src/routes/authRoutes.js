
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Aluno from '../models/Aluno.js';
import Turma from '../models/Turma.js';
import authController from '../controllers/authController.js';

const router = Router();

// Login do professor
router.post('/login', authController.loginProfessor);

// Login do administrador
router.post('/admin/login', authController.loginAdmin);

// Login do aluno já cadastrado
router.post('/aluno/login', async (req, res, next) => {
  try {
    const { ra, senha } = req.body;

    if (
      typeof ra !== 'string' ||
      !ra.trim() ||
      typeof senha !== 'string' ||
      !senha
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'RA e senha são obrigatórios.'
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        sucesso: false,
        mensagem: 'Autenticação não configurada no servidor.'
      });
    }

    const aluno = await Aluno.findOne({
      ra: ra.trim()
    });

    if (!aluno) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'RA ou senha inválidos.'
      });
    }

    const turma = await Turma.findById(aluno.turma)
      .select('+senhaAcessoHash');

    if (
      !turma ||
      turma.arquivada ||
      !turma.senhaAcessoHash ||
      !(await bcrypt.compare(senha, turma.senhaAcessoHash))
    ) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'RA ou senha inválidos.'
      });
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

    return res.status(200).json({
      sucesso: true,
      mensagem: aluno.cadastroInicialConcluido
        ? 'Login realizado com sucesso.'
        : 'Login realizado. É necessário concluir o cadastro inicial.',
      token,
      cadastroInicialPendente: !aluno.cadastroInicialConcluido,
      usuario: {
        id: aluno._id,
        ra: aluno.ra,
        nome: aluno.nomeCompleto,
        turma: turma._id,
        tipo: 'aluno'
      }
    });
  } catch (error) {
    next(error);
  }
});

// Entrada e cadastro do aluno por código permanente da turma
router.post('/aluno/entrar-turma', async (req, res, next) => {
  try {
    const { ra, codigoPermanente, senha } = req.body;

    if (
      typeof ra !== 'string' ||
      !ra.trim() ||
      typeof codigoPermanente !== 'string' ||
      !codigoPermanente.trim() ||
      typeof senha !== 'string' ||
      !senha
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'RA, código da turma e senha são obrigatórios.'
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        sucesso: false,
        mensagem: 'Autenticação não configurada no servidor.'
      });
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
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Código da turma ou senha inválidos.'
      });
    }

    let aluno = await Aluno.findOne({
      ra: ra.trim()
    });

    if (aluno && aluno.turma.toString() !== turma._id.toString()) {
      return res.status(409).json({
        sucesso: false,
        mensagem: 'Este RA já está associado a outra turma.'
      });
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
          return res.status(409).json({
            sucesso: false,
            mensagem: 'Este RA já está associado a outro cadastro.'
          });
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

    return res.status(alunoNovo ? 201 : 200).json({
      sucesso: true,
      mensagem: alunoNovo
        ? 'Entrada na turma realizada. Conclua seu cadastro inicial.'
        : 'Entrada na turma realizada com sucesso.',
      token,
      alunoNovo,
      cadastroInicialPendente: !aluno.cadastroInicialConcluido,
      usuario: {
        id: aluno._id,
        ra: aluno.ra,
        nome: aluno.nomeCompleto,
        turma: aluno.turma,
        tipo: 'aluno'
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
