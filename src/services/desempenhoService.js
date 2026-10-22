const lista = valor => Array.isArray(valor) ? valor : [];
const fusoRelatorio = 'America/Sao_Paulo';

function inicioLocalEmUtc(ano, mes, dia) {
  const estimativaUtc = Date.UTC(ano, mes - 1, dia);
  const formatador = new Intl.DateTimeFormat('en-GB', {
    timeZone: fusoRelatorio,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  const partes = Object.fromEntries(formatador.formatToParts(new Date(estimativaUtc)).map(p => [p.type, p.value]));
  const representacaoLocalComoUtc = Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day), Number(partes.hour), Number(partes.minute), Number(partes.second));
  return new Date(estimativaUtc - (representacaoLocalComoUtc - estimativaUtc));
}

export function calcularPeriodoSemanal(dataReferencia) {
  if (typeof dataReferencia !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dataReferencia)) return null;
  const [ano, mes, dia] = dataReferencia.split('-').map(Number);
  const dataUtc = new Date(Date.UTC(ano, mes - 1, dia));
  if (dataUtc.getUTCFullYear() !== ano || dataUtc.getUTCMonth() !== mes - 1 || dataUtc.getUTCDate() !== dia) return null;
  const deslocamentoSegunda = (dataUtc.getUTCDay() + 6) % 7;
  const segunda = new Date(Date.UTC(ano, mes - 1, dia - deslocamentoSegunda));
  const proximaSegunda = new Date(segunda.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    inicio: inicioLocalEmUtc(segunda.getUTCFullYear(), segunda.getUTCMonth() + 1, segunda.getUTCDate()),
    fim: inicioLocalEmUtc(proximaSegunda.getUTCFullYear(), proximaSegunda.getUTCMonth() + 1, proximaSegunda.getUTCDate())
  };
}

function respostaCorreta(selecionadas, corretas) {
  const a = [...lista(selecionadas).map(String)].sort();
  const b = [...lista(corretas).map(String)].sort();
  return a.length === b.length && a.every((id, indice) => id === b[indice]);
}

export function consolidarDesempenho(aluno, atividades, progressos, periodo = null) {
  const atividadesPorId = new Map(atividades.map(item => [String(item._id), item]));
  const progressoUnico = new Map();
  for (const progresso of progressos) {
    if (atividadesPorId.has(String(progresso.atividade))) progressoUnico.set(String(progresso.atividade), progresso);
  }
  const questoes = new Map();
  const atividadesIniciadas = new Set();
  const atividadesConcluidas = new Set();
  let respostasRegistradas = 0;
  let respostasSemData = 0;
  let acertos = 0;
  let erros = 0;

  const dentroPeriodo = data => {
    if (!periodo || !data) return false;
    const valor = new Date(data).getTime();
    return Number.isFinite(valor) && valor >= periodo.inicio.getTime() && valor < periodo.fim.getTime();
  };

  for (const [atividadeId, progresso] of progressoUnico) {
    const atividade = atividadesPorId.get(atividadeId);
    if (!periodo || dentroPeriodo(progresso.iniciadaEm)) atividadesIniciadas.add(atividadeId);
    if (!periodo ? progresso.status === 'concluida' : dentroPeriodo(progresso.concluidaEm)) atividadesConcluidas.add(atividadeId);

    const respostas = lista(progresso.respostas);
    if (periodo && respostas.length && !progresso.respostasRegistradasEm) respostasSemData += respostas.length;
    if (periodo && !dentroPeriodo(progresso.respostasRegistradasEm)) continue;

    const questoesDaAtividade = new Map(lista(atividade.questoes).map(q => [String(q._id), q]));
    const respostasUnicas = new Map(respostas.map(r => [String(r.questaoId), r]));
    for (const [questaoId, resposta] of respostasUnicas) {
      const questao = questoesDaAtividade.get(questaoId);
      if (!questao) continue;
      const correta = respostaCorreta(resposta.alternativasSelecionadas, questao.respostasCorretas);
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

  return {
    aluno: { id: aluno._id, ra: aluno.ra, nomeCompleto: aluno.nomeCompleto ?? null },
    indicadores: {
      atividadesIniciadas: atividadesIniciadas.size,
      atividadesConcluidas: atividadesConcluidas.size,
      respostasRegistradas,
      ...(periodo ? { respostasSemData } : {}),
      acertos,
      erros,
      percentualAcerto: respostasRegistradas ? Math.round((acertos / respostasRegistradas) * 10000) / 100 : null
    },
    questoesComMaisErros: [...questoes.values()].filter(q => q.erros > 0).sort((a, b) => b.erros - a.erros || a.questaoId.localeCompare(b.questaoId))
  };
}
