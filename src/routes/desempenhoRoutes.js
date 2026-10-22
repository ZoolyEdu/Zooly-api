import { Router } from 'express';
import mongoose from 'mongoose';
import Aluno from '../models/Aluno.js';
import Atividade from '../models/Atividade.js';
import ProgressoAtividade from '../models/ProgressoAtividade.js';
import Professor from '../models/Professor.js';
import Turma from '../models/Turma.js';
import autenticarToken from '../middlewares/autenticarToken.js';
import autorizarPerfil from '../middlewares/autorizarPerfil.js';
import { calcularPeriodoSemanal, consolidarDesempenho } from '../services/desempenhoService.js';

const router = Router();
router.use(autenticarToken, autorizarPerfil('professor'));

const idsIguais = (a, b) => String(a) === String(b);
const lista = valor => Array.isArray(valor) ? valor : [];
const fusoRelatorio = 'America/Sao_Paulo';

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

async function dadosAluno(aluno) {
  const atividades = await Atividade.find({ turma: aluno.turma, status: 'publicada' });
  const ids = atividades.map(a => a._id);
  const progressos = ids.length ? await ProgressoAtividade.find({ aluno: aluno._id, atividade: { $in: ids } }) : [];
  return consolidarDesempenho(aluno, atividades, progressos);
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

router.get('/turmas/:turmaId/semanal', async (req, res, next) => {
  try {
    const periodo = calcularPeriodoSemanal(req.query.data);
    if (!periodo) return responderErro(res, 400);
    const acesso = await turmaAutorizada(req.params.turmaId, req.usuario.id);
    if (acesso.erro) return responderErro(res, acesso.erro);
    const alunos = await Aluno.find({ turma: acesso.turma._id }).select('ra nomeCompleto turma').sort({ nomeCompleto: 1, ra: 1 });
    const atividades = await Atividade.find({ turma: acesso.turma._id, status: 'publicada' });
    const idsAtividades = atividades.map(atividade => atividade._id);
    const desempenho = await Promise.all(alunos.map(async aluno => {
      const progressos = idsAtividades.length
        ? await ProgressoAtividade.find({ aluno: aluno._id, atividade: { $in: idsAtividades } })
        : [];
      return consolidarDesempenho(aluno, atividades, progressos, periodo);
    }));
    const indicadores = desempenho.reduce((total, item) => {
      for (const campo of ['atividadesIniciadas', 'atividadesConcluidas', 'respostasRegistradas', 'respostasSemData', 'acertos', 'erros']) {
        total[campo] += item.indicadores[campo];
      }
      return total;
    }, { atividadesIniciadas: 0, atividadesConcluidas: 0, respostasRegistradas: 0, respostasSemData: 0, acertos: 0, erros: 0 });
    indicadores.percentualAcerto = indicadores.respostasRegistradas
      ? Math.round((indicadores.acertos / indicadores.respostasRegistradas) * 10000) / 100
      : null;
    return res.json({
      sucesso: true,
      turma: { id: acesso.turma._id, nome: acesso.turma.nome },
      periodo: {
        inicio: periodo.inicio.toISOString(),
        fim: periodo.fim.toISOString(),
        fuso: fusoRelatorio,
        disponivel: periodo.fim.getTime() <= Date.now()
      },
      totalAlunos: desempenho.length,
      indicadores,
      alunos: desempenho
    });
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
