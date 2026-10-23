import express, { Router } from 'express';
import autenticarToken from '../middlewares/autenticarToken.js';
import autorizarPerfil from '../middlewares/autorizarPerfil.js';
import { buscarAprendizagens, obterAprendizagem, BnccServiceError } from '../services/bnccService.js';

function validarChaves(query, permitidas) {
  return Object.keys(query).every(chave => permitidas.includes(chave));
}

async function buscar(req, res, next) {
  try {
    if (!validarChaves(req.query, ['tema', 'limite'])) {
      return res.status(400).json({ sucesso: false, mensagem: 'Parâmetros inválidos.' });
    }
    const tema = typeof req.query.tema === 'string' ? req.query.tema.trim() : '';
    const limite = req.query.limite === undefined ? 10 : Number(req.query.limite);
    if (!tema || tema.length > 100 || /[\u0000-\u001f]/.test(tema) || !Number.isInteger(limite) || limite < 1 || limite > 10) {
      return res.status(400).json({ sucesso: false, mensagem: 'Informe um tema de até 100 caracteres e limite entre 1 e 10.' });
    }
    const resultado = await buscarAprendizagens(tema, limite);
    return res.json({ sucesso: true, ...resultado });
  } catch (error) {
    return next(error);
  }
}

async function consultarCodigo(req, res, next) {
  try {
    const item = await obterAprendizagem(req.path.slice(1));
    return res.json({ sucesso: true, item });
  } catch (error) {
    return next(error);
  }
}

// O regex exclui /busca no próprio matcher, mesmo se esta rota for registrada primeiro.
const rotaCodigo = /^\/(?!busca(?:\/|$))[^/]+$/;

export function criarBnccRouter({ codigoAntesDaBusca = false } = {}) {
  const router = Router();
  router.use(autenticarToken, autorizarPerfil('professor'));
  const rotas = {
    busca: () => router.get('/busca', buscar),
    codigo: () => router.get(rotaCodigo, consultarCodigo)
  };
  if (codigoAntesDaBusca) {
    rotas.codigo();
    rotas.busca();
  } else {
    rotas.busca();
    rotas.codigo();
  }
  router.use((error, req, res, next) => {
    if (!(error instanceof BnccServiceError)) return next(error);
    return res.status(error.status).json({ sucesso: false, mensagem: error.message });
  });
  return router;
}

export default criarBnccRouter();
