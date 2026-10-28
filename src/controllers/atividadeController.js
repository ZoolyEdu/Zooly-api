import atividadeService from '../services/atividadeService.js';

function rejeitar(res, status, mensagem) {
  return res.status(status).json({ sucesso: false, mensagem });
}

function erroResultado(res, erro, mensagens) {
  const resultado = mensagens[erro];
  if (!resultado) return null;
  return rejeitar(res, resultado[0], resultado[1]);
}

async function criar(req, res, next) {
  try {
    const resultado = await atividadeService.criar({ body: req.body, professorId: req.usuario.id });
    const erro = erroResultado(res, resultado.erro, {
      'corpo-deve-ser-objeto': [400, 'O corpo da requisição deve ser um objeto.'],
      'status-inicial-protegido': [400, 'O status inicial da atividade é definido pelo servidor.'],
      'campos-nao-permitidos': [400, 'A requisição contém campos não permitidos.'],
      'dados-atividade-invalidos': [400, 'Os dados da atividade são inválidos.'],
      'professor-nao-encontrado': [401, 'Professor não encontrado.'],
      'turma-nao-encontrada': [404, 'Turma não encontrada ou arquivada.'],
      'professor-nao-responsavel': [403, 'Somente o professor responsável pela turma pode criar atividades.'],
      'historia-id-invalido': [400, 'O identificador da história oficial é inválido.'],
      'historia-nao-encontrada': [404, 'História oficial não encontrada.'],
      'ordem-ocupada': [409, 'A ordem informada já está ocupada nesta turma.'],
      'ordem-nao-reservada': [409, 'Não foi possível reservar uma ordem para a atividade. Tente novamente.']
    });
    if (erro) return erro;

    return res.status(201).json({
      sucesso: true,
      mensagem: 'Atividade criada com sucesso.',
      atividade: resultado.atividade
    });
  } catch (error) {
    return next(error);
  }
}

async function listarPublicadas(req, res, next) {
  try {
    const resultado = await atividadeService.listarPublicadas(req.usuario.id);
    if (resultado.erro === 'professor-nao-encontrado') {
      return rejeitar(res, 404, 'Professor não encontrado.');
    }
    return res.status(200).json({ sucesso: true, atividades: resultado.atividades });
  } catch (error) {
    return next(error);
  }
}

async function publicar(req, res, next) {
  try {
    const resultado = await atividadeService.publicar({
      atividadeId: req.params.id,
      professorId: req.usuario.id,
      body: req.body
    });
    const erro = erroResultado(res, resultado.erro, {
      'atividade-id-invalido': [400, 'O identificador da atividade é inválido.'],
      'publicacao-com-campos': [400, 'A publicação não aceita campos enviados pelo cliente.'],
      'atividade-nao-encontrada': [404, 'Atividade não encontrada.'],
      'somente-autor-publica': [403, 'Somente o autor pode publicar esta atividade.'],
      'somente-rascunho-publica': [409, 'Somente rascunhos podem ser publicados.']
    });
    if (erro) return erro;

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Atividade publicada com sucesso.',
      atividade: resultado.atividade
    });
  } catch (error) {
    return next(error);
  }
}

async function excluir(req, res, next) {
  try {
    const resultado = await atividadeService.excluir({
      atividadeId: req.params.id,
      professorId: req.usuario.id
    });
    const erro = erroResultado(res, resultado.erro, {
      'atividade-id-invalido': [400, 'O identificador da atividade é inválido.'],
      'atividade-nao-encontrada': [404, 'Atividade não encontrada.'],
      'somente-autor-exclui': [403, 'Somente o autor pode excluir esta atividade.'],
      'atividade-com-registros': [409, 'A atividade possui registros relacionados que não podem ser tratados com segurança.']
    });
    if (erro) return erro;

    return res.status(200).json({ sucesso: true, mensagem: 'Atividade excluída com sucesso.' });
  } catch (error) {
    return next(error);
  }
}

async function atualizar(req, res, next) {
  try {
    const resultado = await atividadeService.atualizar({
      atividadeId: req.params.id,
      professorId: req.usuario.id,
      body: req.body
    });
    const erro = erroResultado(res, resultado.erro, {
      'atividade-id-invalido': [400, 'O identificador da atividade é inválido.'],
      'atividade-nao-encontrada': [404, 'Atividade não encontrada.'],
      'somente-autor-edita': [403, 'Somente o autor pode editar esta atividade.'],
      'dados-edicao-invalidos': [400, 'Os dados da atividade são inválidos ou contêm campos não permitidos.'],
      'ids-subdocumentos-invalidos': [400, 'Os IDs enviados devem pertencer aos subdocumentos correspondentes desta atividade.'],
      'indice-resposta-invalido': [400, 'O índice de uma resposta correta não corresponde a uma alternativa.'],
      'historia-id-invalido': [400, 'O identificador da história oficial é inválido.'],
      'historia-nao-encontrada': [404, 'História oficial não encontrada.'],
      'ordem-ocupada': [409, 'A ordem informada já está ocupada nesta turma.']
    });
    if (erro) return erro;

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Atividade atualizada com sucesso.',
      atividade: resultado.atividade
    });
  } catch (error) {
    return next(error);
  }
}

export default { criar, listarPublicadas, publicar, excluir, atualizar };
