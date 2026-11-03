import mongoose from "mongoose";

const { Schema } = mongoose;

// Banco de Histórias. Documentos antigos (só titulo e conteudo) continuam válidos:
// os campos novos têm padrão e documentos sem `origem` são tratados como histórias do Zooly.

export const ORIGEM_HISTORIA = Object.freeze({
  zooly: "zooly",
  professor: "professor",
});
export const STATUS_HISTORIA = Object.freeze({
  ativa: "ativa",
  arquivada: "arquivada",
});
export const LIMITES_HISTORIA = Object.freeze({
  titulo: 120,
  descricao: 400,
  conteudo: 8000,
  tema: 80,
  nota: 400,
  objetivos: 10,
  objetivo: 300,
  perguntas: 20,
  enunciado: 300,
  alternativasMin: 2,
  alternativasMax: 6,
  alternativa: 150,
  feedback: 500,
  idadeMin: 3,
  idadeMax: 12,
});

const alternativaHistoriaSchema = new Schema(
  {
    texto: {
      type: String,
      required: [true, "O texto da alternativa é obrigatório."],
      trim: true,
      maxlength: LIMITES_HISTORIA.alternativa,
    },
  },
  { _id: true },
);

const perguntaHistoriaSchema = new Schema(
  {
    enunciado: {
      type: String,
      required: [true, "O enunciado da pergunta é obrigatório."],
      trim: true,
      maxlength: LIMITES_HISTORIA.enunciado,
    },
    alternativas: {
      type: [alternativaHistoriaSchema],
      default: [],
    },
    // Índice (a partir de 0) da alternativa correta em `alternativas`.
    alternativaCorreta: {
      type: Number,
      required: [true, "Indique a alternativa correta."],
      min: 0,
    },
    feedback: {
      type: String,
      trim: true,
      default: "",
      maxlength: LIMITES_HISTORIA.feedback,
    },
    objetivoPedagogico: {
      type: String,
      trim: true,
      default: "",
      maxlength: LIMITES_HISTORIA.objetivo,
    },
  },
  { _id: true },
);

const historiaSchema = new Schema(
  {
    titulo: {
      type: String,
      required: [true, "O título da história é obrigatório."],
      trim: true,
      maxlength: LIMITES_HISTORIA.titulo,
    },
    descricao: {
      type: String,
      trim: true,
      default: "",
      maxlength: LIMITES_HISTORIA.descricao,
    },
    conteudo: {
      type: String,
      required: [true, "O conteúdo da história é obrigatório."],
      trim: true,
      maxlength: LIMITES_HISTORIA.conteudo,
    },
    tema: {
      type: String,
      trim: true,
      default: "",
      maxlength: LIMITES_HISTORIA.tema,
    },
    faixaEtaria: {
      minima: { type: Number, default: 4 },
      maxima: { type: Number, default: 8 },
    },
    objetivosPedagogicos: {
      type: [
        { type: String, trim: true, maxlength: LIMITES_HISTORIA.objetivo },
      ],
      default: [],
    },
    // Créditos e aviso de adaptação (ex.: "Adaptação infantil inspirada no folclore...").
    nota: {
      type: String,
      trim: true,
      default: "",
      maxlength: LIMITES_HISTORIA.nota,
    },
    origem: {
      type: String,
      enum: {
        values: Object.values(ORIGEM_HISTORIA),
        message: "A origem deve ser zooly ou professor.",
      },
      default: ORIGEM_HISTORIA.zooly,
    },
    professor: {
      type: Schema.Types.ObjectId,
      ref: "Professor",
      default: null,
    },
    status: {
      type: String,
      enum: {
        values: Object.values(STATUS_HISTORIA),
        message: "O status deve ser ativa ou arquivada.",
      },
      default: STATUS_HISTORIA.ativa,
    },
    // Identificador estável das histórias iniciais do Zooly (seed idempotente).
    chave: {
      type: String,
      trim: true,
      default: undefined,
    },
    perguntas: {
      type: [perguntaHistoriaSchema],
      default: [],
    },
  },
  { timestamps: true },
);

historiaSchema.index({ origem: 1, status: 1, titulo: 1 });
historiaSchema.index({ professor: 1, status: 1, titulo: 1 });
historiaSchema.index(
  { chave: 1 },
  {
    unique: true,
    partialFilterExpression: { chave: { $type: "string" } },
    name: "chave_historia_inicial",
  },
);

historiaSchema.pre("validate", function validarHistoria() {
  if (this.origem === ORIGEM_HISTORIA.professor && !this.professor)
    this.invalidate("professor", "Histórias de professor exigem o autor.");
  if (this.origem === ORIGEM_HISTORIA.zooly && this.professor)
    this.invalidate("professor", "Histórias do Zooly não têm professor autor.");

  const { minima, maxima } = this.faixaEtaria ?? {};
  const idadeValida = (idade) =>
    Number.isInteger(idade) &&
    idade >= LIMITES_HISTORIA.idadeMin &&
    idade <= LIMITES_HISTORIA.idadeMax;
  if (!idadeValida(minima) || !idadeValida(maxima) || minima > maxima)
    this.invalidate(
      "faixaEtaria",
      `A faixa etária deve ficar entre ${LIMITES_HISTORIA.idadeMin} e ${LIMITES_HISTORIA.idadeMax} anos, com mínima menor ou igual à máxima.`,
    );

  if (this.objetivosPedagogicos.length > LIMITES_HISTORIA.objetivos)
    this.invalidate(
      "objetivosPedagogicos",
      `Informe no máximo ${LIMITES_HISTORIA.objetivos} objetivos pedagógicos.`,
    );
  if (this.perguntas.length > LIMITES_HISTORIA.perguntas)
    this.invalidate(
      "perguntas",
      `Uma história pode ter no máximo ${LIMITES_HISTORIA.perguntas} perguntas.`,
    );

  this.perguntas.forEach((pergunta, indice) => {
    const total = pergunta.alternativas.length;
    if (
      total < LIMITES_HISTORIA.alternativasMin ||
      total > LIMITES_HISTORIA.alternativasMax
    )
      this.invalidate(
        `perguntas.${indice}.alternativas`,
        `Cada pergunta deve ter de ${LIMITES_HISTORIA.alternativasMin} a ${LIMITES_HISTORIA.alternativasMax} alternativas.`,
      );
    const textos = pergunta.alternativas.map((a) => a.texto.toLowerCase());
    if (new Set(textos).size !== textos.length)
      this.invalidate(
        `perguntas.${indice}.alternativas`,
        "As alternativas de uma pergunta não podem se repetir.",
      );
    if (
      !Number.isInteger(pergunta.alternativaCorreta) ||
      pergunta.alternativaCorreta >= total
    )
      this.invalidate(
        `perguntas.${indice}.alternativaCorreta`,
        "A alternativa correta deve indicar uma das alternativas da pergunta.",
      );
  });
});

export default mongoose.model("Historia", historiaSchema);
