import { Router } from 'express';
import mongoose from 'mongoose';
import Aluno from '../models/Aluno.js';
import Atividade from '../models/Atividade.js';
import ProgressoAtividade from '../models/ProgressoAtividade.js';
import Professor from '../models/Professor.js';
import Turma from '../models/Turma.js';
import autenticarToken from '../middlewares/autenticarToken.js';
import autorizarPerfil from '../middlewares/autorizarPerfil.js';

const router = Router();
router.use(autenticarToken, autorizarPerfil('professor'));

const idsIguais = (a, b) => String(a) === String(b);
const lista = valor => Array.isArray(valor) ? valor : [];

async function turmaAutorizada(turmaId, professorId) {
  if (!mongoose.isValidObjectId(turmaId)) return { erro: 400 };
  const [turma, professor] = await Promise.all([
    Turma.findById(turmaId),
    mongoose.isValidObjectId(professorId) ? Professor.findById(professorId).select('escolas') : null
  ]);
  if (!turma || turma.arquivada) return { erro: 404 };
  if (!professor || !lista(professor.escolas).some(id => idsIguais(id, turma.escola))) return { erro: 403 };
  return { turma };
}

function compararRespostas(selecionadas, corretas) {
  const a = [...lista(selecionadas).map(String)].sort();
  const b = [...lista(corretas).map(String)].sort();
  return a.length === b.length && a.every((id, indice) => id === b[indice]);
}

function consolidar(aluno, atividades, progressos) {
  const atividadesPorId = new Map(atividades.map(item => [String(item._id), item]));
  const progressoUnico = new Map();
  for (const progresso of progressos) {
    if (atividadesPorId.has(String(progresso.atividade))) progressoUnico.set(String(progresso.atividade), progresso);
  }
  const questoes = new Map();
  let respostasRegistradas = 0;
  let acertos = 0;
  let erros = 0;

  for (const [atividadeId, progresso] of progressoUnico) {
    const atividade = atividadesPorId.get(atividadeId);
    const questoesDaAtividade = new Map(lista(atividade.questoes).map(q => [String(q._id), q]));
    const respostasUnicas = new Map(lista(progresso.respostas).map(r => [String(r.questaoId), r]));
    for (const [questaoId, resposta] of respostasUnicas) {
      const questao = questoesDaAtividade.get(questaoId);
      if (!questao) continue;
      const correta = compararRespostas(resposta.alternativasSelecionadas, questao.respostasCorretas);
      respostasRegistradas++;
      if (correta) acertos++;
      else erros++;
      const registro = questoes.get(questaoId) ?? {
        questaoId,
        enunciado: questao.enunciado,
        atividadeId,
        tituloAtividade: atividade.titulo,
        respostasRegistradas: 0,
        acertos: 0,
        erros: 0
      };
      registro.respostasRegistradas++;
      registro[correta ? 'acertos' : 'erros']++;
      questoes.set(questaoId, registro);
    }
  }
  const atividadesIniciadas = [...progressoUnico.values()].length;
  const atividadesConcluidas = [...progressoUnico.values()].filter(p => p.status === 'concluida').length;
  return {
    aluno: { id: aluno._id, ra: aluno.ra, nomeCompleto: aluno.nomeCompleto ?? null },
    indicadores: {
      atividadesIniciadas,
      atividadesConcluidas,
      respostasRegistradas,
      acertos,
      erros,
      percentualAcerto: respostasRegistradas ? Math.round((acertos / respostasRegistradas) * 10000) / 100 : null
    },
    questoesComMaisErros: [...questoes.values()].filter(q => q.erros > 0).sort((a, b) => b.erros - a.erros || a.questaoId.localeCompare(b.questaoId))
  };
}

async function dadosAluno(aluno) {
  const atividades = await Atividade.find({ turma: aluno.turma, status: 'publicada' });
  const ids = atividades.map(a => a._id);
  const progressos = ids.length ? await ProgressoAtividade.find({ aluno: aluno._id, atividade: { $in: ids } }) : [];
  return consolidar(aluno, atividades, progressos);
}

function responderErro(res, erro) {
  const mensagens = { 400: 'O identificador informado é inválido.', 403: 'Você não tem permissão para consultar estes dados pedagógicos.', 404: 'Turma ou aluno não encontrado.' };
  return res.status(erro).json({ sucesso: false, mensagem: mensagens[erro] });
}

router.get('/turmas/:turmaId', async (req, res, next) => {
  try {
    const acesso = await turmaAutorizada(req.params.turmaId, req.usuario.id);
    if (acesso.erro) return responderErro(res, acesso.erro);
    const alunos = await Aluno.find({ turma: acesso.turma._id }).select('ra nomeCompleto turma').sort({ nomeCompleto: 1, ra: 1 });
    const desempenho = await Promise.all(alunos.map(dadosAluno));
    return res.json({ sucesso: true, turma: { id: acesso.turma._id, nome: acesso.turma.nome }, totalAlunos: desempenho.length, alunos: desempenho });
  } catch (error) { return next(error); }
});

router.get('/alunos/:alunoId', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.alunoId)) return responderErro(res, 400);
    const aluno = await Aluno.findById(req.params.alunoId);
    if (!aluno) return responderErro(res, 404);
    const acesso = await turmaAutorizada(aluno.turma, req.usuario.id);
    if (acesso.erro) return responderErro(res, acesso.erro);
    return res.json({ sucesso: true, turma: { id: acesso.turma._id, nome: acesso.turma.nome }, ...await dadosAluno(aluno) });
  } catch (error) { return next(error); }
});

export default router;
