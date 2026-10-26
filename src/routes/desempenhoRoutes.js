import { Router } from 'express';
import autenticarToken from '../middlewares/autenticarToken.js';
import autorizarPerfil from '../middlewares/autorizarPerfil.js';
import desempenhoController from '../controllers/desempenhoController.js';

const router = Router();
router.use(autenticarToken, autorizarPerfil('professor'));

router.get('/turmas/:turmaId', desempenhoController.turma);
router.get('/turmas/:turmaId/semanal', desempenhoController.semanal);
router.get('/turmas/:turmaId/semanal/pdf', desempenhoController.semanalPdf);
router.get('/alunos/:alunoId', desempenhoController.aluno);

export default router;
