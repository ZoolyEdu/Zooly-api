import authService from '../services/authService.js';

async function loginProfessor(req, res, next) {
  try {
    const { email, senha } = req.body ?? {};

    if (
      typeof email !== 'string' ||
      typeof senha !== 'string' ||
      !email.trim() ||
      !senha
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'E-mail e senha são obrigatórios.'
      });
    }

    const resultado = await authService.loginProfessor(email, senha);

    if (resultado.erro === 'jwt-nao-configurado') {
      return res.status(500).json({
        sucesso: false,
        mensagem: 'Autenticação não configurada no servidor.'
      });
    }

    if (resultado.erro === 'credenciais-invalidas') {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'E-mail ou senha inválidos.'
      });
    }

    const { professor, token } = resultado;

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Login realizado com sucesso.',
      token,
      usuario: {
        id: professor._id,
        nome: professor.nome,
        email: professor.email,
        tipo: 'professor'
      }
    });
  } catch (error) {
    return next(error);
  }
}

export default { loginProfessor };
