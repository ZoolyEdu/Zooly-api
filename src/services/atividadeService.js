import mongoose from "mongoose";
import Atividade, { etapasMissao } from "../models/Atividade.js";
import Historia, { STATUS_HISTORIA } from "../models/Historia.js";
import { historiaAcessivel } from "./historiaService.js";
import Professor from "../models/Professor.js";
import Turma from "../models/Turma.js";
import { erroHttp, transacoesIndisponiveis } from "../utils/erros.js";

const camposAtividadeEntrada = [
  "turma",
  "titulo",
  "ordem",
  "historia",
  "questoes",
  "prazo",
  "recompensaMoedas",
  "missao",
  "habilidadesBncc",
];
// Na edição, a turma não pode ser trocada.
const camposEdicao = camposAtividadeEntrada.filter((campo) => campo !== "turma");
const camposQuestao = [
  "tipo",
  "enunciado",
  "pontos",
  "alternativas",
  "respostasCorretas",
];
const codigoBnccValido = /^(?:EI0[1-3]|EF0[1-5])[A-Z]{2}\d{2}$/;

function recompensaValida(valor) {
  return Number.isSafeInteger(valor) && valor >= 1;
}

// A ordem é opcional; quando vier, precisa ser um inteiro a partir de 1.
function ordemValida(ordem) {
  return (
    ordem === undefined ||
    (typeof ordem === "number" && Number.isInteger(ordem) && ordem >= 1)
  );
}

function ehObjeto(valor) {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

function temCampoDesconhecido(objeto, camposPermitidos) {
  return Object.keys(objeto).some((campo) => !camposPermitidos.includes(campo));
}

function prazoDeEntradaValido(prazo) {
  return (
    prazo === undefined ||
    prazo === null ||
    (typeof prazo === "string" && Number.isFinite(Date.parse(prazo)))
  );
}

function missaoValida(missao) {
  return (
    ehObjeto(missao) &&
    !temCampoDesconhecido(missao, ["etapas"]) &&
    Array.isArray(missao.etapas) &&
    missao.etapas.every((etapa) => etapasMissao.includes(etapa)) &&
    new Set(missao.etapas).size === missao.etapas.length
  );
}

function habilidadesBnccValidas(habilidades) {
  if (!Array.isArray(habilidades)) return false;
  const codigos = new Set();
  for (const habilidade of habilidades) {
    if (
      !ehObjeto(habilidade) ||
      temCampoDesconhecido(habilidade, ["codigo", "texto", "etapa"]) ||
      typeof habilidade.codigo !== "string" ||
      !codigoBnccValido.test(habilidade.codigo) ||
      typeof habilidade.texto !== "string" ||
      !habilidade.texto.trim() ||
      !["EI", "EF"].includes(habilidade.etapa) ||
      !habilidade.codigo.startsWith(habilidade.etapa) ||
      codigos.has(habilidade.codigo)
    )
      return false;
    codigos.add(habilidade.codigo);
  }
  return true;
}

function validarCamposAninhados(
  body,
  { permitirIdsSubdocumentos = false } = {},
) {
  if (
    !ehObjeto(body.historia) ||
    temCampoDesconhecido(body.historia, [
      "tipo",
      "historiaId",
      "texto",
      "bancoHistoriaId",
    ])
  ) {
    return false;
  }

  if (Object.hasOwn(body, "missao") && !missaoValida(body.missao)) return false;
  if (
    Object.hasOwn(body, "habilidadesBncc") &&
    !habilidadesBnccValidas(body.habilidadesBncc)
  )
    return false;
  if (Object.hasOwn(body, "questoes") && !Array.isArray(body.questoes))
    return false;

  const camposPermitidos = permitirIdsSubdocumentos
    ? ["_id", ...camposQuestao]
    : camposQuestao;
  for (const questao of body.questoes ?? []) {
    if (!ehObjeto(questao) || temCampoDesconhecido(questao, camposPermitidos))
      return false;

    if (Object.hasOwn(questao, "_id") && !mongoose.isValidObjectId(questao._id))
      return false;
    if (Object.hasOwn(questao, "tipo") && questao.tipo !== "multipla_escolha")
      return false;
    if (
      Object.hasOwn(questao, "pontos") &&
      (!Number.isSafeInteger(questao.pontos) || questao.pontos < 0)
    )
      return false;
    if (
      Object.hasOwn(questao, "alternativas") &&
      !Array.isArray(questao.alternativas)
    )
      return false;

    for (const alternativa of questao.alternativas ?? []) {
      if (
        !ehObjeto(alternativa) ||
        temCampoDesconhecido(alternativa, ["_id", "texto"]) ||
        (Object.hasOwn(alternativa, "_id") &&
          !mongoose.isValidObjectId(alternativa._id))
      )
        return false;
    }

    if (
      Object.hasOwn(questao, "respostasCorretas") &&
      !Array.isArray(questao.respostasCorretas)
    )
      return false;
  }

  return true;
}

function validarCorpoEdicao(body) {
  return (
    ehObjeto(body) &&
    !temCampoDesconhecido(body, camposEdicao) &&
    typeof body.titulo === "string" &&
    Boolean(body.titulo.trim()) &&
    ordemValida(body.ordem) &&
    (body.recompensaMoedas === undefined ||
      recompensaValida(body.recompensaMoedas)) &&
    prazoDeEntradaValido(body.prazo) &&
    Object.hasOwn(body, "historia") &&
    Object.hasOwn(body, "questoes") &&
    Array.isArray(body.questoes) &&
    validarCamposAninhados(body, { permitirIdsSubdocumentos: true })
  );
}

function idsSubdocumentosPertencemAtividade(questoesEntrada, atividade) {
  const questoesExistentes = new Map(
    atividade.questoes.map((questao) => [String(questao._id), questao]),
  );
  const idsQuestoesEnviadas = new Set();

  for (const questaoEntrada of questoesEntrada) {
    const idQuestao = questaoEntrada._id ? String(questaoEntrada._id) : null;
    const questaoExistente = idQuestao
      ? questoesExistentes.get(idQuestao)
      : null;

    if (idQuestao && (!questaoExistente || idsQuestoesEnviadas.has(idQuestao)))
      return false;
    if (idQuestao) idsQuestoesEnviadas.add(idQuestao);

    const alternativasExistentes = new Set(
      (questaoExistente?.alternativas ?? []).map((alternativa) =>
        String(alternativa._id),
      ),
    );
    const idsAlternativasEnviadas = new Set();

    for (const alternativa of questaoEntrada.alternativas ?? []) {
      if (!Object.hasOwn(alternativa, "_id")) continue;
      const idAlternativa = String(alternativa._id);
      if (
        !questaoExistente ||
        !alternativasExistentes.has(idAlternativa) ||
        idsAlternativasEnviadas.has(idAlternativa)
      ) {
        return false;
      }
      idsAlternativasEnviadas.add(idAlternativa);
    }
  }

  return true;
}

function aplicarRespostasPorIndice(atividade, questoesEntrada) {
  for (const [indiceQuestao, questaoEntrada] of questoesEntrada.entries()) {
    const respostas = questaoEntrada.respostasCorretas ?? [];
    if (!respostas.some((resposta) => typeof resposta === "number")) continue;

    const questao = atividade.questoes[indiceQuestao];
    const respostasResolvidas = respostas.map((resposta) => {
      if (typeof resposta !== "number") return resposta;
      if (
        !Number.isInteger(resposta) ||
        resposta < 0 ||
        resposta >= questao.alternativas.length
      )
        return null;
      return questao.alternativas[resposta]._id;
    });

    if (respostasResolvidas.some((resposta) => resposta === null)) return false;
    questao.respostasCorretas = respostasResolvidas;
  }

  return true;
}

/**
 * Confere a história escolhida no Banco de Histórias e devolve a cópia que fica na atividade.
 * - `tipo: "oficial"`: o servidor copia título e texto para `tituloCopia`/`textoCopia`.
 * - `tipo: "propria"` com `bancoHistoriaId`: o texto já vem do professor; só a origem é conferida.
 * A cópia existente é mantida quando a atividade é editada sem trocar de história, para que
 * mudanças posteriores no banco nunca alterem atividades já criadas.
 */
async function prepararHistoria(historiaEntrada, professorId, anterior = null) {
  const oficial = historiaEntrada.tipo === "oficial";
  const id = oficial
    ? historiaEntrada.historiaId
    : historiaEntrada.bancoHistoriaId;
  if (!oficial && id === undefined) return {};
  if (typeof id !== "string" || !mongoose.isValidObjectId(id)) {
    return { erro: "historia-id-invalido" };
  }

  const idAnterior = oficial ? anterior?.historiaId : anterior?.bancoHistoriaId;
  const mesmaHistoria =
    anterior?.tipo === historiaEntrada.tipo && String(idAnterior) === id;
  if (mesmaHistoria && (!oficial || anterior.textoCopia)) {
    return oficial
      ? {
          copia: {
            tituloCopia: anterior.tituloCopia,
            textoCopia: anterior.textoCopia,
          },
        }
      : {};
  }

  const historia = await Historia.findById(id);
  if (!historiaAcessivel(historia, professorId))
    return { erro: "historia-nao-encontrada" };
  if (!mesmaHistoria && historia.status === STATUS_HISTORIA.arquivada)
    return { erro: "historia-arquivada" };
  return oficial
    ? {
        copia: {
          tituloCopia: historia.titulo,
          textoCopia: historia.conteudo,
        },
      }
    : {};
}

function aplicarCopiaHistoria(atividade, copia) {
  if (!copia) return;
  atividade.set("historia.tituloCopia", copia.tituloCopia);
  atividade.set("historia.textoCopia", copia.textoCopia);
}

async function proximaOrdemDisponivel(turmaId) {
  const atividades = await Atividade.find({ turma: turmaId }).select("ordem");
  const maiorOrdem = atividades.reduce((maior, atividade) => {
    const ordem = Number(atividade.ordem);
    return Number.isInteger(ordem) && ordem > maior ? ordem : maior;
  }, 0);
  return maiorOrdem + 1;
}

function removerRespostasCorretas(valor) {
  if (Array.isArray(valor)) return valor.map(removerRespostasCorretas);
  if (
    !valor ||
    typeof valor !== "object" ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(valor))
  ) {
    return valor;
  }

  return Object.fromEntries(
    Object.entries(valor)
      .filter(([campo]) => campo !== "respostasCorretas")
      .map(([campo, conteudo]) => [campo, removerRespostasCorretas(conteudo)]),
  );
}

function listaSemGabarito(atividades) {
  return atividades.map((atividade) =>
    removerRespostasCorretas(
      typeof atividade.toObject === "function" ? atividade.toObject() : atividade,
    ),
  );
}

// Busca a atividade e confere se o professor é o autor. `erroAutor` varia conforme a operação.
async function buscarDoAutor(atividadeId, professorId, erroAutor) {
  const atividade = await Atividade.findById(atividadeId);
  if (!atividade) return { erro: "atividade-nao-encontrada" };
  if (String(atividade.professorCriador) !== String(professorId))
    return { erro: erroAutor };
  return { atividade };
}

async function criar({ body, professorId }) {
  if (!ehObjeto(body)) return { erro: "corpo-deve-ser-objeto" };
  if (Object.hasOwn(body, "status"))
    return { erro: "status-inicial-protegido" };
  if (temCampoDesconhecido(body, camposAtividadeEntrada))
    return { erro: "campos-nao-permitidos" };

  if (
    typeof body.turma !== "string" ||
    !mongoose.isValidObjectId(body.turma) ||
    typeof body.titulo !== "string" ||
    !body.titulo.trim() ||
    !ordemValida(body.ordem) ||
    (body.recompensaMoedas !== undefined &&
      !recompensaValida(body.recompensaMoedas)) ||
    !prazoDeEntradaValido(body.prazo) ||
    !validarCamposAninhados(body)
  )
    return { erro: "dados-atividade-invalidos" };

  if (!mongoose.isValidObjectId(professorId))
    return { erro: "professor-nao-encontrado" };

  const atividade = new Atividade({
    turma: body.turma,
    professorCriador: professorId,
    titulo: body.titulo,
    ordem: body.ordem !== undefined ? body.ordem : 1,
    historia: body.historia,
    missao: body.missao,
    habilidadesBncc: body.habilidadesBncc,
    questoes: body.questoes,
    status: "rascunho",
    prazo: body.prazo ?? null,
  });
  if (body.recompensaMoedas !== undefined)
    atividade.recompensaMoedas = body.recompensaMoedas;

  await atividade.validate();

  const turma = await Turma.findById(body.turma);
  if (!turma || turma.arquivada) return { erro: "turma-nao-encontrada" };
  if (String(turma.professorResponsavel) !== String(professorId))
    return { erro: "professor-nao-responsavel" };

  const historia = await prepararHistoria(body.historia, professorId);
  if (historia.erro) return historia;
  aplicarCopiaHistoria(atividade, historia.copia);

  const ordemManual = body.ordem !== undefined;
  if (
    ordemManual &&
    (await Atividade.exists({ turma: body.turma, ordem: body.ordem }))
  ) {
    return { erro: "ordem-ocupada" };
  }

  const maxTentativas = ordemManual ? 1 : 5;
  for (let tentativa = 0; tentativa < maxTentativas; tentativa += 1) {
    atividade.ordem = ordemManual
      ? body.ordem
      : await proximaOrdemDisponivel(body.turma);
    try {
      await atividade.save();
      break;
    } catch (error) {
      if (error.code !== 11000) throw error;
      if (ordemManual) return { erro: "ordem-ocupada" };
      if (tentativa === maxTentativas - 1)
        return { erro: "ordem-nao-reservada" };
    }
  }

  return { atividade };
}

async function listarPublicadas(professorId) {
  const professor = await Professor.findById(professorId).select("_id");
  if (!professor) return { erro: "professor-nao-encontrado" };

  const turmas = await Turma.find({
    professorResponsavel: professor._id,
    arquivada: false,
  }).select("_id");
  const turmaIds = turmas.map((turma) => turma._id);

  if (turmaIds.length === 0) return { atividades: [] };

  const atividades = await Atividade.find({
    status: "publicada",
    turma: { $in: turmaIds },
  })
    .select({ "questoes.respostasCorretas": 0 })
    .sort({ publicadoEm: 1, _id: 1 });

  return { atividades: listaSemGabarito(atividades) };
}

async function listarDoProfessor(professorId) {
  if (!mongoose.isValidObjectId(professorId))
    return { erro: "professor-nao-encontrado" };

  const atividades = await Atividade.find({ professorCriador: professorId })
    .select({ "questoes.respostasCorretas": 0 })
    .sort({ updatedAt: -1, _id: -1 });

  return { atividades: listaSemGabarito(atividades) };
}

async function consultar({ atividadeId, professorId }) {
  if (!mongoose.isValidObjectId(atividadeId))
    return { erro: "atividade-id-invalido" };
  return buscarDoAutor(atividadeId, professorId, "somente-autor-consulta");
}

async function publicar({ atividadeId, professorId, body }) {
  if (!mongoose.isValidObjectId(atividadeId))
    return { erro: "atividade-id-invalido" };
  if (body !== undefined && (!ehObjeto(body) || Object.keys(body).length > 0))
    return { erro: "publicacao-com-campos" };

  const busca = await buscarDoAutor(
    atividadeId,
    professorId,
    "somente-autor-publica",
  );
  if (busca.erro) return busca;
  const { atividade } = busca;
  if (atividade.status !== "rascunho")
    return { erro: "somente-rascunho-publica" };

  atividade.status = "publicada";
  atividade.publicadoEm = new Date();
  await atividade.validate();
  await atividade.save();
  return { atividade };
}

// Registros do aluno apagados junto com a atividade (as moedas só perdem o vínculo).
const REGISTROS_REMOVIVEIS_COM_ATIVIDADE = [
  "ProgressoAtividade",
  "TentativaAtividade",
  "MovimentacaoMoeda",
];

function temRegistroNaoRemovivel(referencias) {
  return referencias.some(
    ({ Modelo }) =>
      !REGISTROS_REMOVIVEIS_COM_ATIVIDADE.includes(Modelo.modelName),
  );
}

function pathsReferenciandoAtividade(schema, prefixo = "") {
  const paths = [];
  schema.eachPath((path, tipo) => {
    const caminho = `${prefixo}${path}`;
    const refsAtividade =
      tipo.options?.ref === "Atividade" ||
      tipo.caster?.options?.ref === "Atividade" ||
      tipo.$embeddedSchemaType?.options?.ref === "Atividade";
    if (refsAtividade) paths.push(caminho);
    if (tipo.schema)
      paths.push(...pathsReferenciandoAtividade(tipo.schema, `${caminho}.`));
  });
  return paths;
}

async function referenciasDaAtividade(atividadeId, sessao) {
  const referencias = [];
  for (const nomeModelo of mongoose.modelNames()) {
    if (nomeModelo === Atividade.modelName) continue;
    const Modelo = mongoose.model(nomeModelo);
    for (const path of pathsReferenciandoAtividade(Modelo.schema)) {
      let consulta = Modelo.exists({ [path]: atividadeId });
      if (sessao && typeof consulta.session === "function")
        consulta = consulta.session(sessao);
      if (await consulta) referencias.push({ Modelo, path });
    }
  }
  return referencias;
}

async function excluir({ atividadeId, professorId }) {
  if (!mongoose.isValidObjectId(atividadeId))
    return { erro: "atividade-id-invalido" };

  const busca = await buscarDoAutor(
    atividadeId,
    professorId,
    "somente-autor-exclui",
  );
  if (busca.erro) return busca;
  const { atividade } = busca;
  const referencias = await referenciasDaAtividade(atividade._id);
  if (referencias.length === 0) {
    await atividade.deleteOne();
    return { excluida: true };
  }

  if (temRegistroNaoRemovivel(referencias)) {
    return { erro: "atividade-com-registros" };
  }

  let sessao;
  try {
    sessao = await mongoose.startSession();
    await sessao.withTransaction(async () => {
      const referenciasAtuais = await referenciasDaAtividade(
        atividade._id,
        sessao,
      );
      if (temRegistroNaoRemovivel(referenciasAtuais)) {
        throw erroHttp(
          "A atividade possui referências que não podem ser removidas com segurança.",
          409,
        );
      }

      for (const { Modelo, path } of referenciasAtuais) {
        const filtro = { [path]: atividade._id };
        if (Modelo.modelName === "MovimentacaoMoeda") {
          await Modelo.updateMany(
            filtro,
            { $unset: { [path]: 1 } },
            { session: sessao },
          );
        } else {
          await Modelo.deleteMany(filtro, { session: sessao });
        }
      }
      await atividade.deleteOne({ session: sessao });
    });
  } catch (erro) {
    if (transacoesIndisponiveis(erro)) {
      throw erroHttp(
        "A exclusão com registros relacionados exige MongoDB com suporte a transações.",
        503,
      );
    }
    throw erro;
  } finally {
    if (sessao) await sessao.endSession();
  }

  return { excluida: true };
}

async function atualizar({ atividadeId, professorId, body }) {
  if (!mongoose.isValidObjectId(atividadeId))
    return { erro: "atividade-id-invalido" };

  const busca = await buscarDoAutor(
    atividadeId,
    professorId,
    "somente-autor-edita",
  );
  if (busca.erro) return busca;
  const { atividade } = busca;
  if (!validarCorpoEdicao(body)) return { erro: "dados-edicao-invalidos" };
  if (!idsSubdocumentosPertencemAtividade(body.questoes, atividade))
    return { erro: "ids-subdocumentos-invalidos" };

  const historiaAnterior = atividade.historia
    ? typeof atividade.historia.toObject === "function"
      ? atividade.historia.toObject()
      : { ...atividade.historia }
    : null;
  atividade.titulo = body.titulo;
  if (body.ordem !== undefined) atividade.ordem = body.ordem;
  atividade.historia = body.historia;
  atividade.prazo = body.prazo ?? null;
  if (body.recompensaMoedas !== undefined)
    atividade.recompensaMoedas = body.recompensaMoedas;
  if (Object.hasOwn(body, "missao")) atividade.missao = body.missao;
  if (Object.hasOwn(body, "habilidadesBncc"))
    atividade.habilidadesBncc = body.habilidadesBncc;
  const questoesExistentes = atividade.questoes;
  atividade.questoes = body.questoes.map((questao) => {
    const existente = questao._id ? questoesExistentes.id(questao._id) : null;
    return {
      ...questao,
      tipo: questao.tipo ?? existente?.tipo ?? "multipla_escolha",
      pontos: questao.pontos ?? existente?.pontos ?? 0,
      respostasCorretas: [],
    };
  });
  if (!aplicarRespostasPorIndice(atividade, body.questoes))
    return { erro: "indice-resposta-invalido" };

  for (const [indiceQuestao, questaoEntrada] of body.questoes.entries()) {
    const respostas = questaoEntrada.respostasCorretas ?? [];
    if (!respostas.some((resposta) => typeof resposta === "number")) {
      atividade.questoes[indiceQuestao].respostasCorretas = respostas;
    }
  }
  await atividade.validate();

  const historia = await prepararHistoria(
    body.historia,
    professorId,
    historiaAnterior,
  );
  if (historia.erro) return historia;
  aplicarCopiaHistoria(atividade, historia.copia);

  try {
    await atividade.save();
  } catch (error) {
    if (error.code === 11000 && body.ordem !== undefined)
      return { erro: "ordem-ocupada" };
    throw error;
  }
  return { atividade };
}

export default {
  criar,
  listarDoProfessor,
  listarPublicadas,
  consultar,
  publicar,
  excluir,
  atualizar,
};
