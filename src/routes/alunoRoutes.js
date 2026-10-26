
import { Router } from 'express';
import Aluno from '../models/Aluno.js';
import autenticarToken from '../middlewares/autenticarToken.js';
import autorizarPerfil from '../middlewares/autorizarPerfil.js';
import AvatarAluno from '../models/AvatarAluno.js';
import catalogoAvatares from '../config/catalogoAvatares.js';
import alunoController from '../controllers/alunoController.js';

const router = Router();

// Este caminho vem antes de /:alunoId para que "me" não seja tratado como um ID.
router.put('/me/avatar', autenticarToken, autorizarPerfil('aluno'), async (req, res, next) => {
  try {
    const { avatarId } = req.body ?? {};
    if (typeof avatarId !== 'string' || Object.keys(req.body ?? {}).some(chave => chave !== 'avatarId')) {
      return res.status(400).json({ sucesso: false, mensagem: 'Informe somente avatarId.' });
    }
    if (!catalogoAvatares.some(avatar => avatar.id === avatarId)) {
      return res.status(404).json({ sucesso: false, mensagem: 'Avatar não encontrado.' });
    }
    const possui = await AvatarAluno.exists({ aluno: req.usuario.id, avatarId });
    if (!possui) return res.status(409).json({ sucesso: false, mensagem: 'O avatar ainda não foi adquirido.' });
    const atualizacao = await Aluno.updateOne({ _id: req.usuario.id }, { $set: { avatarSelecionado: avatarId } });
    if ((atualizacao.matchedCount ?? atualizacao.n) === 0) {
      return res.status(404).json({ sucesso: false, mensagem: 'Aluno não encontrado.' });
    }
    return res.status(200).json({ sucesso: true, avatarSelecionado: avatarId });
  } catch (erro) { return next(erro); }
});

router.post('/', autenticarToken, autorizarPerfil('professor'), alunoController.cadastrar);

router.get(
  '/turma/:turmaId',
  autenticarToken,
  autorizarPerfil('professor'),
  alunoController.listarPorTurma
);

router.put(
  '/:alunoId',
  autenticarToken,
  autorizarPerfil('professor'),
  alunoController.atualizar
);

router.patch(
  '/cadastro-inicial',
  autenticarToken,
  autorizarPerfil('aluno'),
  alunoController.concluirCadastroInicial
);

export default router;
