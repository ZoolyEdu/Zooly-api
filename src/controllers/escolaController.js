import mongoose from 'mongoose';
import escolaService from '../services/escolaService.js';

function erro(res, status, mensagem) {
  return res.status(status).json({ sucesso: false, mensagem });
}

function idInvalido(req, res) {
  if (mongoose.isValidObjectId(req.params.id)) return false;
  erro(res, 400, 'ID de escola inválido.');
  return true;
}

async function cadastrar(req, res, next) {
  try {
    const escola = await escolaService.cadastrar(req.body);
    return res.status(201).json({
      sucesso: true,
      mensagem: 'Escola cadastrada com sucesso.',
      escola
    });
  } catch (error) {
    return next(error);
  }
}

async function listar(req, res, next) {
  try {
    const escolas = await escolaService.listar();
    return res.status(200).json({ sucesso: true, total: escolas.length, escolas });
  } catch (error) {
    return next(error);
  }
}

async function obterPorId(req, res, next) {
  try {
    if (idInvalido(req, res)) return;
    const escola = await escolaService.obterPorId(req.params.id);
    if (!escola) return erro(res, 404, 'Escola não encontrada.');
    return res.status(200).json({ sucesso: true, escola });
  } catch (error) {
    return next(error);
  }
}

async function atualizar(req, res, next) {
  try {
    if (idInvalido(req, res)) return;
    const escola = await escolaService.atualizar(req.params.id, req.body);
    if (!escola) return erro(res, 404, 'Escola não encontrada.');
    return res.status(200).json({
      sucesso: true,
      mensagem: 'Escola atualizada com sucesso.',
      escola
    });
  } catch (error) {
    return next(error);
  }
}

async function excluir(req, res, next) {
  try {
    if (idInvalido(req, res)) return;
    const resultado = await escolaService.excluir(req.params.id);
    if (resultado.erro === 'escola-vinculada') {
      return erro(res, 409, 'Não é possível excluir uma escola que possui turmas ou professores vinculados.');
    }
    if (!resultado.escola) return erro(res, 404, 'Escola não encontrada.');
    return res.status(200).json({ sucesso: true, mensagem: 'Escola excluída com sucesso.' });
  } catch (error) {
    return next(error);
  }
}

export default { cadastrar, listar, obterPorId, atualizar, excluir };
