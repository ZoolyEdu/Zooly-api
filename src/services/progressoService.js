import mongoose from 'mongoose';
import Atividade from '../models/Atividade.js';
import ProgressoAtividade from '../models/ProgressoAtividade.js';
import Aluno from '../models/Aluno.js';
import { concluirAtividadeComRecompensa } from './moedaService.js';

function ehObjeto(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

async function buscarAtividadePublicada(id) {
  const atividade = await Atividade.findById(id);
  return atividade?.status === 'publicada' ? atividade : null;
}

async function validarVinculoAlunoTurma(alunoId, turmaIdAtividade) {
  const aluno = await Aluno.findById(alunoId).select('turma');
  if (!aluno) return { erro: 'aluno-nao-encontrado' };
  if (!aluno.turma || String(aluno.turma) !== String(turmaIdAtividade)) {
    return { erro: 'aluno-sem-acesso-turma' };
  }
  return { valido: true };
}

async function validarDesbloqueioSequencial(alunoId, atividadeAtual) {
  const ordemAtual = Number(atividadeAtual.ordem);
  if (!Number.isInteger(ordemAtual) || ordemAtual < 1) return false;
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

async function montarMapa({ turmaId, alunoId }) {
  const vinculo = await validarVinculoAlunoTurma(alunoId, turmaId);
  if (vinculo.erro) return vinculo;

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

  return { mapaMissoes };
}

async function iniciar({ atividadeId, alunoId }) {
  const atividade = await buscarAtividadePublicada(atividadeId);
  if (!atividade) return { erro: 'atividade-nao-encontrada' };

  const vinculo = await validarVinculoAlunoTurma(alunoId, atividade.turma);
  if (vinculo.erro) return vinculo;

  if (!await validarDesbloqueioSequencial(alunoId, atividade)) return { erro: 'atividade-bloqueada-inicio' };

  const existente = await ProgressoAtividade.findOne({ aluno: alunoId, atividade: atividadeId });
  if (existente) return { progresso: existente, existente: true };

  const progresso = new ProgressoAtividade({ aluno: alunoId, atividade: atividadeId, status: 'iniciada' });
  try {
    await progresso.save();
    return { progresso, existente: false };
  } catch (error) {
    if (error.code === 11000) {
      try {
        const progressoExistente = await ProgressoAtividade.findOne({ aluno: alunoId, atividade: atividadeId });
        if (progressoExistente) return { progresso: progressoExistente, existente: true };
      } catch (erroConsulta) {
        throw erroConsulta;
      }
    }
    throw error;
  }
}

async function salvarRespostas({ atividadeId, alunoId, body }) {
  const atividade = await buscarAtividadePublicada(atividadeId);
  if (!atividade) return { erro: 'atividade-nao-encontrada' };

  const vinculo = await validarVinculoAlunoTurma(alunoId, atividade.turma);
  if (vinculo.erro) return vinculo;

  if (!await validarDesbloqueioSequencial(alunoId, atividade)) return { erro: 'atividade-bloqueada-respostas' };
  if (!validarRespostas(body, atividade)) return { erro: 'respostas-invalidas' };

  const progresso = await ProgressoAtividade.findOne({ aluno: alunoId, atividade: atividadeId });
  if (!progresso) return { erro: 'atividade-nao-iniciada' };

  progresso.respostas = body.respostas.map(resposta => ({
    questaoId: resposta.questaoId,
    alternativasSelecionadas: resposta.alternativasSelecionadas
  }));
  progresso.respostasRegistradasEm = new Date();
  await progresso.save();
  return { progresso };
}

async function concluir({ atividadeId, alunoId }) {
  const atividade = await buscarAtividadePublicada(atividadeId);
  if (!atividade) return { erro: 'atividade-nao-encontrada' };

  const vinculo = await validarVinculoAlunoTurma(alunoId, atividade.turma);
  if (vinculo.erro) return vinculo;

  if (!await validarDesbloqueioSequencial(alunoId, atividade)) return { erro: 'atividade-bloqueada-conclusao' };
  return { resultado: await concluirAtividadeComRecompensa({ alunoId, atividadeId }) };
}

async function listarDoAluno(alunoId) {
  const aluno = await Aluno.findById(alunoId).select('turma');
  if (!aluno) return { erro: 'aluno-nao-encontrado' };

  const progressoDoAluno = await ProgressoAtividade.find({ aluno: alunoId });
  const atividadesIds = [...new Set(progressoDoAluno.map(item => String(item.atividade)))];
  if (atividadesIds.length === 0) return { progresso: [] };

  const atividadesDaTurma = await Atividade.find({
    _id: { $in: atividadesIds },
    turma: aluno.turma,
    status: 'publicada'
  }).select('_id');
  const idsPermitidos = new Set(atividadesDaTurma.map(atividade => String(atividade._id)));
  return { progresso: progressoDoAluno.filter(item => idsPermitidos.has(String(item.atividade))) };
}

async function obterPorAtividade({ atividadeId, alunoId }) {
  const atividade = await buscarAtividadePublicada(atividadeId);
  if (!atividade) return { erro: 'atividade-nao-encontrada' };

  const vinculo = await validarVinculoAlunoTurma(alunoId, atividade.turma);
  if (vinculo.erro) return vinculo;

  const progresso = await ProgressoAtividade.findOne({ aluno: alunoId, atividade: atividadeId });
  if (!progresso) return { erro: 'progresso-nao-encontrado' };
  return { progresso };
}

export default { montarMapa, iniciar, salvarRespostas, concluir, listarDoAluno, obterPorAtividade };
