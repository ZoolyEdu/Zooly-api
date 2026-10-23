import { Router } from 'express';
import mongoose from 'mongoose';
import Aluno from '../models/Aluno.js';
import AvatarAluno from '../models/AvatarAluno.js';
import autenticarToken from '../middlewares/autenticarToken.js';
import autorizarPerfil from '../middlewares/autorizarPerfil.js';
import catalogoAvatares from '../config/catalogoAvatares.js';
import { comprarAvatar } from '../services/moedaService.js';

const router = Router();
router.use(autenticarToken, autorizarPerfil('aluno'));

router.get('/avatares', async (req, res, next) => {
  try {
    const adquiridos = await AvatarAluno.find({ aluno: req.usuario.id }).select('avatarId -_id');
    const idsAdquiridos = new Set(adquiridos.map(item => item.avatarId));
    return res.status(200).json({
      sucesso: true,
      avatares: catalogoAvatares.map(avatar => ({ ...avatar, adquirido: idsAdquiridos.has(avatar.id) }))
    });
  } catch (erro) { return next(erro); }
});

router.post('/avatares/:avatarId/comprar', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.usuario.id)) {
      return res.status(401).json({ sucesso: false, mensagem: 'Identidade do aluno inválida.' });
    }
    const avatar = catalogoAvatares.find(item => item.id === req.params.avatarId);
    if (!avatar) return res.status(404).json({ sucesso: false, mensagem: 'Avatar não encontrado.' });
    if (req.body && Object.keys(req.body).length) {
      return res.status(400).json({ sucesso: false, mensagem: 'A compra não aceita dados no corpo.' });
    }
    const resultado = await comprarAvatar({ alunoId: req.usuario.id, avatarId: avatar.id, preco: avatar.preco });
    return res.status(201).json({ sucesso: true, avatar, ...resultado });
  } catch (erro) { return next(erro); }
});

export default router;
