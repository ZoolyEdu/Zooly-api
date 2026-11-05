import mongoose from "mongoose";
import { FORMATO_RA } from "../utils/ra.js";

// Exige 13 dígitos só quando o RA está sendo criado ou trocado. Alunos antigos, com RA
// em outro formato, continuam podendo ser salvos (nome, cadastro, avatar...) sem
// que o RA seja alterado ou bloqueie a operação.
function raNovoValido(valor) {
  // Em validações de update (runValidators), o RA informado é sempre um valor novo.
  if (!this || this instanceof mongoose.Query) return FORMATO_RA.test(valor);
  if (!this.isNew && !this.isModified("ra")) return true;
  return FORMATO_RA.test(valor);
}

const alunoSchema = new mongoose.Schema(
  {
    ra: {
      type: String,
      required: [true, "O RA é obrigatório."],
      unique: true,
      trim: true,
      set(valor) {
        if (typeof valor !== "string") {
          throw new mongoose.Error.CastError("String", valor, "ra");
        }
        return valor;
      },
      validate: {
        validator: raNovoValido,
        message: "O RA deve conter exatamente 13 dígitos.",
      },
    },
    nomeCompleto: {
      type: String,
      trim: true,
      default: null,
    },
    sexo: {
      type: String,
      enum: ["feminino", "masculino", "nao_informado"],
      default: "nao_informado",
    },
    turma: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Turma",
      required: [true, "A turma é obrigatória."],
    },
    cadastroInicialConcluido: {
      type: Boolean,
      default: false,
    },
    avatarSelecionado: {
      type: String,
      default: null,
      trim: true,
    },
    versaoMovimentacoesMoeda: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

export default mongoose.model("Aluno", alunoSchema);
