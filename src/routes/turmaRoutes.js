import { Router } from 'express';
import autenticarToken from '../middlewares/autenticarToken.js';
import autorizarPerfil from '../middlewares/autorizarPerfil.js';
import turmaController from '../controllers/turmaController.js';

const router = Router();

router.use(autenticarToken, autorizarPerfil('professor'));

router.post('/', turmaController.cadastrar);
router.get('/', turmaController.listar);
router.get('/:id', turmaController.consultar);
router.put('/:id', turmaController.atualizar);
router.patch('/:id/senha-acesso', turmaController.definirSenhaAcesso);
router.patch('/:id/arquivar', turmaController.arquivar);

export default router;
