import { Router } from 'express';
import autenticarToken from '../middlewares/autenticarToken.js';
import autorizarPerfil from '../middlewares/autorizarPerfil.js';
import escolaController from '../controllers/escolaController.js';

const router = Router();

router.use(autenticarToken, autorizarPerfil('administrador'));

router.post('/', escolaController.cadastrar);
router.get('/', escolaController.listar);
router.get('/:id', escolaController.obterPorId);
router.put('/:id', escolaController.atualizar);
router.delete('/:id', escolaController.excluir);

export default router;
