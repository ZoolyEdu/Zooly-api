import mongoose from 'mongoose';
import desempenhoService from '../services/desempenhoService.js';
import { gerarRelatorioPdf } from '../services/relatorioPdfService.js';

function responderErro(res, codigo) {
  const mensagens = {
    400: 'O identificador informado é inválido.',
    403: 'Você não tem permissão para consultar estes dados pedagógicos.',
    404: 'Turma ou aluno não encontrado.'
  };
  return res.status(codigo).json({ sucesso: false, mensagem: mensagens[codigo] });
}

async function turma(req, res, next) {
  try {
    const resultado = await desempenhoService.obterTurma({
      turmaId: req.params.turmaId,
      professorId: req.usuario.id
    });
    if (resultado.erro) return responderErro(res, resultado.erro);
    return res.json({ sucesso: true, ...resultado });
  } catch (error) {
    return next(error);
  }
}

async function semanal(req, res, next) {
  try {
    const resultado = await desempenhoService.obterRelatorioSemanal({
      turmaId: req.params.turmaId,
      professorId: req.usuario.id,
      data: req.query.data
    });
    if (resultado.erro) return responderErro(res, resultado.erro);
    return res.json({ sucesso: true, ...resultado });
  } catch (error) {
    return next(error);
  }
}

async function semanalPdf(req, res, next) {
  try {
    const relatorio = await desempenhoService.obterRelatorioSemanal({
      turmaId: req.params.turmaId,
      professorId: req.usuario.id,
      data: req.query.data
    });
    if (relatorio.erro) return responderErro(res, relatorio.erro);

    const pdf = await gerarRelatorioPdf(relatorio);
    const nomeSeguro = String(relatorio.turma.nome ?? 'turma')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'turma';
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="relatorio-${nomeSeguro}-semanal.pdf"`,
      'Content-Length': pdf.length
    });
    return res.status(200).send(pdf);
  } catch (error) {
    return next(error);
  }
}

async function aluno(req, res, next) {
  try {
    const { alunoId } = req.params;
    if (!mongoose.isValidObjectId(alunoId)) return responderErro(res, 400);

    const resultado = await desempenhoService.obterAluno({
      alunoId,
      professorId: req.usuario.id
    });
    if (resultado.erro) return responderErro(res, resultado.erro);
    return res.json({ sucesso: true, ...resultado });
  } catch (error) {
    return next(error);
  }
}

export default { turma, semanal, semanalPdf, aluno };
