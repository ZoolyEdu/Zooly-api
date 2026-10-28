import mongoose from 'mongoose';
import historiaService from '../services/historiaService.js';

function historiaPublica(historia) {
  return {
    _id: historia._id,
    titulo: historia.titulo,
    conteudo: historia.conteudo
  };
}

async function listarHistorias(req, res, next) {
  try {
    const historias = await historiaService.listarHistorias();

    return res.status(200).json({
      sucesso: true,
      total: historias.length,
      historias: historias.map(historiaPublica)
    });
  } catch (error) {
    return next(error);
  }
}

async function obterHistoria(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID de história inválido.'
      });
    }

    const historia = await historiaService.obterHistoriaPorId(req.params.id);

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
}

export default { listarHistorias, obterHistoria };
