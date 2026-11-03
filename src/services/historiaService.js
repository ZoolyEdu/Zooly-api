import mongoose from "mongoose";
import Atividade from "../models/Atividade.js";
import Historia, {
  LIMITES_HISTORIA as L,
  ORIGEM_HISTORIA,
  STATUS_HISTORIA,
} from "../models/Historia.js";

// Banco de Histórias (somente professores; ver docs/historias.md).
// - Histórias do Zooly (origem "zooly", ou documentos antigos sem origem) são globais e
//   não podem ser alteradas pela API.
// - Histórias de professor só são visíveis e editáveis pelo próprio autor (token).

const CAMPOS_ENTRADA = [
  "titulo",
  "descricao",
  "conteudo",
  "tema",
  "faixaEtaria",
  "objetivosPedagogicos",
  "nota",
  "perguntas",
];
const CAMPOS_PERGUNTA = [
  "_id",
  "enunciado",
  "alternativas",
  "alternativaCorreta",
  "feedback",
  "objetivoPedagogico",
];

const ehObjeto = (valor) =>
  valor !== null && typeof valor === "object" && !Array.isArray(valor);
const ehDoZooly = (historia) => historia.origem !== ORIGEM_HISTORIA.professor;
const ehDoProfessor = (historia, professorId) =>
  historia.origem === ORIGEM_HISTORIA.professor &&
  String(historia.professor) === String(professorId);

/** Filtro das histórias que o professor pode ver: globais + as próprias. */
function filtroAcessivel(professorId) {
  if (!mongoose.isValidObjectId(professorId))
    return { origem: { $ne: ORIGEM_HISTORIA.professor } };
  return {
    $or: [
      { origem: { $ne: ORIGEM_HISTORIA.professor } },
      { origem: ORIGEM_HISTORIA.professor, professor: professorId },
    ],
  };
}

/** O professor pode usar esta história? (globais ou próprias). */
export function historiaAcessivel(historia, professorId) {
  return Boolean(
    historia && (ehDoZooly(historia) || ehDoProfessor(historia, professorId)),
  );
}

// ---------------------------------------------------------------------------
// Validação da entrada (usada por POST, PUT e POST /validar)
// ---------------------------------------------------------------------------

function texto(valor, campo, erros, { obrigatorio = false, maximo }) {
  if (valor === undefined || valor === null) {
    if (obrigatorio) erros.push({ campo, mensagem: "Campo obrigatório." });
    return "";
  }
  if (typeof valor !== "string") {
    erros.push({ campo, mensagem: "Deve ser um texto." });
    return "";
  }
  const limpo = valor.trim();
  if (obrigatorio && !limpo)
    erros.push({ campo, mensagem: "Campo obrigatório." });
  if (limpo.length > maximo)
    erros.push({ campo, mensagem: `Use no máximo ${maximo} caracteres.` });
  return limpo;
}

function validarPergunta(pergunta, indice, erros) {
  const base = `perguntas[${indice}]`;
  if (!ehObjeto(pergunta)) {
    erros.push({ campo: base, mensagem: "A pergunta deve ser um objeto." });
    return null;
  }
  for (const campo of Object.keys(pergunta)) {
    if (!CAMPOS_PERGUNTA.includes(campo))
      erros.push({
        campo: `${base}.${campo}`,
        mensagem: "Campo não permitido.",
      });
  }
  if (pergunta._id !== undefined && !mongoose.isValidObjectId(pergunta._id))
    erros.push({ campo: `${base}._id`, mensagem: "Identificador inválido." });

  const enunciado = texto(pergunta.enunciado, `${base}.enunciado`, erros, {
    obrigatorio: true,
    maximo: L.enunciado,
  });

  const alternativas = [];
  if (!Array.isArray(pergunta.alternativas)) {
    erros.push({
      campo: `${base}.alternativas`,
      mensagem: "Informe a lista de alternativas.",
    });
  } else {
    if (
      pergunta.alternativas.length < L.alternativasMin ||
      pergunta.alternativas.length > L.alternativasMax
    )
      erros.push({
        campo: `${base}.alternativas`,
        mensagem: `Cada pergunta deve ter de ${L.alternativasMin} a ${L.alternativasMax} alternativas.`,
      });
    pergunta.alternativas.forEach((alternativa, i) => {
      const campo = `${base}.alternativas[${i}]`;
      if (
        !ehObjeto(alternativa) ||
        Object.keys(alternativa).some((c) => !["_id", "texto"].includes(c)) ||
        (alternativa._id !== undefined &&
          !mongoose.isValidObjectId(alternativa._id))
      ) {
        erros.push({ campo, mensagem: "Use o formato { texto }." });
        return;
      }
      alternativas.push({
        ...(alternativa._id ? { _id: alternativa._id } : {}),
        texto: texto(alternativa.texto, `${campo}.texto`, erros, {
          obrigatorio: true,
          maximo: L.alternativa,
        }),
      });
    });
    const textos = alternativas.map((a) => a.texto.toLowerCase());
    if (new Set(textos).size !== textos.length)
      erros.push({
        campo: `${base}.alternativas`,
        mensagem: "As alternativas de uma pergunta não podem se repetir.",
      });
  }

  const correta = pergunta.alternativaCorreta;
  if (
    !Number.isInteger(correta) ||
    correta < 0 ||
    correta >= alternativas.length
  )
    erros.push({
      campo: `${base}.alternativaCorreta`,
      mensagem:
        "Indique a posição (a partir de 0) da alternativa correta entre as alternativas.",
    });

  return {
    ...(pergunta._id ? { _id: pergunta._id } : {}),
    enunciado,
    alternativas,
    alternativaCorreta: correta,
    feedback: texto(pergunta.feedback, `${base}.feedback`, erros, {
      maximo: L.feedback,
    }),
    objetivoPedagogico: texto(
      pergunta.objetivoPedagogico,
      `${base}.objetivoPedagogico`,
      erros,
      { maximo: L.objetivo },
    ),
  };
}

/**
 * Confere o corpo de uma história de professor. Devolve { erros, dados }: `dados` só tem os
 * campos editáveis; origem, autor e status são sempre definidos pelo servidor.
 */
export function validarEntradaHistoria(body) {
  const erros = [];
  if (!ehObjeto(body)) {
    return {
      erros: [{ campo: "corpo", mensagem: "Envie um objeto JSON." }],
      dados: null,
    };
  }
  for (const campo of Object.keys(body)) {
    if (!CAMPOS_ENTRADA.includes(campo))
      erros.push({ campo, mensagem: "Campo não permitido." });
  }

  const dados = {
    titulo: texto(body.titulo, "titulo", erros, {
      obrigatorio: true,
      maximo: L.titulo,
    }),
    descricao: texto(body.descricao, "descricao", erros, {
      maximo: L.descricao,
    }),
    conteudo: texto(body.conteudo, "conteudo", erros, {
      obrigatorio: true,
      maximo: L.conteudo,
    }),
    tema: texto(body.tema, "tema", erros, { maximo: L.tema }),
    nota: texto(body.nota, "nota", erros, { maximo: L.nota }),
    faixaEtaria: { minima: 4, maxima: 8 },
    objetivosPedagogicos: [],
    perguntas: [],
  };

  if (body.faixaEtaria !== undefined) {
    const { minima, maxima } = ehObjeto(body.faixaEtaria)
      ? body.faixaEtaria
      : {};
    const idade = (valor) =>
      Number.isInteger(valor) && valor >= L.idadeMin && valor <= L.idadeMax;
    if (
      !ehObjeto(body.faixaEtaria) ||
      Object.keys(body.faixaEtaria).some(
        (c) => !["minima", "maxima"].includes(c),
      ) ||
      !idade(minima) ||
      !idade(maxima) ||
      minima > maxima
    )
      erros.push({
        campo: "faixaEtaria",
        mensagem: `Use { minima, maxima } entre ${L.idadeMin} e ${L.idadeMax} anos, com mínima menor ou igual à máxima.`,
      });
    else dados.faixaEtaria = { minima, maxima };
  }

  if (body.objetivosPedagogicos !== undefined) {
    if (
      !Array.isArray(body.objetivosPedagogicos) ||
      body.objetivosPedagogicos.length > L.objetivos
    )
      erros.push({
        campo: "objetivosPedagogicos",
        mensagem: `Informe uma lista com até ${L.objetivos} objetivos.`,
      });
    else
      dados.objetivosPedagogicos = body.objetivosPedagogicos.map((item, i) =>
        texto(item, `objetivosPedagogicos[${i}]`, erros, {
          obrigatorio: true,
          maximo: L.objetivo,
        }),
      );
  }

  if (body.perguntas !== undefined) {
    if (!Array.isArray(body.perguntas) || body.perguntas.length > L.perguntas)
      erros.push({
        campo: "perguntas",
        mensagem: `Informe uma lista com até ${L.perguntas} perguntas.`,
      });
    else
      dados.perguntas = body.perguntas.map((pergunta, indice) =>
        validarPergunta(pergunta, indice, erros),
      );
  }

  return { erros, dados: erros.length ? null : dados };
}

// ---------------------------------------------------------------------------
// Formatos de resposta
// ---------------------------------------------------------------------------

function resumoHistoria(historia, professorId) {
  return {
    _id: historia._id,
    titulo: historia.titulo,
    descricao: historia.descricao ?? "",
    conteudo: historia.conteudo,
    tema: historia.tema ?? "",
    faixaEtaria: {
      minima: historia.faixaEtaria?.minima ?? 4,
      maxima: historia.faixaEtaria?.maxima ?? 8,
    },
    objetivosPedagogicos: [...(historia.objetivosPedagogicos ?? [])],
    nota: historia.nota ?? "",
    origem: historia.origem ?? ORIGEM_HISTORIA.zooly,
    status: historia.status ?? STATUS_HISTORIA.ativa,
    editavel: ehDoProfessor(historia, professorId),
    totalPerguntas: historia.perguntas?.length ?? 0,
    createdAt: historia.createdAt ?? null,
    updatedAt: historia.updatedAt ?? null,
  };
}

// Perguntas com gabarito e feedback: só para professores (as rotas exigem esse perfil).
function perguntasDaHistoria(historia) {
  return (historia.perguntas ?? []).map((pergunta) => ({
    _id: pergunta._id,
    enunciado: pergunta.enunciado,
    alternativas: pergunta.alternativas.map((alternativa) => ({
      _id: alternativa._id,
      texto: alternativa.texto,
    })),
    alternativaCorreta: pergunta.alternativaCorreta,
    feedback: pergunta.feedback ?? "",
    objetivoPedagogico: pergunta.objetivoPedagogico ?? "",
  }));
}

// ---------------------------------------------------------------------------
// Operações
// ---------------------------------------------------------------------------

async function listar({ professorId, origem, incluirArquivadas }) {
  let filtro;
  if (origem === ORIGEM_HISTORIA.professor) {
    if (!mongoose.isValidObjectId(professorId)) return [];
    filtro = { origem: ORIGEM_HISTORIA.professor, professor: professorId };
  } else if (origem === ORIGEM_HISTORIA.zooly) {
    filtro = { origem: { $ne: ORIGEM_HISTORIA.professor } };
  } else {
    filtro = filtroAcessivel(professorId);
  }
  // Arquivadas só aparecem quando pedidas (e, para as próprias, ficam visíveis ao autor).
  if (!incluirArquivadas) filtro.status = { $ne: STATUS_HISTORIA.arquivada };

  const historias = await Historia.find(filtro).sort({ titulo: 1, _id: 1 });
  return historias.map((historia) => resumoHistoria(historia, professorId));
}

async function buscarAcessivel(id, professorId) {
  if (!mongoose.isValidObjectId(id)) return { erro: "id-invalido" };
  const historia = await Historia.findById(id);
  // História particular de outro professor: 404, para não revelar que existe.
  if (!historiaAcessivel(historia, professorId))
    return { erro: "nao-encontrada" };
  return { historia };
}

async function buscarPropria(id, professorId) {
  const resultado = await buscarAcessivel(id, professorId);
  if (resultado.erro) return resultado;
  if (!ehDoProfessor(resultado.historia, professorId))
    return { erro: "historia-global-protegida" };
  return resultado;
}

async function obter({ id, professorId }) {
  const { historia, erro } = await buscarAcessivel(id, professorId);
  if (erro) return { erro };
  return {
    historia: {
      ...resumoHistoria(historia, professorId),
      perguntas: perguntasDaHistoria(historia),
    },
  };
}

async function obterPerguntas({ id, professorId }) {
  const { historia, erro } = await buscarAcessivel(id, professorId);
  if (erro) return { erro };
  return {
    historiaId: historia._id,
    perguntas: perguntasDaHistoria(historia),
  };
}

async function criar({ body, professorId }) {
  const { erros, dados } = validarEntradaHistoria(body);
  if (erros.length) return { erro: "dados-invalidos", erros };
  const historia = await Historia.create({
    ...dados,
    origem: ORIGEM_HISTORIA.professor,
    professor: professorId,
    status: STATUS_HISTORIA.ativa,
  });
  return {
    historia: {
      ...resumoHistoria(historia, professorId),
      perguntas: perguntasDaHistoria(historia),
    },
  };
}

async function atualizar({ id, body, professorId }) {
  const busca = await buscarPropria(id, professorId);
  if (busca.erro) return busca;
  const { erros, dados } = validarEntradaHistoria(body);
  if (erros.length) return { erro: "dados-invalidos", erros };

  // As atividades guardam cópias: editar aqui não altera nenhuma atividade existente.
  busca.historia.set(dados);
  await busca.historia.save();
  return {
    historia: {
      ...resumoHistoria(busca.historia, professorId),
      perguntas: perguntasDaHistoria(busca.historia),
    },
  };
}

async function alterarStatus({ id, professorId, status }) {
  const busca = await buscarPropria(id, professorId);
  if (busca.erro) return busca;
  busca.historia.status = status;
  await busca.historia.save();
  return { historia: resumoHistoria(busca.historia, professorId) };
}

async function excluir({ id, professorId }) {
  const busca = await buscarPropria(id, professorId);
  if (busca.erro) return busca;
  // Proteção para atividades antigas que leem a história ao vivo (sem cópia).
  const usadaSemCopia = await Atividade.exists({
    "historia.tipo": "oficial",
    "historia.historiaId": busca.historia._id,
    "historia.textoCopia": { $exists: false },
  });
  if (usadaSemCopia) return { erro: "historia-em-uso" };
  await busca.historia.deleteOne();
  return { excluida: true };
}

/**
 * Dados prontos para pré-preencher o formulário de atividade do Zooly-web.
 * O conteúdo é uma CÓPIA: a atividade é salva com `historia.tipo = "propria"` e o texto
 * (que o professor pode editar), e `bancoHistoriaId` só registra de onde veio.
 * Cada chamada gera novos ids de alternativas, no formato aceito por POST /api/atividades.
 */
async function modeloAtividade({ id, professorId }) {
  const { historia, erro } = await buscarAcessivel(id, professorId);
  if (erro) return { erro };
  if (historia.status === STATUS_HISTORIA.arquivada)
    return { erro: "historia-arquivada" };

  const questoes = (historia.perguntas ?? []).map((pergunta) => {
    const alternativas = pergunta.alternativas.map((alternativa) => ({
      _id: new mongoose.Types.ObjectId(),
      texto: alternativa.texto,
    }));
    return {
      tipo: "multipla_escolha",
      enunciado: pergunta.enunciado,
      alternativas,
      respostasCorretas: [alternativas[pergunta.alternativaCorreta]._id],
    };
  });

  return {
    modelo: {
      titulo: historia.titulo,
      historia: {
        tipo: "propria",
        texto: historia.conteudo,
        bancoHistoriaId: historia._id,
      },
      questoes,
    },
    apoioPedagogico: {
      historiaId: historia._id,
      tituloHistoria: historia.titulo,
      descricao: historia.descricao ?? "",
      tema: historia.tema ?? "",
      faixaEtaria: resumoHistoria(historia, professorId).faixaEtaria,
      objetivosPedagogicos: [...(historia.objetivosPedagogicos ?? [])],
      nota: historia.nota ?? "",
      perguntas: (historia.perguntas ?? []).map((pergunta) => ({
        enunciado: pergunta.enunciado,
        feedback: pergunta.feedback ?? "",
        objetivoPedagogico: pergunta.objetivoPedagogico ?? "",
      })),
    },
  };
}

export default {
  listar,
  obter,
  obterPerguntas,
  criar,
  atualizar,
  arquivar: (dados) =>
    alterarStatus({ ...dados, status: STATUS_HISTORIA.arquivada }),
  reativar: (dados) =>
    alterarStatus({ ...dados, status: STATUS_HISTORIA.ativa }),
  excluir,
  modeloAtividade,
};
