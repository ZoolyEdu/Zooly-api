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

async function loginAluno(req, res, next) {
  try {
    const { ra, senha } = req.body;

    if (
      typeof ra !== 'string' ||
      !ra.trim() ||
      typeof senha !== 'string' ||
      !senha
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'RA e senha são obrigatórios.'
      });
    }

    const resultado = await authService.loginAluno(ra, senha);

    if (resultado.erro === 'jwt-nao-configurado') {
      return res.status(500).json({
        sucesso: false,
        mensagem: 'Autenticação não configurada no servidor.'
      });
    }

    if (resultado.erro === 'credenciais-invalidas') {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'RA ou senha inválidos.'
      });
    }

    const { aluno, turma, token } = resultado;

    return res.status(200).json({
      sucesso: true,
      mensagem: aluno.cadastroInicialConcluido
        ? 'Login realizado com sucesso.'
        : 'Login realizado. É necessário concluir o cadastro inicial.',
      token,
      cadastroInicialPendente: !aluno.cadastroInicialConcluido,
      usuario: {
        id: aluno._id,
        ra: aluno.ra,
        nome: aluno.nomeCompleto,
        turma: turma._id,
        tipo: 'aluno'
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function entrarTurma(req, res, next) {
  try {
    const { ra, codigoPermanente, senha } = req.body;

    if (
      typeof ra !== 'string' ||
      !ra.trim() ||
      typeof codigoPermanente !== 'string' ||
      !codigoPermanente.trim() ||
      typeof senha !== 'string' ||
      !senha
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'RA, código da turma e senha são obrigatórios.'
      });
    }

    const resultado = await authService.entrarTurma(ra, codigoPermanente, senha);

    if (resultado.erro === 'jwt-nao-configurado') {
      return res.status(500).json({
        sucesso: false,
        mensagem: 'Autenticação não configurada no servidor.'
      });
    }

    if (resultado.erro === 'credenciais-invalidas') {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Código da turma ou senha inválidos.'
      });
    }

    if (resultado.erro === 'ra-associado-outra-turma') {
      return res.status(409).json({
        sucesso: false,
        mensagem: 'Este RA já está associado a outra turma.'
      });
    }

    if (resultado.erro === 'conflito-cadastro-aluno') {
      return res.status(409).json({
        sucesso: false,
        mensagem: 'Este RA já está associado a outro cadastro.'
      });
    }

    const { aluno, alunoNovo, token } = resultado;

    return res.status(alunoNovo ? 201 : 200).json({
      sucesso: true,
      mensagem: alunoNovo
        ? 'Entrada na turma realizada. Conclua seu cadastro inicial.'
        : 'Entrada na turma realizada com sucesso.',
      token,
      alunoNovo,
      cadastroInicialPendente: !aluno.cadastroInicialConcluido,
      usuario: {
        id: aluno._id,
        ra: aluno.ra,
        nome: aluno.nomeCompleto,
        turma: aluno.turma,
        tipo: 'aluno'
      }
    });
  } catch (error) {
    return next(error);
  }
}

export default { loginProfessor, loginAdmin, loginAluno, entrarTurma };
