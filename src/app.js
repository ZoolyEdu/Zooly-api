
import express from 'express';
import cors from 'cors';
import healthRoutes from './routes/healthRoutes.js';
import professorRoutes from './routes/professorRoutes.js';
import authRoutes from './routes/authRoutes.js';
import escolaRoutes from './routes/escolaRoutes.js';
import turmaRoutes from './routes/turmaRoutes.js';
import alunoRoutes from './routes/alunoRoutes.js';
import historiaRoutes from './routes/historiaRoutes.js';
import atividadeRoutes from './routes/atividadeRoutes.js';


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
app.use('/api/professores', professorRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/escolas', escolaRoutes);
app.use('/api/turmas', turmaRoutes);
app.use('/api/alunos', alunoRoutes);
app.use('/api/historias', historiaRoutes);
app.use('/api/atividades', atividadeRoutes);

// Rota não encontrada (404)
app.use((req, res) => {
  res.status(404).json({
    sucesso: false,
    mensagem: 'Rota não encontrada.'
  });
});

// Middleware centralizado de erros
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  console.error('Erro na API:', err.message);

  // Dados inválidos no Mongoose
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    return res.status(400).json({
      sucesso: false,
      mensagem: 'Dados inválidos.',
      detalhes:
        err.name === 'ValidationError'
          ? Object.values(err.errors).map((erro) => erro.message)
          : undefined
    });
  }

  // Campo único duplicado no MongoDB
  if (err.code === 11000) {
    return res.status(409).json({
      sucesso: false,
      mensagem: 'Já existe um registro com um dos dados informados.'
    });
  }

  // Erros de cliente explicitamente identificados
  const status = err.status || err.statusCode;

  if (status >= 400 && status < 500) {
    return res.status(status).json({
      sucesso: false,
      mensagem: err.message || 'Não foi possível processar a solicitação.'
    });
  }

  // Erros inesperados: não expor detalhes internos
  return res.status(500).json({
    sucesso: false,
    mensagem: 'Ocorreu um erro interno no servidor.'
  });
});

export default app;
