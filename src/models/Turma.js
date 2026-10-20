import mongoose from "mongoose";

const turmaSchema = new mongoose.Schema(
  {
    nome: {
      type: String,
      required: [true, "O nome da turma é obrigatório."],
      trim: true,
    },
    codigoPermanente: {
      type: String,
      required: [true, "O código permanente da turma é obrigatório."],
      unique: true,
      trim: true,
      uppercase: true,
    },
    anoEscolar: {
      type: Number,
      required: [true, "O ano escolar é obrigatório."],
      min: [2000, "O ano escolar informado é inválido."],
      max: [2100, "O ano escolar informado é inválido."],
    },
    escola: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Escola",
      required: [true, "A escola é obrigatória."],
    },
    professorResponsavel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Professor",
      required: [true, "O professor responsável é obrigatório."],
    },
    arquivada: {
      type: Boolean,
      default: false,
    },
    senhaAcessoHash: {
      type: String,
      select: false,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("Turma", turmaSchema);
