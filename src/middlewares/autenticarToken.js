import jwt from 'jsonwebtoken';

export default function autenticarToken(req, res, next) {
  const cabecalho = req.headers.authorization;

  if (!cabecalho || !cabecalho.startsWith('Bearer ')) {
    return res.status(401).json({
      sucesso: false,
      mensagem: 'Token de autenticação não informado.'
    });
  }

  const token = cabecalho.slice(7);

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Autenticação não configurada no servidor.'
    });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    req.usuario = {
      id: payload.sub,
      tipo: payload.tipo,
      nome: payload.nome
    };

    return next();
  } catch {
    return res.status(401).json({
      sucesso: false,
      mensagem: 'Token inválido ou expirado.'
    });
  }
}
