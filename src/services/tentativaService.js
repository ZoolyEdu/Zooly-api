import ProgressoAtividade from "../models/ProgressoAtividade.js";
import TentativaAtividade, {
  STATUS_TENTATIVA,
} from "../models/TentativaAtividade.js";

// Regras do histórico de tentativas (ver README, seção "Tentativas de atividade"):
// - no máximo uma tentativa em andamento por aluno e atividade (índice único parcial);
// - a primeira tentativa concluída é a oficial (definida dentro da transação de conclusão);
// - tentativas concluídas nunca são alteradas.
// Todas as consultas usam o aluno do token; nenhuma recebe identidade do cliente.

const LIMITE_COLISOES = 5;

function comSessao(sessao, opcoes = {}) {
  return sessao ? { ...opcoes, session: sessao } : opcoes;
}

function filtroDoAluno(alunoId, atividadeId) {
  return { aluno: alunoId, atividade: atividadeId };
}

function buscarTentativaAberta(alunoId, atividadeId, sessao) {
  return TentativaAtividade.findOne(
    {
      ...filtroDoAluno(alunoId, atividadeId),
      status: STATUS_TENTATIVA.emAndamento,
    },
    null,
    comSessao(sessao),
  );
}

export function buscarUltimaTentativa(alunoId, atividadeId, sessao) {
  return TentativaAtividade.findOne(
    filtroDoAluno(alunoId, atividadeId),
    null,
    comSessao(sessao, { sort: { numeroTentativa: -1 } }),
  );
}

export function listarTentativas(filtro) {
  return TentativaAtividade.find(filtro, null, {
    sort: { atividade: 1, numeroTentativa: 1 },
  });
}

export function copiarRespostas(respostas = []) {
  return respostas.map((resposta) => ({
    questaoId: resposta.questaoId,
    alternativasSelecionadas: [...resposta.alternativasSelecionadas],
  }));
}

/**
 * Dados da tentativa 1 equivalente a um progresso gravado antes do histórico existir.
 * Usado pela migração e pela adoção automática; o progresso original não é alterado aqui.
 */
export function tentativaDoProgressoExistente(progresso) {
  const concluida = progresso.status === "concluida";
  return {
    aluno: progresso.aluno,
    atividade: progresso.atividade,
    progresso: progresso._id,
    numeroTentativa: 1,
    status: concluida
      ? STATUS_TENTATIVA.concluida
      : STATUS_TENTATIVA.emAndamento,
    oficial: concluida,
    iniciadaEm: progresso.iniciadaEm ?? progresso.createdAt ?? new Date(),
    concluidaEm: concluida ? (progresso.concluidaEm ?? new Date()) : null,
    respostas: copiarRespostas(progresso.respostas),
    respostasRegistradasEm: progresso.respostasRegistradasEm ?? null,
    origem: "progresso_existente",
  };
}

/**
 * Se o progresso é anterior ao histórico (sem nenhuma tentativa), cria a tentativa 1 a partir dele.
 * Assim a API funciona antes e depois da migração. Devolve true se alguma tentativa já existia
 * ou foi criada.
 */
async function adotarProgressoExistente(progresso, sessao) {
  const alguma = await buscarUltimaTentativa(
    progresso.aluno,
    progresso.atividade,
    sessao,
  );
  if (alguma) return false;
  await TentativaAtividade.create(
    [tentativaDoProgressoExistente(progresso)],
    comSessao(sessao),
  );
  return true;
}

function ehColisao(erro) {
  return erro?.code === 11000;
}

/**
 * Retoma a tentativa em andamento ou abre a próxima. Seguro contra requisições simultâneas:
 * os índices únicos impedem duas tentativas abertas ou dois números iguais, e a colisão
 * apenas faz a função ler de novo o que a outra requisição criou.
 */
export async function abrirOuRetomarTentativa({ progresso, progressoNovo }) {
  const { aluno, atividade } = progresso;
  for (let colisoes = 0; colisoes < LIMITE_COLISOES; colisoes++) {
    const aberta = await buscarTentativaAberta(aluno, atividade);
    if (aberta) return { tentativa: aberta, retomada: true };

    try {
      const ultima = await buscarUltimaTentativa(aluno, atividade);
      if (!ultima && !progressoNovo) {
        // Progresso anterior ao histórico: a tentativa 1 representa o que já foi feito.
        await adotarProgressoExistente(progresso);
        continue;
      }
      const [tentativa] = await TentativaAtividade.create([
        {
          aluno,
          atividade,
          progresso: progresso._id,
          numeroTentativa: (ultima?.numeroTentativa ?? 0) + 1,
          status: STATUS_TENTATIVA.emAndamento,
          iniciadaEm: new Date(),
        },
      ]);
      return { tentativa, retomada: false };
    } catch (erro) {
      if (!ehColisao(erro)) throw erro;
    }
  }
  throw new Error(
    "Não foi possível abrir a tentativa após colisões repetidas.",
  );
}

/**
 * Grava as respostas na tentativa em andamento. Tentativas concluídas não aceitam alteração.
 * Enquanto a atividade não tiver tentativa oficial, o progresso espelha as respostas
 * (é o que o desempenho já lia). Depois da primeira conclusão o progresso não muda mais.
 */
export async function registrarRespostas({ progresso, respostas }) {
  const { aluno, atividade } = progresso;
  let aberta = await buscarTentativaAberta(aluno, atividade);
  if (!aberta) {
    try {
      if (await adotarProgressoExistente(progresso))
        aberta = await buscarTentativaAberta(aluno, atividade);
    } catch (erro) {
      if (!ehColisao(erro)) throw erro;
      aberta = await buscarTentativaAberta(aluno, atividade);
    }
  }
  if (!aberta) return { erro: "tentativa-nao-aberta" };

  const agora = new Date();
  const copia = copiarRespostas(respostas);
  const tentativa = await TentativaAtividade.findOneAndUpdate(
    { _id: aberta._id, status: STATUS_TENTATIVA.emAndamento },
    { $set: { respostas: copia, respostasRegistradasEm: agora } },
    { returnDocument: "after", runValidators: true },
  );
  if (!tentativa) return { erro: "tentativa-nao-aberta" };

  await ProgressoAtividade.updateOne(
    { _id: progresso._id, status: "iniciada" },
    { $set: { respostas: copia, respostasRegistradasEm: agora } },
    { runValidators: true },
  );
  return {
    tentativa,
    progresso: await ProgressoAtividade.findOne({ _id: progresso._id }),
  };
}

/**
 * Conclui a tentativa em andamento. Deve rodar dentro da transação do aluno
 * (moedaService.concluirAtividadeComRecompensa), que também concede a recompensa.
 * Devolve { tentativa, primeiraConclusao } ou { tentativa: null } quando não há
 * tentativa aberta (requisição repetida).
 */
export async function concluirTentativaAberta({ progresso, sessao }) {
  const { aluno, atividade } = progresso;
  let aberta = await buscarTentativaAberta(aluno, atividade, sessao);
  if (!aberta && (await adotarProgressoExistente(progresso, sessao)))
    aberta = await buscarTentativaAberta(aluno, atividade, sessao);
  if (!aberta) return { tentativa: null, primeiraConclusao: false };

  const primeiraConclusao = progresso.status !== "concluida";
  const tentativa = await TentativaAtividade.findOneAndUpdate(
    { _id: aberta._id, status: STATUS_TENTATIVA.emAndamento },
    {
      $set: {
        status: STATUS_TENTATIVA.concluida,
        concluidaEm: new Date(),
        oficial: primeiraConclusao,
      },
    },
    comSessao(sessao, { returnDocument: "after", runValidators: true }),
  );
  if (!tentativa) return { tentativa: null, primeiraConclusao: false };
  return { tentativa, primeiraConclusao };
}

/** Formato público de uma tentativa (sem gabarito). */
export function resumoTentativa(tentativa) {
  if (!tentativa) return null;
  return {
    id: tentativa._id,
    atividade: tentativa.atividade,
    numeroTentativa: tentativa.numeroTentativa,
    status: tentativa.status,
    oficial: Boolean(tentativa.oficial),
    iniciadaEm: tentativa.iniciadaEm,
    concluidaEm: tentativa.concluidaEm ?? null,
    respostasRegistradasEm: tentativa.respostasRegistradasEm ?? null,
    respostas: copiarRespostas(tentativa.respostas),
  };
}
