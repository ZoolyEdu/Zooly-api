
import express from 'express';
import cors from 'cors';
import healthRoutes from './routes/healthRoutes.js';

const app = express();

app.use(cors());
app.use(express.json());

// Rota inicial
app.get('/', (req, res) => {
  res.status(200).json({
    mensagem: 'Bem-vindo à API do Zooly!',
    status: 'online'
  });
});

// Rotas
app.use('/api/health', healthRoutes);


// Rota não encontrada (404)
app.use((req, res) => {
  res.status(404).json({
    sucesso: false,
    mensagem: 'Rota não encontrada.'
  });
});

// Middleware centralizado de erros
app.use((err, req, res, next) => {
  console.error('Erro na API:', err.message);

  if (res.headersSent) {
    return next(err);
  }

  res.status(err.status || err.statusCode || 500).json({
    sucesso: false,
    mensagem:
      err.status && err.status < 500
        ? err.message
        : 'Ocorreu um erro interno no servidor.'
  });
});


export default app;
