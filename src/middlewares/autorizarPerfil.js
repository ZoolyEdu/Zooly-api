export default function autorizarPerfil(...perfisPermitidos) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Autenticação necessária.'
      });
    }

    if (!perfisPermitidos.includes(req.usuario.tipo)) {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Você não tem permissão para realizar esta operação.'
      });
    }

    next();
  };
}