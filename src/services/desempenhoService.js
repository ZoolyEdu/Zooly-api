import mongoose from "mongoose";
import Aluno from "../models/Aluno.js";
import Atividade from "../models/Atividade.js";
import ProgressoAtividade from "../models/ProgressoAtividade.js";
import Professor from "../models/Professor.js";
import Turma from "../models/Turma.js";
import { listarTentativas, resumoTentativa } from "./tentativaService.js";

const lista = (valor) => (Array.isArray(valor) ? valor : []);
const fusoRelatorio = "America/Sao_Paulo";

function inicioLocalEmUtc(ano, mes, dia) {
  const estimativaUtc = Date.UTC(ano, mes - 1, dia);
  const formatador = new Intl.DateTimeFormat("en-GB", {
    timeZone: fusoRelatorio,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const partes = Object.fromEntries(
    formatador
      .formatToParts(new Date(estimativaUtc))
      .map((p) => [p.type, p.value]),
  );
  const representacaoLocalComoUtc = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    Number(partes.hour),
    Number(partes.minute),
    Number(partes.second),
  );
  return new Date(estimativaUtc - (representacaoLocalComoUtc - estimativaUtc));
}

export function calcularPeriodoSemanal(dataReferencia) {
  if (
    typeof dataReferencia !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dataReferencia)
  )
    return null;
  const [ano, mes, dia] = dataReferencia.split("-").map(Number);
  const dataUtc = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    dataUtc.getUTCFullYear() !== ano ||
    dataUtc.getUTCMonth() !== mes - 1 ||
    dataUtc.getUTCDate() !== dia
  )
    return null;
  const deslocamentoSegunda = (dataUtc.getUTCDay() + 6) % 7;
  const segunda = new Date(Date.UTC(ano, mes - 1, dia - deslocamentoSegunda));
  const proximaSegunda = new Date(segunda.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    inicio: inicioLocalEmUtc(
      segunda.getUTCFullYear(),
      segunda.getUTCMonth() + 1,
      segunda.getUTCDate(),
    ),
    fim: inicioLocalEmUtc(
      proximaSegunda.getUTCFullYear(),
      proximaSegunda.getUTCMonth() + 1,
      proximaSegunda.getUTCDate(),
    ),
  };
}

function respostaCorreta(selecionadas, corretas) {
  const a = [...lista(selecionadas).map(String)].sort();
  const b = [...lista(corretas).map(String)].sort();
  return a.length === b.length && a.every((id, indice) => id === b[indice]);
}

function consolidarDesempenho(
  aluno,
  atividades,
  progressos,
  periodo = null,
) {
  const atividadesPorId = new Map(
    atividades.map((item) => [String(item._id), item]),
  );
  const progressoUnico = new Map();
  for (const progresso of progressos) {
    if (atividadesPorId.has(String(progresso.atividade)))
      progressoUnico.set(String(progresso.atividade), progresso);
  }
  const questoes = new Map();
  const atividadesIniciadas = new Set();
  const atividadesConcluidas = new Set();
  let respostasRegistradas = 0;
  let respostasSemData = 0;
  let acertos = 0;
  let erros = 0;

  const dentroPeriodo = (data) => {
    if (!periodo || !data) return false;
    const valor = new Date(data).getTime();
    return (
      Number.isFinite(valor) &&
      valor >= periodo.inicio.getTime() &&
      valor < periodo.fim.getTime()
    );
  };

  for (const [atividadeId, progresso] of progressoUnico) {
    const atividade = atividadesPorId.get(atividadeId);
    if (!periodo || dentroPeriodo(progresso.iniciadaEm))
      atividadesIniciadas.add(atividadeId);
    if (
      !periodo
        ? progresso.status === "concluida"
        : dentroPeriodo(progresso.concluidaEm)
    )
      atividadesConcluidas.add(atividadeId);

    const respostas = lista(progresso.respostas);
    if (periodo && respostas.length && !progresso.respostasRegistradasEm)
      respostasSemData += respostas.length;
    if (periodo && !dentroPeriodo(progresso.respostasRegistradasEm)) continue;

    const questoesDaAtividade = new Map(
      lista(atividade.questoes).map((q) => [String(q._id), q]),
    );
    const respostasUnicas = new Map(
      respostas.map((r) => [String(r.questaoId), r]),
    );
    for (const [questaoId, resposta] of respostasUnicas) {
      const questao = questoesDaAtividade.get(questaoId);
      if (!questao) continue;
      const correta = respostaCorreta(
        resposta.alternativasSelecionadas,
        questao.respostasCorretas,
      );
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
        erros: 0,
      };
      registro.respostasRegistradas++;
      registro[correta ? "acertos" : "erros"]++;
      questoes.set(questaoId, registro);
    }
  }

  return {
    aluno: {
      id: aluno._id,
      ra: aluno.ra,
      nomeCompleto: aluno.nomeCompleto ?? null,
    },
    indicadores: {
      atividadesIniciadas: atividadesIniciadas.size,
      atividadesConcluidas: atividadesConcluidas.size,
      respostasRegistradas,
      ...(periodo ? { respostasSemData } : {}),
      acertos,
      erros,
      percentualAcerto: respostasRegistradas
        ? Math.round((acertos / respostasRegistradas) * 10000) / 100
        : null,
    },
    questoesComMaisErros: [...questoes.values()]
      .filter((q) => q.erros > 0)
      .sort(
        (a, b) => b.erros - a.erros || a.questaoId.localeCompare(b.questaoId),
      ),
  };
}

const idsIguais = (a, b) => String(a) === String(b);

async function turmaAutorizada(turmaId, professorId) {
  if (!mongoose.isValidObjectId(turmaId)) return { erro: 400 };
  const [turma, professor] = await Promise.all([
    Turma.findById(turmaId),
    mongoose.isValidObjectId(professorId)
      ? Professor.findById(professorId).select("_id")
      : null,
  ]);
  if (!turma || turma.arquivada) return { erro: 404 };
  // Dados pedagógicos ficam restritos ao professor responsável pela turma.
  if (!professor || !idsIguais(turma.professorResponsavel, professor._id))
    return { erro: 403 };
  return { turma };
}

async function dadosAluno(aluno) {
  const atividades = await Atividade.find({
    turma: aluno.turma,
    status: "publicada",
  });
  const ids = atividades.map((atividade) => atividade._id);
  const progressos = ids.length
    ? await ProgressoAtividade.find({
        aluno: aluno._id,
        atividade: { $in: ids },
      })
    : [];
  return consolidarDesempenho(aluno, atividades, progressos);
}

async function obterTurma({ turmaId, professorId }) {
  const acesso = await turmaAutorizada(turmaId, professorId);
  if (acesso.erro) return acesso;

  const alunos = await Aluno.find({ turma: acesso.turma._id })
    .select("ra nomeCompleto turma")
    .sort({ nomeCompleto: 1, ra: 1 });
  const desempenho = await Promise.all(alunos.map(dadosAluno));
  return {
    turma: { id: acesso.turma._id, nome: acesso.turma.nome },
    totalAlunos: desempenho.length,
    alunos: desempenho,
  };
}

async function obterRelatorioSemanal({ turmaId, professorId, data }) {
  const periodo = calcularPeriodoSemanal(data);
  if (!periodo) return { erro: 400 };

  const acesso = await turmaAutorizada(turmaId, professorId);
  if (acesso.erro) return acesso;

  const alunos = await Aluno.find({ turma: acesso.turma._id })
    .select("ra nomeCompleto turma")
    .sort({ nomeCompleto: 1, ra: 1 });
  const atividades = await Atividade.find({
    turma: acesso.turma._id,
    status: "publicada",
  });
  const idsAtividades = atividades.map((atividade) => atividade._id);
  const desempenho = await Promise.all(
    alunos.map(async (aluno) => {
      const progressos = idsAtividades.length
        ? await ProgressoAtividade.find({
            aluno: aluno._id,
            atividade: { $in: idsAtividades },
          })
        : [];
      return consolidarDesempenho(aluno, atividades, progressos, periodo);
    }),
  );
  const indicadores = desempenho.reduce(
    (total, item) => {
      for (const campo of [
        "atividadesIniciadas",
        "atividadesConcluidas",
        "respostasRegistradas",
        "respostasSemData",
        "acertos",
        "erros",
      ]) {
        total[campo] += item.indicadores[campo];
      }
      return total;
    },
    {
      atividadesIniciadas: 0,
      atividadesConcluidas: 0,
      respostasRegistradas: 0,
      respostasSemData: 0,
      acertos: 0,
      erros: 0,
    },
  );
  indicadores.percentualAcerto = indicadores.respostasRegistradas
    ? Math.round(
        (indicadores.acertos / indicadores.respostasRegistradas) * 10000,
      ) / 100
    : null;

  return {
    turma: { id: acesso.turma._id, nome: acesso.turma.nome },
    periodo: {
      inicio: periodo.inicio.toISOString(),
      fim: periodo.fim.toISOString(),
      fuso: fusoRelatorio,
      disponivel: periodo.fim.getTime() <= Date.now(),
    },
    totalAlunos: desempenho.length,
    indicadores,
    alunos: desempenho,
  };
}

async function obterAluno({ alunoId, professorId }) {
  const aluno = await Aluno.findById(alunoId);
  if (!aluno) return { erro: 404 };
  const acesso = await turmaAutorizada(aluno.turma, professorId);
  if (acesso.erro) return acesso;
  return {
    turma: { id: acesso.turma._id, nome: acesso.turma.nome },
    ...(await dadosAluno(aluno)),
  };
}

// Correção de uma tentativa, calculada no servidor a partir do gabarito atual da atividade.
function corrigirTentativa(tentativa, atividade) {
  const questoes = new Map(
    lista(atividade.questoes).map((questao) => [String(questao._id), questao]),
  );
  let acertos = 0;
  let erros = 0;
  const respostas = lista(tentativa.respostas).map((resposta) => {
    const questao = questoes.get(String(resposta.questaoId));
    const correta = questao
      ? respostaCorreta(
          resposta.alternativasSelecionadas,
          questao.respostasCorretas,
        )
      : null;
    if (correta === true) acertos++;
    if (correta === false) erros++;
    return {
      questaoId: resposta.questaoId,
      enunciado: questao?.enunciado ?? null,
      alternativasSelecionadas: lista(resposta.alternativasSelecionadas),
      correta,
    };
  });
  const corrigidas = acertos + erros;
  return {
    ...resumoTentativa(tentativa),
    respostas,
    acertos,
    erros,
    percentualAcerto: corrigidas
      ? Math.round((acertos / corrigidas) * 10000) / 100
      : null,
  };
}

/**
 * Histórico de tentativas de um aluno, para o professor responsável pela turma.
 * Só considera atividades da turma atual do aluno (como o desempenho). Não altera
 * indicadores: o desempenho oficial continua vindo da tentativa oficial.
 */
async function obterTentativasAluno({ alunoId, professorId, atividadeId }) {
  if (atividadeId !== undefined && !mongoose.isValidObjectId(atividadeId))
    return { erro: 400 };
  const aluno = await Aluno.findById(alunoId);
  if (!aluno) return { erro: 404 };
  const acesso = await turmaAutorizada(aluno.turma, professorId);
  if (acesso.erro) return acesso;

  const atividades = await Atividade.find({
    turma: acesso.turma._id,
    ...(atividadeId ? { _id: atividadeId } : {}),
  }).sort({ ordem: 1, _id: 1 });
  if (atividadeId && atividades.length === 0) return { erro: 404 };

  const tentativas = atividades.length
    ? await listarTentativas({
        aluno: aluno._id,
        atividade: { $in: atividades.map((atividade) => atividade._id) },
      })
    : [];
  const porAtividade = new Map();
  for (const tentativa of tentativas) {
    const chave = String(tentativa.atividade);
    porAtividade.set(chave, [...(porAtividade.get(chave) ?? []), tentativa]);
  }

  return {
    turma: { id: acesso.turma._id, nome: acesso.turma.nome },
    aluno: {
      id: aluno._id,
      ra: aluno.ra,
      nomeCompleto: aluno.nomeCompleto ?? null,
    },
    atividades: atividades
      .filter((atividade) => porAtividade.has(String(atividade._id)))
      .map((atividade) => {
        const daAtividade = porAtividade.get(String(atividade._id));
        return {
          atividade: {
            id: atividade._id,
            titulo: atividade.titulo,
            ordem: atividade.ordem ?? null,
          },
          totalTentativas: daAtividade.length,
          tentativaOficial:
            daAtividade.find((tentativa) => tentativa.oficial)?._id ?? null,
          tentativas: daAtividade.map((tentativa) =>
            corrigirTentativa(tentativa, atividade),
          ),
        };
      }),
  };
}

export default {
  turmaAutorizada,
  obterTurma,
  obterRelatorioSemanal,
  obterAluno,
  obterTentativasAluno,
};
