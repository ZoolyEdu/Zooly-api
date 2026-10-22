import { Router } from 'express';
import mongoose from 'mongoose';
import Atividade from '../models/Atividade.js';
import ProgressoAtividade from '../models/ProgressoAtividade.js';
import autenticarToken from '../middlewares/autenticarToken.js';
import autorizarPerfil from '../middlewares/autorizarPerfil.js';

const router = Router();
router.use(autenticarToken, autorizarPerfil('aluno'));

function erro400(res, mensagem) {
  return res.status(400).json({ sucesso: false, mensagem });
}

function ehObjeto(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

function corpoVazio(body) {
  return body === undefined || (ehObjeto(body) && Object.keys(body).length === 0);
}

async function buscarAtividadePublicada(id) {
  const atividade = await Atividade.findById(id);
  return atividade?.status === 'publicada' ? atividade : null;
}

function validarRespostas(body, atividade) {
  if (!ehObjeto(body) || Object.keys(body).some(campo => campo !== 'respostas') || !Array.isArray(body.respostas)) {
    return false;
  }

  const questoes = new Map(atividade.questoes.map(questao => [String(questao._id), questao]));
  const respondidas = new Set();
  for (const resposta of body.respostas) {
    if (
      !ehObjeto(resposta) ||
      Object.keys(resposta).some(campo => !['questaoId', 'alternativasSelecionadas'].includes(campo)) ||
      typeof resposta.questaoId !== 'string' ||
      !mongoose.isValidObjectId(resposta.questaoId) ||
      !Array.isArray(resposta.alternativasSelecionadas) ||
      resposta.alternativasSelecionadas.length === 0
    ) return false;

    const idQuestao = String(resposta.questaoId);
    const questao = questoes.get(idQuestao);
    if (!questao || respondidas.has(idQuestao)) return false;
    respondidas.add(idQuestao);

    const alternativas = new Set(questao.alternativas.map(alternativa => String(alternativa._id)));
    const selecionadas = resposta.alternativasSelecionadas;
    if (selecionadas.some(id => typeof id !== 'string' || !mongoose.isValidObjectId(id) || !alternativas.has(id))) return false;
    if (new Set(selecionadas).size !== selecionadas.length) return false;
  }
  return true;
}

router.post('/atividades/:atividadeId/iniciar', async (req, res, next) => {
  try {
    const { atividadeId } = req.params;
    if (!mongoose.isValidObjectId(atividadeId)) return erro400(res, 'O identificador da atividade é inválido.');
    if (!corpoVazio(req.body)) return erro400(res, 'O início não aceita campos enviados pelo cliente.');

    const atividade = await buscarAtividadePublicada(atividadeId);
    if (!atividade) return res.status(404).json({ sucesso: false, mensagem: 'Atividade publicada não encontrada.' });

    const aluno = req.usuario.id;
    const existente = await ProgressoAtividade.findOne({ aluno, atividade: atividadeId });
    if (existente) return res.status(200).json({ sucesso: true, progresso: existente });

    const progresso = new ProgressoAtividade({ aluno, atividade: atividadeId, status: 'iniciada' });
    await progresso.save();
    return res.status(201).json({ sucesso: true, progresso });
  } catch (error) {
    if (error.code === 11000) {
      try {
        const progresso = await ProgressoAtividade.findOne({ aluno: req.usuario.id, atividade: req.params.atividadeId });
        if (progresso) return res.status(200).json({ sucesso: true, progresso });
      } catch (erroConsulta) {
        return next(erroConsulta);
      }
    }
    return next(error);
  }
});

router.put('/atividades/:atividadeId/respostas', async (req, res, next) => {
  try {
    const { atividadeId } = req.params;
    if (!mongoose.isValidObjectId(atividadeId)) return erro400(res, 'O identificador da atividade é inválido.');

    const atividade = await buscarAtividadePublicada(atividadeId);
    if (!atividade) return res.status(404).json({ sucesso: false, mensagem: 'Atividade publicada não encontrada.' });
    if (!validarRespostas(req.body, atividade)) return erro400(res, 'As respostas são inválidas.');

    const progresso = await ProgressoAtividade.findOne({ aluno: req.usuario.id, atividade: atividadeId });
    if (!progresso) return res.status(404).json({ sucesso: false, mensagem: 'O aluno ainda não iniciou esta atividade.' });

    progresso.respostas = req.body.respostas.map(resposta => ({
      questaoId: resposta.questaoId,
      alternativasSelecionadas: resposta.alternativasSelecionadas
    }));
    progresso.respostasRegistradasEm = new Date();
    await progresso.save();
    return res.status(200).json({ sucesso: true, progresso });
  } catch (error) {
    return next(error);
  }
});

router.patch('/atividades/:atividadeId/concluir', async (req, res, next) => {
  try {
    const { atividadeId } = req.params;
    if (!mongoose.isValidObjectId(atividadeId)) return erro400(res, 'O identificador da atividade é inválido.');
    if (!corpoVazio(req.body)) return erro400(res, 'A conclusão não aceita campos enviados pelo cliente.');

    const progresso = await ProgressoAtividade.findOne({ aluno: req.usuario.id, atividade: atividadeId });
    if (!progresso) return res.status(404).json({ sucesso: false, mensagem: 'O aluno ainda não iniciou esta atividade.' });
    if (progresso.status !== 'concluida') {
      progresso.status = 'concluida';
      progresso.concluidaEm = new Date();
      await progresso.save();
    }
    return res.status(200).json({ sucesso: true, progresso });
  } catch (error) {
    return next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const progresso = await ProgressoAtividade.find({ aluno: req.usuario.id });
    return res.status(200).json({ sucesso: true, progresso });
  } catch (error) {
    return next(error);
  }
});

router.get('/atividades/:atividadeId', async (req, res, next) => {
  try {
    const { atividadeId } = req.params;
    if (!mongoose.isValidObjectId(atividadeId)) return erro400(res, 'O identificador da atividade é inválido.');
    const progresso = await ProgressoAtividade.findOne({ aluno: req.usuario.id, atividade: atividadeId });
    if (!progresso) return res.status(404).json({ sucesso: false, mensagem: 'Progresso não encontrado.' });
    return res.status(200).json({ sucesso: true, progresso });
  } catch (error) {
    return next(error);
  }
});

export default router;
