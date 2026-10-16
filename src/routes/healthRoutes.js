import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    mensagem: 'API do Zooly funcionando!',
    timestamp: new Date().toISOString()
  });
});

export default router;