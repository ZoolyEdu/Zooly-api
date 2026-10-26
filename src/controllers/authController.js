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

async function loginAdmin(req, res, next) {
  try {
    const { email, senha } = req.body;

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

    const resultado = await authService.loginAdmin(email, senha);

    if (resultado.erro === 'configuracao-admin-nao-configurada') {
      return res.status(500).json({
        sucesso: false,
        mensagem: 'Autenticação do administrador não configurada.'
      });
    }

    if (resultado.erro === 'credenciais-invalidas') {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'E-mail ou senha inválidos.'
      });
    }

    const { token, emailAdmin } = resultado;

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Login de administrador realizado com sucesso.',
      token,
      usuario: {
        id: 'admin-configurado',
        nome: 'Administrador',
        email: emailAdmin,
        tipo: 'administrador'
      }
    });
  } catch (error) {
    return next(error);
  }
}

export default { loginProfessor, loginAdmin };
