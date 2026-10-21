import { Router } from 'express';
import mongoose from 'mongoose';
import Historia from '../models/Historia.js';
import autenticarToken from '../middlewares/autenticarToken.js';
import autorizarPerfil from '../middlewares/autorizarPerfil.js';

const router = Router();
const camposPublicos = '_id titulo conteudo';

router.use(autenticarToken, autorizarPerfil('professor'));

function historiaPublica(historia) {
  return {
    _id: historia._id,
    titulo: historia.titulo,
    conteudo: historia.conteudo
  };
}

router.get('/', async (req, res, next) => {
  try {
    const historias = await Historia.find()
      .select(camposPublicos)
      .sort({ titulo: 1 });

    return res.status(200).json({
      sucesso: true,
      total: historias.length,
      historias: historias.map(historiaPublica)
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID de história inválido.'
      });
    }

    const historia = await Historia.findById(req.params.id).select(camposPublicos);

    if (!historia) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'História não encontrada.'
      });
    }

    return res.status(200).json({ sucesso: true, historia: historiaPublica(historia) });
  } catch (error) {
    return next(error);
  }
});

export default router;
