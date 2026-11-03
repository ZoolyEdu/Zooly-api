import ProgressoAtividade from "../models/ProgressoAtividade.js";
import TentativaAtividade, {
  STATUS_TENTATIVA,
} from "../models/TentativaAtividade.js";
import { tentativaDoProgressoExistente } from "./tentativaService.js";

// Migração dos progressos anteriores ao histórico de tentativas.
// - Não apaga nem altera respostas, datas ou status dos progressos: só acrescenta
//   ProgressoAtividade.tentativaOficial (sem mexer em updatedAt).
// - Idempotente: pares aluno/atividade que já têm tentativas são ignorados, e a criação usa
//   upsert na chave única (aluno, atividade, numeroTentativa = 1).
// - Reversível: as tentativas criadas aqui têm origem "progresso_existente".

const chaveRespostas = (respostas = []) =>
  JSON.stringify(
    respostas
      .map((resposta) => [
        String(resposta.questaoId),
        (resposta.alternativasSelecionadas ?? []).map(String).sort(),
      ])
      .sort(([a], [b]) => a.localeCompare(b)),
  );

const mesmaData = (a, b) =>
  (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);

function novoRelatorio(modo) {
  return {
    modo,
    progressosAnalisados: 0,
    jaComHistorico: 0,
    tentativasACriar: { concluidas: 0, emAndamento: 0 },
    tentativasCriadas: 0,
    progressosVinculados: 0,
    conflitos: [],
  };
}

async function oficialDoPar(progresso) {
  return TentativaAtividade.findOne({
    aluno: progresso.aluno,
    atividade: progresso.atividade,
    oficial: true,
  }).lean();
}

async function vincularOficial(progresso, relatorio) {
  if (progresso.status !== "concluida" || progresso.tentativaOficial) return;
  const oficial = await oficialDoPar(progresso);
  if (!oficial) return;
  const resultado = await ProgressoAtividade.updateOne(
    { _id: progresso._id, tentativaOficial: null },
    { $set: { tentativaOficial: oficial._id } },
    { timestamps: false },
  );
  relatorio.progressosVinculados += resultado.modifiedCount ?? 0;
}

async function criarTentativa(progresso, relatorio) {
  const { aluno, atividade, numeroTentativa, ...restante } =
    tentativaDoProgressoExistente(progresso);
  try {
    const resultado = await TentativaAtividade.updateOne(
      { aluno, atividade, numeroTentativa },
      { $setOnInsert: restante },
      { upsert: true, runValidators: true },
    );
    relatorio.tentativasCriadas += resultado.upsertedCount ?? 0;
  } catch (erro) {
    if (erro?.code !== 11000) throw erro;
    // O jogo abriu uma tentativa para o mesmo par durante a migração.
    relatorio.conflitos.push(String(progresso._id));
  }
}

/**
 * Analisa (aplicar = false) ou cria (aplicar = true) a tentativa 1 de cada progresso que
 * ainda não tem histórico.
 */
export async function migrarTentativas({ aplicar = false } = {}) {
  const relatorio = novoRelatorio(aplicar ? "aplicar" : "simulacao");
  const cursor = ProgressoAtividade.find({}).sort({ _id: 1 }).lean().cursor();
  for await (const progresso of cursor) {
    relatorio.progressosAnalisados++;
    const possuiHistorico = await TentativaAtividade.exists({
      aluno: progresso.aluno,
      atividade: progresso.atividade,
    });
    if (possuiHistorico) {
      relatorio.jaComHistorico++;
      // Completa o vínculo caso uma execução anterior tenha sido interrompida.
      if (aplicar) await vincularOficial(progresso, relatorio);
      continue;
    }
    if (progresso.status === "concluida")
      relatorio.tentativasACriar.concluidas++;
    else relatorio.tentativasACriar.emAndamento++;

    if (!aplicar) continue;
    await criarTentativa(progresso, relatorio);
    await vincularOficial(progresso, relatorio);
  }
  return relatorio;
}

/**
 * Confere cada progresso contra o histórico. Somente leitura.
 * Devolve a lista de inconsistências (vazia quando tudo confere).
 */
export async function validarTentativas() {
  const inconsistencias = [];
  const registrar = (progresso, problema) =>
    inconsistencias.push({ progresso: String(progresso._id), problema });

  const cursor = ProgressoAtividade.find({}).sort({ _id: 1 }).lean().cursor();
  for await (const progresso of cursor) {
    const tentativas = await TentativaAtividade.find({
      aluno: progresso.aluno,
      atividade: progresso.atividade,
    }).lean();
    if (tentativas.length === 0) {
      registrar(progresso, "sem tentativas");
      continue;
    }
    const oficiais = tentativas.filter((tentativa) => tentativa.oficial);
    const abertas = tentativas.filter(
      (tentativa) => tentativa.status === STATUS_TENTATIVA.emAndamento,
    );
    if (abertas.length > 1)
      registrar(progresso, "mais de uma tentativa em andamento");

    if (progresso.status !== "concluida") {
      if (oficiais.length)
        registrar(progresso, "oficial sem progresso concluído");
      continue;
    }
    if (oficiais.length !== 1) {
      registrar(progresso, `${oficiais.length} tentativas oficiais`);
      continue;
    }
    const [oficial] = oficiais;
    if (String(progresso.tentativaOficial) !== String(oficial._id))
      registrar(
        progresso,
        "tentativaOficial não aponta para a tentativa oficial",
      );
    if (
      chaveRespostas(progresso.respostas) !== chaveRespostas(oficial.respostas)
    )
      registrar(progresso, "respostas diferentes da tentativa oficial");
    if (!mesmaData(progresso.concluidaEm, oficial.concluidaEm))
      registrar(progresso, "concluidaEm diferente da tentativa oficial");
    if (
      !mesmaData(
        progresso.respostasRegistradasEm,
        oficial.respostasRegistradasEm,
      )
    )
      registrar(
        progresso,
        "respostasRegistradasEm diferente da tentativa oficial",
      );
  }
  return inconsistencias;
}

/**
 * Desfaz a migração: remove só as tentativas com origem "progresso_existente" e o vínculo
 * tentativaOficial que apontava para elas. Os progressos originais nunca foram alterados.
 */
export async function reverterMigracaoTentativas({ aplicar = false } = {}) {
  const filtro = { origem: "progresso_existente" };
  const ids = (await TentativaAtividade.find(filtro).select("_id").lean()).map(
    (tentativa) => tentativa._id,
  );
  const relatorio = {
    modo: aplicar ? "reverter" : "simulacao-reversao",
    tentativasARemover: ids.length,
    tentativasDoJogoMantidas: await TentativaAtividade.countDocuments({
      origem: "jogo",
    }),
    tentativasRemovidas: 0,
    vinculosRemovidos: 0,
  };
  if (!aplicar || ids.length === 0) return relatorio;

  const vinculos = await ProgressoAtividade.updateMany(
    { tentativaOficial: { $in: ids } },
    { $set: { tentativaOficial: null } },
    { timestamps: false },
  );
  const remocao = await TentativaAtividade.deleteMany({
    _id: { $in: ids },
    ...filtro,
  });
  relatorio.vinculosRemovidos = vinculos.modifiedCount ?? 0;
  relatorio.tentativasRemovidas = remocao.deletedCount ?? 0;
  return relatorio;
}
