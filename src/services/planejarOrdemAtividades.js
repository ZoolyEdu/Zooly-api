export function planejarOrdemAtividades(atividades) {
  const grupos = new Map();
  for (const atividade of atividades) {
    if (atividade.turma === undefined || atividade.turma === null) {
      throw new Error(`Atividade ${String(atividade._id)} não possui turma; migração interrompida sem alterações.`);
    }
    const turma = String(atividade.turma);
    if (!grupos.has(turma)) grupos.set(turma, []);
    grupos.get(turma).push(atividade);
  }

  const alteracoes = [];
  for (const grupo of grupos.values()) {
    grupo.sort((a, b) => {
      const dataA = new Date(a.createdAt ?? 0).getTime();
      const dataB = new Date(b.createdAt ?? 0).getTime();
      return dataA - dataB || String(a._id).localeCompare(String(b._id));
    });

    const ordensUsadas = new Set();
    const pendentes = [];
    let maiorOrdem = 0;
    for (const atividade of grupo) {
      const ordem = atividade.ordem;
      if (Number.isSafeInteger(ordem) && ordem > 0 && !ordensUsadas.has(ordem)) {
        ordensUsadas.add(ordem);
        maiorOrdem = Math.max(maiorOrdem, ordem);
      } else {
        pendentes.push(atividade);
      }
    }

    let proximaOrdem = maiorOrdem + 1;
    if (pendentes.length && !Number.isSafeInteger(proximaOrdem)) {
      throw new Error('Não há ordens inteiras seguras disponíveis para reconciliar esta turma.');
    }
    for (const atividade of pendentes) {
      while (ordensUsadas.has(proximaOrdem)) proximaOrdem += 1;
      if (!Number.isSafeInteger(proximaOrdem)) {
        throw new Error('Não há ordens inteiras seguras disponíveis para reconciliar esta turma.');
      }
      alteracoes.push({ _id: atividade._id, turma: atividade.turma, ordemAnterior: atividade.ordem, ordem: proximaOrdem });
      ordensUsadas.add(proximaOrdem);
      proximaOrdem += 1;
    }
  }

  return alteracoes;
}

export function analisarIndicesOrdem(indices) {
  const correspondentes = indices.filter(indice =>
    JSON.stringify(Object.entries(indice.key ?? {})) === JSON.stringify([['turma', 1], ['ordem', 1]])
  );
  const incompatíveis = correspondentes.filter(indice =>
    !indice.unique || indice.partialFilterExpression || indice.sparse || indice.hidden || indice.prepareUnique
  );

  return {
    compativel: incompatíveis.length === 0,
    existentes: correspondentes.map(indice => ({
      nome: indice.name,
      unique: Boolean(indice.unique),
      partial: Boolean(indice.partialFilterExpression),
      sparse: Boolean(indice.sparse),
      hidden: Boolean(indice.hidden),
      prepareUnique: Boolean(indice.prepareUnique)
    })),
    incompatíveis: incompatíveis.map(indice => indice.name ?? JSON.stringify(indice.key))
  };
}
