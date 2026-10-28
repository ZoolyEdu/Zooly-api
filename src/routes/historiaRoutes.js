import { Router } from 'express';
import autenticarToken from '../middlewares/autenticarToken.js';
import autorizarPerfil from '../middlewares/autorizarPerfil.js';
import historiaController from '../controllers/historiaController.js';

const router = Router();

router.use(autenticarToken, autorizarPerfil('professor'));

router.get('/', historiaController.listarHistorias);
router.get('/:id', historiaController.obterHistoria);

export default router;
