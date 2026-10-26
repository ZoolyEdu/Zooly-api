import alunoService from '../services/alunoService.js';

async function cadastrar(req, res) {
  try {
    const { ra, turmaId } = req.body;

    if (!ra || !turmaId) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'O RA e a turma são obrigatórios.'
      });
    }

    const resultado = await alunoService.cadastrar({
      ra,
      turmaId,
      professorId: req.usuario.id
    });

    if (resultado.erro === 'turma-nao-encontrada') {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Turma não encontrada ou arquivada.'
      });
    }

    if (resultado.erro === 'sem-permissao-cadastro') {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Você não tem permissão para cadastrar alunos nesta turma.'
      });
    }

    const { aluno } = resultado;
    return res.status(201).json({
      sucesso: true,
      mensagem: 'Aluno cadastrado. O cadastro inicial está pendente.',
      aluno: {
        id: aluno._id,
        ra: aluno.ra,
        turma: aluno.turma,
        cadastroInicialConcluido: aluno.cadastroInicialConcluido
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        sucesso: false,
        mensagem: 'Já existe um aluno cadastrado com este RA.'
      });
    }

    if (error.name === 'CastError') {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'O ID informado é inválido.'
      });
    }

    console.error('Erro ao cadastrar aluno:', error);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno ao cadastrar aluno.'
    });
  }
}

async function listarPorTurma(req, res) {
  try {
    const resultado = await alunoService.listarPorTurma({
      turmaId: req.params.turmaId,
      professorId: req.usuario.id
    });

    if (resultado.erro === 'turma-nao-encontrada') {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Turma não encontrada ou arquivada.'
      });
    }

    if (resultado.erro === 'sem-permissao-listagem') {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Você não tem permissão para consultar esta turma.'
      });
    }

    return res.status(200).json({
      sucesso: true,
      total: resultado.alunos.length,
      alunos: resultado.alunos
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'O ID da turma informado é inválido.'
      });
    }

    console.error('Erro ao listar alunos:', error);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno ao listar alunos.'
    });
  }
}

async function atualizar(req, res) {
  try {
    const { ra, turmaId } = req.body;

    if (ra === undefined && turmaId === undefined) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Informe o RA ou a turma para atualizar.'
      });
    }

    const resultado = await alunoService.atualizar({
      alunoId: req.params.alunoId,
      ra,
      turmaId,
      professorId: req.usuario.id
    });

    const mensagens = {
      'aluno-nao-encontrado': [404, 'Aluno não encontrado.'],
      'sem-permissao-edicao': [403, 'Você não tem permissão para editar este aluno.'],
      'ra-vazio': [400, 'O RA não pode ficar vazio.'],
      'ra-duplicado': [409, 'Já existe outro aluno cadastrado com este RA.'],
      'nova-turma-nao-encontrada': [404, 'Nova turma não encontrada ou arquivada.'],
      'sem-permissao-nova-turma': [403, 'Você não tem permissão para usar esta turma.']
    };

    if (resultado.erro) {
      const [status, mensagem] = mensagens[resultado.erro];
      return res.status(status).json({ sucesso: false, mensagem });
    }

    const { aluno } = resultado;
    return res.status(200).json({
      sucesso: true,
      mensagem: 'Aluno atualizado com sucesso.',
      aluno: {
        id: aluno._id,
        ra: aluno.ra,
        nomeCompleto: aluno.nomeCompleto,
        sexo: aluno.sexo,
        turma: aluno.turma,
        cadastroInicialConcluido: aluno.cadastroInicialConcluido
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        sucesso: false,
        mensagem: 'Já existe outro aluno cadastrado com este RA.'
      });
    }

    if (error.name === 'CastError') {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'O ID informado é inválido.'
      });
    }

    console.error('Erro ao editar aluno:', error);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno ao editar aluno.'
    });
  }
}

async function concluirCadastroInicial(req, res) {
  try {
    const { nomeCompleto, codigoPermanente, sexo } = req.body;

    if (
      typeof nomeCompleto !== 'string' ||
      !nomeCompleto.trim() ||
      typeof codigoPermanente !== 'string' ||
      !codigoPermanente.trim() ||
      !['feminino', 'masculino', 'nao_informado'].includes(sexo)
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Informe nome completo, código da turma e sexo válido.'
      });
    }

    const resultado = await alunoService.concluirCadastroInicial({
      alunoId: req.usuario.id,
      nomeCompleto,
      codigoPermanente,
      sexo
    });

    if (resultado.erro === 'aluno-nao-encontrado') {
      return res.status(404).json({ sucesso: false, mensagem: 'Aluno não encontrado.' });
    }

    if (resultado.erro === 'cadastro-ja-concluido') {
      return res.status(409).json({ sucesso: false, mensagem: 'O cadastro inicial já foi concluído.' });
    }

    if (resultado.erro === 'turma-nao-encontrada') {
      return res.status(404).json({ sucesso: false, mensagem: 'Turma não encontrada ou arquivada.' });
    }

    if (resultado.erro === 'codigo-turma-invalido') {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'O código informado não corresponde à turma do aluno.'
      });
    }

    const { aluno } = resultado;
    return res.status(200).json({
      sucesso: true,
      mensagem: 'Cadastro inicial concluído com sucesso.',
      aluno: {
        id: aluno._id,
        ra: aluno.ra,
        nomeCompleto: aluno.nomeCompleto,
        sexo: aluno.sexo,
        turma: aluno.turma,
        cadastroInicialConcluido: aluno.cadastroInicialConcluido
      }
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Identificação do aluno inválida.'
      });
    }

    console.error('Erro ao concluir cadastro inicial:', error);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno ao concluir cadastro inicial.'
    });
  }
}

async function selecionarAvatar(req, res, next) {
  try {
    const body = req.body ?? {};
    const { avatarId } = body;
    if (typeof avatarId !== 'string' || Object.keys(body).some(chave => chave !== 'avatarId')) {
      return res.status(400).json({ sucesso: false, mensagem: 'Informe somente avatarId.' });
    }

    const resultado = await alunoService.selecionarAvatar({ alunoId: req.usuario.id, avatarId });
    if (resultado.erro === 'avatar-nao-encontrado') {
      return res.status(404).json({ sucesso: false, mensagem: 'Avatar não encontrado.' });
    }
    if (resultado.erro === 'avatar-nao-adquirido') {
      return res.status(409).json({ sucesso: false, mensagem: 'O avatar ainda não foi adquirido.' });
    }
    if (resultado.erro === 'aluno-nao-encontrado') {
      return res.status(404).json({ sucesso: false, mensagem: 'Aluno não encontrado.' });
    }

    return res.status(200).json({ sucesso: true, avatarSelecionado: resultado.avatarSelecionado });
  } catch (error) {
    return next(error);
  }
}

export default { cadastrar, listarPorTurma, atualizar, concluirCadastroInicial, selecionarAvatar };
