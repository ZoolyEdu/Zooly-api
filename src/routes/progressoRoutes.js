import { Router } from 'express';
import mongoose from 'mongoose';
import Atividade from '../models/Atividade.js';
import ProgressoAtividade from '../models/ProgressoAtividade.js';
import Aluno from '../models/Aluno.js';
import autenticarToken from '../middlewares/autenticarToken.js';
import autorizarPerfil from '../middlewares/autorizarPerfil.js';
import { concluirAtividadeComRecompensa } from '../services/moedaService.js';

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

async function validarVinculoAlunoTurma(alunoId, turmaIdAtividade, res) {
  const aluno = await Aluno.findById(alunoId).select('turma');
  if (!aluno) {
    res.status(404).json({ sucesso: false, mensagem: 'Aluno não encontrado.' });
    return false;
  }
  if (!aluno.turma || String(aluno.turma) !== String(turmaIdAtividade)) {
    res.status(403).json({ sucesso: false, mensagem: 'O aluno não tem acesso a esta turma.' });
    return false;
  }
  return true;
}

// Validação segura para tratamento de atividades sem ordem ou com ordens inválidas
async function validarDesbloqueioSequencial(alunoId, atividadeAtual) {
  const ordemAtual = Number(atividadeAtual.ordem);
  if (!Number.isInteger(ordemAtual) || ordemAtual < 1) {
    return false;
  }
  if (ordemAtual === 1) return true;

  const atividadeAnterior = await Atividade.findOne({
    turma: atividadeAtual.turma,
    ordem: ordemAtual - 1,
    status: 'publicada'
  });

  if (!atividadeAnterior) return false;

  const progressoAnterior = await ProgressoAtividade.findOne({
    aluno: alunoId,
    atividade: atividadeAnterior._id,
    status: 'concluida'
  });

  return Boolean(progressoAnterior);
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

// ROTA: Mapa de Missões com validação completa de vínculo e sequência
router.get('/turma/:turmaId/mapa', async (req, res, next) => {
  try {
    const { turmaId } = req.params;
    if (!mongoose.isValidObjectId(turmaId)) return erro400(res, 'O identificador da turma é inválido.');

    const alunoId = req.usuario.id;
    if (!await validarVinculoAlunoTurma(alunoId, turmaId, res)) return;

    const atividades = await Atividade.find({ turma: turmaId, status: 'publicada' }).sort({ ordem: 1, _id: 1 });
    const progressos = await ProgressoAtividade.find({ aluno: alunoId });
    const agora = new Date();

    const mapaMissoes = atividades.map((atividade, index) => {
      const progresso = progressos.find(p => String(p.atividade) === String(atividade._id));
      const concluida = progresso?.status === 'concluida';
      let desbloqueada = false;
      const ordemAtual = Number(atividade.ordem);

      if (Number.isInteger(ordemAtual) && ordemAtual > 0) {
        if (ordemAtual === 1) {
          desbloqueada = true;
        } else {
          const atividadeAnterior = atividades.find(a => Number(a.ordem) === ordemAtual - 1);
          const progressoAnterior = atividadeAnterior ? progressos.find(p => String(p.atividade) === String(atividadeAnterior._id)) : null;
          desbloqueada = Boolean(progressoAnterior?.status === 'concluida');
        }
      }

      const atrasada = atividade.prazo && new Date(atividade.prazo) < agora;

      return {
        id: atividade._id,
        titulo: atividade.titulo,
        ordem: Number.isInteger(ordemAtual) ? ordemAtual : (index + 1),
        desbloqueada,
        concluida,
        atrasada,
        prazo: atividade.prazo
      };
    });

    return res.status(200).json({ sucesso: true, mapaMissoes });
  } catch (error) {
    return next(error);
  }
});

// ROTA: Iniciar Atividade
router.post('/atividades/:atividadeId/iniciar', async (req, res, next) => {
  try {
    const { atividadeId } = req.params;
    if (!mongoose.isValidObjectId(atividadeId)) return erro400(res, 'O identificador da atividade é inválido.');
    if (!corpoVazio(req.body)) return erro400(res, 'O início não aceita campos enviados pelo cliente.');

    const atividade = await buscarAtividadePublicada(atividadeId);
    if (!atividade) return res.status(404).json({ sucesso: false, mensagem: 'Atividade publicada não encontrada.' });

    const alunoId = req.usuario.id;
    if (!await validarVinculoAlunoTurma(alunoId, atividade.turma, res)) return;

    const liberado = await validarDesbloqueioSequencial(alunoId, atividade);
    if (!liberado) {
      return res.status(403).json({ sucesso: false, mensagem: 'Acesso negado. Você precisa concluir a missão anterior para desbloquear esta atividade.' });
    }

    const existente = await ProgressoAtividade.findOne({ aluno: alunoId, atividade: atividadeId });
    if (existente) return res.status(200).json({ sucesso: true, progresso: existente });

    const progresso = new ProgressoAtividade({ aluno: alunoId, atividade: atividadeId, status: 'iniciada' });
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

// ROTA: Enviar Respostas (Preservando a atualização de respostasRegistradasEm da Issue #27)
router.put('/atividades/:atividadeId/respostas', async (req, res, next) => {
  try {
    const { atividadeId } = req.params;
    if (!mongoose.isValidObjectId(atividadeId)) return erro400(res, 'O identificador da atividade é inválido.');

    const atividade = await buscarAtividadePublicada(atividadeId);
    if (!atividade) return res.status(404).json({ sucesso: false, mensagem: 'Atividade publicada não encontrada.' });

    const alunoId = req.usuario.id;
    if (!await validarVinculoAlunoTurma(alunoId, atividade.turma, res)) return;

    const liberado = await validarDesbloqueioSequencial(alunoId, atividade);
    if (!liberado) {
      return res.status(403).json({ sucesso: false, mensagem: 'Acesso negado. A atividade anterior precisa estar concluída.' });
    }

    if (!validarRespostas(req.body, atividade)) return erro400(res, 'As respostas são inválidas.');

    const progresso = await ProgressoAtividade.findOne({ aluno: alunoId, atividade: atividadeId });
    if (!progresso) return res.status(404).json({ sucesso: false, mensagem: 'O aluno ainda não iniciou esta atividade.' });

    progresso.respostas = req.body.respostas.map(resposta => ({
      questaoId: resposta.questaoId,
      alternativasSelecionadas: resposta.alternativasSelecionadas
    }));

    // Preserva e atualiza o timestamp da Issue #27
    progresso.respostasRegistradasEm = new Date();

    await progresso.save();
    return res.status(200).json({ sucesso: true, progresso });
  } catch (error) {
    return next(error);
  }
});

// ROTA: Concluir Atividade com validação sequencial e de turma
router.patch('/atividades/:atividadeId/concluir', async (req, res, next) => {
  try {
    const { atividadeId } = req.params;
    if (!mongoose.isValidObjectId(atividadeId)) return erro400(res, 'O identificador da atividade é inválido.');
    if (!corpoVazio(req.body)) return erro400(res, 'A conclusão não aceita campos enviados pelo cliente.');

    const atividade = await buscarAtividadePublicada(atividadeId);
    if (!atividade) return res.status(404).json({ sucesso: false, mensagem: 'Atividade publicada não encontrada.' });

    const alunoId = req.usuario.id;
    if (!await validarVinculoAlunoTurma(alunoId, atividade.turma, res)) return;

    const liberado = await validarDesbloqueioSequencial(alunoId, atividade);
    if (!liberado) {
      return res.status(403).json({ sucesso: false, mensagem: 'Acesso negado. A atividade anterior precisa estar concluída para finalizar esta missão.' });
    }

    const resultado = await concluirAtividadeComRecompensa({ alunoId, atividadeId });
    return res.status(200).json({ sucesso: true, ...resultado });
  } catch (error) {
    return next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const aluno = await Aluno.findById(req.usuario.id).select('turma');
    if (!aluno) return res.status(404).json({ sucesso: false, mensagem: 'Aluno não encontrado.' });

    const progressoDoAluno = await ProgressoAtividade.find({ aluno: req.usuario.id });
    const atividadesIds = [...new Set(progressoDoAluno.map(item => String(item.atividade)))];
    if (atividadesIds.length === 0) return res.status(200).json({ sucesso: true, progresso: [] });

    const atividadesDaTurma = await Atividade.find({
      _id: { $in: atividadesIds },
      turma: aluno.turma,
      status: 'publicada'
    }).select('_id');
    const idsPermitidos = new Set(atividadesDaTurma.map(atividade => String(atividade._id)));
    const progresso = progressoDoAluno.filter(item => idsPermitidos.has(String(item.atividade)));
    return res.status(200).json({ sucesso: true, progresso });
  } catch (error) {
    return next(error);
  }
});

router.get('/atividades/:atividadeId', async (req, res, next) => {
  try {
    const { atividadeId } = req.params;
    if (!mongoose.isValidObjectId(atividadeId)) return erro400(res, 'O identificador da atividade é inválido.');
    const atividade = await buscarAtividadePublicada(atividadeId);
    if (!atividade) return res.status(404).json({ sucesso: false, mensagem: 'Atividade publicada não encontrada.' });
    if (!await validarVinculoAlunoTurma(req.usuario.id, atividade.turma, res)) return;
    const progresso = await ProgressoAtividade.findOne({ aluno: req.usuario.id, atividade: atividadeId });
    if (!progresso) return res.status(404).json({ sucesso: false, mensagem: 'Progresso não encontrado.' });
    return res.status(200).json({ sucesso: true, progresso });
  } catch (error) {
    return next(error);
  }
});

export default router;
