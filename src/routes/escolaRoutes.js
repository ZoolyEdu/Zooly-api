
import { Router } from 'express';
import mongoose from 'mongoose';
import Escola from '../models/Escola.js';
import autenticarToken from '../middlewares/autenticarToken.js';
import autorizarPerfil from '../middlewares/autorizarPerfil.js';

const router = Router();

// Todas as rotas de escolas exigem autenticação de administrador.
router.use(autenticarToken, autorizarPerfil('administrador'));

// Cadastrar escola
router.post('/', async (req, res, next) => {
  try {
    const escola = await Escola.create(req.body);

    return res.status(201).json({
      sucesso: true,
      mensagem: 'Escola cadastrada com sucesso.',
      escola
    });
  } catch (error) {
    next(error);
  }
});

// Listar escolas
router.get('/', async (req, res, next) => {
  try {
    const escolas = await Escola.find().sort({ nome: 1 });

    return res.status(200).json({
      sucesso: true,
      total: escolas.length,
      escolas
    });
  } catch (error) {
    next(error);
  }
});

// Consultar uma escola
router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID de escola inválido.'
      });
    }

    const escola = await Escola.findById(req.params.id);

    if (!escola) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Escola não encontrada.'
      });
    }

    return res.status(200).json({ sucesso: true, escola });
  } catch (error) {
    next(error);
  }
});

// Atualizar escola
router.put('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID de escola inválido.'
      });
    }

    const escola = await Escola.findById(req.params.id);

    if (!escola) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Escola não encontrada.'
      });
    }

    const camposPermitidos = [
      'nome',
      'cnpj',
      'codigoPermanente',
      'municipio',
      'endereco',
      'email',
      'contato'
    ];

    for (const campo of camposPermitidos) {
      if (Object.hasOwn(req.body, campo)) {
        escola.set(campo, req.body[campo]);
      }
    }

    await escola.save();

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Escola atualizada com sucesso.',
      escola
    });
  } catch (error) {
    next(error);
  }
});

// Excluir escola
router.delete('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID de escola inválido.'
      });
    }

    const escola = await Escola.findByIdAndDelete(req.params.id);

    if (!escola) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Escola não encontrada.'
      });
    }

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Escola excluída com sucesso.'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
