import { Router } from 'express';
import autenticarToken from '../middlewares/autenticarToken.js';
import autorizarPerfil from '../middlewares/autorizarPerfil.js';
import progressoController from '../controllers/progressoController.js';

const router = Router();

router.use(autenticarToken, autorizarPerfil('aluno'));

router.get('/turma/:turmaId/mapa', progressoController.mapa);
router.post('/atividades/:atividadeId/iniciar', progressoController.iniciar);
router.put('/atividades/:atividadeId/respostas', progressoController.respostas);
router.patch('/atividades/:atividadeId/concluir', progressoController.concluir);
router.get('/', progressoController.listar);
router.get('/atividades/:atividadeId', progressoController.obterPorAtividade);

export default router;
