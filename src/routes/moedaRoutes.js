import { Router } from 'express';
import mongoose from 'mongoose';
import Aluno from '../models/Aluno.js';
import MovimentacaoMoeda from '../models/MovimentacaoMoeda.js';
import autenticarToken from '../middlewares/autenticarToken.js';
import autorizarPerfil from '../middlewares/autorizarPerfil.js';
import { calcularSaldoMoedas, gastarMoedas } from '../services/moedaService.js';

const router = Router();
router.use(autenticarToken, autorizarPerfil('aluno'));

async function validarAluno(alunoId, res) {
  if (!mongoose.isValidObjectId(alunoId)) {
    res.status(401).json({ sucesso: false, mensagem: 'Identidade do aluno inválida.' });
    return false;
  }
  const aluno = await Aluno.findById(alunoId).select('_id');
  if (!aluno) {
    res.status(404).json({ sucesso: false, mensagem: 'Aluno não encontrado.' });
    return false;
  }
  return true;
}

router.get('/saldo', async (req, res, next) => {
  try {
    const alunoId = req.usuario.id;
    if (!await validarAluno(alunoId, res)) return;
    const saldo = await calcularSaldoMoedas(alunoId);
    return res.status(200).json({ sucesso: true, saldo });
  } catch (erro) {
    return next(erro);
  }
});

router.get('/movimentacoes', async (req, res, next) => {
  try {
    const alunoId = req.usuario.id;
    if (!await validarAluno(alunoId, res)) return;
    const limite = req.query.limite === undefined ? 100 : Number(req.query.limite);
    const pagina = req.query.pagina === undefined ? 1 : Number(req.query.pagina);
    if (!Number.isInteger(limite) || limite < 1 || limite > 100 ||
      !Number.isSafeInteger(pagina) || pagina < 1 || !Number.isSafeInteger((pagina - 1) * limite)) {
      return res.status(400).json({ sucesso: false, mensagem: 'Informe página positiva e limite inteiro entre 1 e 100.' });
    }
    const movimentacoes = await MovimentacaoMoeda.find({ aluno: alunoId })
      .sort({ createdAt: -1, _id: -1 })
      .skip((pagina - 1) * limite)
      .limit(limite);
    return res.status(200).json({ sucesso: true, movimentacoes, pagina, limite });
  } catch (erro) {
    return next(erro);
  }
});

router.post('/gastos', async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) ||
      Object.keys(req.body).some(campo => !['quantidade', 'motivo'].includes(campo))) {
      return res.status(400).json({ sucesso: false, mensagem: 'Envie somente quantidade e motivo.' });
    }
    if (!await validarAluno(req.usuario.id, res)) return;
    const resultado = await gastarMoedas({
      alunoId: req.usuario.id,
      quantidade: req.body.quantidade,
      motivo: req.body.motivo
    });
    return res.status(201).json({ sucesso: true, ...resultado });
  } catch (erro) {
    return next(erro);
  }
});

export default router;
