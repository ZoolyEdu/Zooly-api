import turmaService from '../services/turmaService.js';

function rejeitar(res, status, mensagem) {
  return res.status(status).json({ sucesso: false, mensagem });
}

async function cadastrar(req, res, next) {
  try {
    const resultado = await turmaService.cadastrar({ body: req.body, professorId: req.usuario.id });
    const respostas = {
      'dados-invalidos': [400, 'Informe nome, escola válida e ano escolar válido.'],
      'professor-nao-encontrado': [401, 'Professor não encontrado.'],
      'professor-sem-vinculo-escola': [403, 'Você não está vinculado a esta escola.'],
      'escola-nao-encontrada': [404, 'Escola não encontrada.'],
      'codigo-nao-gerado': [500, 'Não foi possível gerar um código para a turma.']
    };
    if (resultado.erro) {
      const [status, mensagem] = respostas[resultado.erro];
      return rejeitar(res, status, mensagem);
    }
    return res.status(201).json({ sucesso: true, mensagem: 'Turma cadastrada com sucesso.', turma: resultado.turma });
  } catch (error) {
    return next(error);
  }
}

async function listar(req, res, next) {
  try {
    const resultado = await turmaService.listar(req.usuario.id);
    if (resultado.erro === 'professor-nao-encontrado') return rejeitar(res, 401, 'Professor não encontrado.');
    return res.status(200).json({ sucesso: true, total: resultado.turmas.length, turmas: resultado.turmas });
  } catch (error) {
    return next(error);
  }
}

async function consultar(req, res, next) {
  try {
    const resultado = await turmaService.consultar({ turmaId: req.params.id, professorId: req.usuario.id });
    const respostas = {
      'id-invalido': [400, 'ID de turma inválido.'],
      'professor-nao-encontrado': [401, 'Professor não encontrado.'],
      'turma-nao-encontrada': [404, 'Turma não encontrada.'],
      'acesso-nao-autorizado': [403, 'Acesso nao autorizado para esta turma.']
    };
    if (resultado.erro) {
      const [status, mensagem] = respostas[resultado.erro];
      return rejeitar(res, status, mensagem);
    }
    return res.status(200).json({ sucesso: true, turma: resultado.turma });
  } catch (error) {
    return next(error);
  }
}

async function atualizar(req, res, next) {
  try {
    const resultado = await turmaService.atualizar({
      turmaId: req.params.id,
      professorId: req.usuario.id,
      body: req.body
    });
    const respostas = {
      'id-invalido': [400, 'ID de turma inválido.'],
      'professor-nao-encontrado': [401, 'Professor não encontrado.'],
      'turma-nao-encontrada': [404, 'Turma não encontrada.'],
      'acesso-nao-autorizado': [403, 'Acesso nao autorizado para esta turma.'],
      'nome-invalido': [400, 'O nome da turma é inválido.'],
      'ano-escolar-invalido': [400, 'O ano escolar é inválido.']
    };
    if (resultado.erro) {
      const [status, mensagem] = respostas[resultado.erro];
      return rejeitar(res, status, mensagem);
    }
    return res.status(200).json({ sucesso: true, mensagem: 'Turma atualizada com sucesso.', turma: resultado.turma });
  } catch (error) {
    return next(error);
  }
}

async function definirSenhaAcesso(req, res, next) {
  try {
    const resultado = await turmaService.definirSenhaAcesso({
      turmaId: req.params.id,
      professorId: req.usuario.id,
      body: req.body
    });
    const respostas = {
      'id-invalido': [400, 'ID de turma inválido.'],
      'senha-invalida': [400, 'A senha deve ter entre 4 e 20 caracteres.'],
      'professor-nao-encontrado': [401, 'Professor não encontrado.'],
      'turma-ou-arquivada-nao-encontrada': [404, 'Turma não encontrada ou arquivada.'],
      'acesso-nao-autorizado': [403, 'Acesso nao autorizado para esta turma.']
    };
    if (resultado.erro) {
      const [status, mensagem] = respostas[resultado.erro];
      return rejeitar(res, status, mensagem);
    }
    return res.status(200).json({ sucesso: true, mensagem: 'Senha de acesso da turma configurada com sucesso.' });
  } catch (error) {
    return next(error);
  }
}

async function arquivar(req, res, next) {
  try {
    const resultado = await turmaService.arquivar({ turmaId: req.params.id, professorId: req.usuario.id });
    const respostas = {
      'id-invalido': [400, 'ID de turma inválido.'],
      'professor-nao-encontrado': [401, 'Professor não encontrado.'],
      'turma-ja-arquivada-ou-inexistente': [404, 'Turma não encontrada ou já arquivada.'],
      'acesso-nao-autorizado': [403, 'Acesso nao autorizado para esta turma.']
    };
    if (resultado.erro) {
      const [status, mensagem] = respostas[resultado.erro];
      return rejeitar(res, status, mensagem);
    }
    return res.status(200).json({ sucesso: true, mensagem: 'Turma arquivada com sucesso.' });
  } catch (error) {
    return next(error);
  }
}

export default { cadastrar, listar, consultar, atualizar, definirSenhaAcesso, arquivar };
