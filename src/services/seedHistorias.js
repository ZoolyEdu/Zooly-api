import { HISTORIAS_INICIAIS } from "../config/historiasIniciais.js";
import Historia, {
  ORIGEM_HISTORIA,
  STATUS_HISTORIA,
} from "../models/Historia.js";

// Cadastro das histórias iniciais do Zooly.
// - Idempotente: cada história tem `_id` e `chave` estáveis; o que já existe nunca é duplicado.
// - Não sobrescreve: se a história já existe (mesmo alterada), ela é mantida e, quando difere
//   do texto de referência, aparece em `divergentes` para revisão manual.
// - Não toca em histórias de professores nem em qualquer outro documento.

const assinatura = (historia) =>
  JSON.stringify({
    titulo: historia.titulo,
    conteudo: historia.conteudo,
    perguntas: (historia.perguntas ?? []).map((pergunta) => ({
      enunciado: pergunta.enunciado,
      alternativas: pergunta.alternativas.map(
        (alternativa) => alternativa.texto,
      ),
      alternativaCorreta: pergunta.alternativaCorreta,
    })),
  });

function documentoHistoriaInicial(historia) {
  return {
    ...historia,
    origem: ORIGEM_HISTORIA.zooly,
    professor: null,
    status: STATUS_HISTORIA.ativa,
  };
}

export async function semearHistoriasIniciais({ aplicar = false } = {}) {
  const relatorio = {
    modo: aplicar ? "aplicar" : "simulacao",
    total: HISTORIAS_INICIAIS.length,
    aCriar: [],
    criadas: [],
    existentes: [],
    divergentes: [],
    conflitos: [],
  };

  for (const historia of HISTORIAS_INICIAIS) {
    const existente = await Historia.findById(historia._id).lean();
    if (existente) {
      relatorio.existentes.push(historia.chave);
      if (assinatura(existente) !== assinatura(historia))
        relatorio.divergentes.push(historia.chave);
      continue;
    }
    const mesmaChave = await Historia.findOne({ chave: historia.chave })
      .select("_id")
      .lean();
    if (mesmaChave) {
      relatorio.conflitos.push({
        chave: historia.chave,
        idExistente: String(mesmaChave._id),
      });
      continue;
    }

    relatorio.aCriar.push(historia.chave);
    if (!aplicar) continue;
    try {
      await Historia.create(documentoHistoriaInicial(historia));
      relatorio.criadas.push(historia.chave);
    } catch (erro) {
      // Outra execução criou a mesma história ao mesmo tempo.
      if (erro?.code !== 11000) throw erro;
      relatorio.existentes.push(historia.chave);
    }
  }
  return relatorio;
}
