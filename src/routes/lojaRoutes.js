import { Router } from 'express';
import autenticarToken from '../middlewares/autenticarToken.js';
import autorizarPerfil from '../middlewares/autorizarPerfil.js';
import lojaController from '../controllers/lojaController.js';

const router = Router();
router.use(autenticarToken, autorizarPerfil('aluno'));

router.get('/avatares', lojaController.listarAvatares);
router.post('/avatares/:avatarId/comprar', lojaController.comprarAvatar);

export default router;
