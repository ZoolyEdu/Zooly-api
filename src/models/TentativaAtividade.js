import mongoose from "mongoose";
import { respostaSchema } from "./ProgressoAtividade.js";

const { Schema } = mongoose;

export const STATUS_TENTATIVA = Object.freeze({
  emAndamento: "em_andamento",
  concluida: "concluida",
});

// Cada vez que o aluno joga uma atividade é uma tentativa. A primeira concluída é a oficial:
// é a que vale para o desempenho e a única que concede moedas. As demais ficam no histórico.
const tentativaAtividadeSchema = new Schema(
  {
    aluno: {
      type: Schema.Types.ObjectId,
      ref: "Aluno",
      required: [true, "O aluno é obrigatório."],
    },
    atividade: {
      type: Schema.Types.ObjectId,
      ref: "Atividade",
      required: [true, "A atividade é obrigatória."],
    },
    progresso: {
      type: Schema.Types.ObjectId,
      ref: "ProgressoAtividade",
      required: [true, "O progresso da atividade é obrigatório."],
    },
    numeroTentativa: {
      type: Number,
      required: [true, "O número da tentativa é obrigatório."],
      min: [1, "O número da tentativa começa em 1."],
      validate: {
        validator: Number.isSafeInteger,
        message: "O número da tentativa deve ser inteiro.",
      },
    },
    status: {
      type: String,
      enum: {
        values: Object.values(STATUS_TENTATIVA),
        message: "O status deve ser em_andamento ou concluida.",
      },
      default: STATUS_TENTATIVA.emAndamento,
    },
    oficial: {
      type: Boolean,
      default: false,
    },
    iniciadaEm: {
      type: Date,
      required: true,
      default: Date.now,
    },
    concluidaEm: {
      type: Date,
      default: null,
    },
    respostas: {
      type: [respostaSchema],
      default: [],
    },
    respostasRegistradasEm: {
      type: Date,
      default: null,
    },
    // "progresso_existente": criada a partir de um ProgressoAtividade anterior ao histórico
    // (migração ou primeiro acesso depois da implantação). Permite reverter a migração.
    origem: {
      type: String,
      enum: ["jogo", "progresso_existente"],
      default: "jogo",
    },
  },
  { timestamps: true },
);

tentativaAtividadeSchema.index(
  { aluno: 1, atividade: 1, numeroTentativa: 1 },
  { unique: true, name: "numero_tentativa_por_aluno_atividade" },
);
tentativaAtividadeSchema.index(
  { aluno: 1, atividade: 1 },
  {
    unique: true,
    partialFilterExpression: { status: STATUS_TENTATIVA.emAndamento },
    name: "uma_tentativa_em_andamento_por_aluno_atividade",
  },
);
tentativaAtividadeSchema.index(
  { aluno: 1, atividade: 1, oficial: 1 },
  {
    unique: true,
    partialFilterExpression: { oficial: true },
    name: "uma_tentativa_oficial_por_aluno_atividade",
  },
);

tentativaAtividadeSchema.pre("validate", function validarTentativa() {
  if (this.status === STATUS_TENTATIVA.emAndamento && this.concluidaEm) {
    this.invalidate(
      "concluidaEm",
      "Uma tentativa em andamento não pode ter data de conclusão.",
    );
  }
  if (this.status === STATUS_TENTATIVA.concluida && !this.concluidaEm) {
    this.invalidate(
      "concluidaEm",
      "Uma tentativa concluída deve registrar a data de conclusão.",
    );
  }
  if (this.oficial && this.status !== STATUS_TENTATIVA.concluida) {
    this.invalidate(
      "oficial",
      "Somente uma tentativa concluída pode ser a oficial.",
    );
  }
  const questoes = this.respostas.map((resposta) => String(resposta.questaoId));
  if (new Set(questoes).size !== questoes.length) {
    this.invalidate(
      "respostas",
      "Não envie mais de uma resposta para a mesma questão.",
    );
  }
});

export default mongoose.model("TentativaAtividade", tentativaAtividadeSchema);
