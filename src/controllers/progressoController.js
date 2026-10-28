import mongoose from 'mongoose';
import progressoService from '../services/progressoService.js';

function erro(res, status, mensagem) {
  return res.status(status).json({ sucesso: false, mensagem });
}

function corpoVazio(body) {
  return body === undefined || (
    body !== null && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0
  );
}

function responderErroDominio(res, codigo) {
  const respostas = {
    'aluno-nao-encontrado': [404, 'Aluno não encontrado.'],
    'aluno-sem-acesso-turma': [403, 'O aluno não tem acesso a esta turma.'],
    'atividade-nao-encontrada': [404, 'Atividade publicada não encontrada.'],
    'atividade-bloqueada-inicio': [403, 'Acesso negado. Você precisa concluir a missão anterior para desbloquear esta atividade.'],
    'atividade-bloqueada-respostas': [403, 'Acesso negado. A atividade anterior precisa estar concluída.'],
    'atividade-bloqueada-conclusao': [403, 'Acesso negado. A atividade anterior precisa estar concluída para finalizar esta missão.'],
    'respostas-invalidas': [400, 'As respostas são inválidas.'],
    'atividade-nao-iniciada': [404, 'O aluno ainda não iniciou esta atividade.'],
    'progresso-nao-encontrado': [404, 'Progresso não encontrado.']
  };
  const resposta = respostas[codigo];
  if (!resposta) return false;
  erro(res, resposta[0], resposta[1]);
  return true;
}

async function mapa(req, res, next) {
  try {
    const { turmaId } = req.params;
    if (!mongoose.isValidObjectId(turmaId)) return erro(res, 400, 'O identificador da turma é inválido.');

    const resultado = await progressoService.montarMapa({ turmaId, alunoId: req.usuario.id });
    if (resultado.erro) return responderErroDominio(res, resultado.erro);
    return res.status(200).json({ sucesso: true, mapaMissoes: resultado.mapaMissoes });
  } catch (error) {
    return next(error);
  }
}

async function iniciar(req, res, next) {
  try {
    const { atividadeId } = req.params;
    if (!mongoose.isValidObjectId(atividadeId)) return erro(res, 400, 'O identificador da atividade é inválido.');
    if (!corpoVazio(req.body)) return erro(res, 400, 'O início não aceita campos enviados pelo cliente.');

    const resultado = await progressoService.iniciar({ atividadeId, alunoId: req.usuario.id });
    if (resultado.erro) return responderErroDominio(res, resultado.erro);
    return res.status(resultado.existente ? 200 : 201).json({ sucesso: true, progresso: resultado.progresso });
  } catch (error) {
    return next(error);
  }
}

async function respostas(req, res, next) {
  try {
    const { atividadeId } = req.params;
    if (!mongoose.isValidObjectId(atividadeId)) return erro(res, 400, 'O identificador da atividade é inválido.');

    const resultado = await progressoService.salvarRespostas({ atividadeId, alunoId: req.usuario.id, body: req.body });
    if (resultado.erro) return responderErroDominio(res, resultado.erro);
    return res.status(200).json({ sucesso: true, progresso: resultado.progresso });
  } catch (error) {
    return next(error);
  }
}

async function concluir(req, res, next) {
  try {
    const { atividadeId } = req.params;
    if (!mongoose.isValidObjectId(atividadeId)) return erro(res, 400, 'O identificador da atividade é inválido.');
    if (!corpoVazio(req.body)) return erro(res, 400, 'A conclusão não aceita campos enviados pelo cliente.');

    const resultado = await progressoService.concluir({ atividadeId, alunoId: req.usuario.id });
    if (resultado.erro) return responderErroDominio(res, resultado.erro);
    return res.status(200).json({ sucesso: true, ...resultado.resultado });
  } catch (error) {
    return next(error);
  }
}

async function listar(req, res, next) {
  try {
    const resultado = await progressoService.listarDoAluno(req.usuario.id);
    if (resultado.erro) return responderErroDominio(res, resultado.erro);
    return res.status(200).json({ sucesso: true, progresso: resultado.progresso });
  } catch (error) {
    return next(error);
  }
}

async function obterPorAtividade(req, res, next) {
  try {
    const { atividadeId } = req.params;
    if (!mongoose.isValidObjectId(atividadeId)) return erro(res, 400, 'O identificador da atividade é inválido.');

    const resultado = await progressoService.obterPorAtividade({ atividadeId, alunoId: req.usuario.id });
    if (resultado.erro) return responderErroDominio(res, resultado.erro);
    return res.status(200).json({ sucesso: true, progresso: resultado.progresso });
  } catch (error) {
    return next(error);
  }
}

export default { mapa, iniciar, respostas, concluir, listar, obterPorAtividade };
