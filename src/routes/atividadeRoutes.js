import { Router } from 'express';
import autenticarToken from '../middlewares/autenticarToken.js';
import autorizarPerfil from '../middlewares/autorizarPerfil.js';
import atividadeController from '../controllers/atividadeController.js';

const router = Router();

router.use(autenticarToken, autorizarPerfil('professor'));

router.post('/', atividadeController.criar);
router.get('/publicadas', atividadeController.listarPublicadas);
router.patch('/:id/publicar', atividadeController.publicar);
router.delete('/:id', atividadeController.excluir);
router.put('/:id', atividadeController.atualizar);

export default router;
