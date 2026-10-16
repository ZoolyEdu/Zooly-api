import express from 'express';
import cors from 'cors';
import healthRoutes from './routes/healthRoutes.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    mensagem: 'Bem-vindo à API do Zooly!',
    status: 'online'
  });
});

app.use('/api/health', healthRoutes);

export default app;