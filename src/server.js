import 'dotenv/config';
import app from './app.js';
import { connectDatabase } from './config/database.js';

const PORT = process.env.PORT || 3000;

async function startServer() {
  await connectDatabase();

  app.listen(PORT, () => {
    console.log(`Zooly API rodando na porta ${PORT}`);
  });
}

startServer().catch(error => {
  const codigo = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)
    ? error.code
    : 'MONGODB_CONNECTION_FAILED';
  console.error(`Falha ao iniciar a API: conexão com o MongoDB não estabelecida (${codigo}).`);
  process.exitCode = 1;
});
