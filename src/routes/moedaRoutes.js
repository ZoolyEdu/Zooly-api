import { Router } from 'express';
import autenticarToken from '../middlewares/autenticarToken.js';
import autorizarPerfil from '../middlewares/autorizarPerfil.js';
import moedaController from '../controllers/moedaController.js';

const router = Router();
router.use(autenticarToken, autorizarPerfil('aluno'));

router.get('/saldo', moedaController.saldo);
router.get('/movimentacoes', moedaController.movimentacoes);
router.post('/gastos', moedaController.gastos);

export default router;
