
import mongoose from 'mongoose';

const alunoSchema = new mongoose.Schema(
  {
    ra: {
      type: String,
      required: [true, 'O RA é obrigatório.'],
      unique: true,
      trim: true
    },
    nomeCompleto: {
      type: String,
      trim: true,
      default: null
    },
    sexo: {
      type: String,
      enum: ['feminino', 'masculino', 'nao_informado'],
      default: 'nao_informado'
    },
    turma: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Turma',
      required: [true, 'A turma é obrigatória.']
    },
    cadastroInicialConcluido: {
      type: Boolean,
      default: false
    },
    // Escrita de serialização para operações de moedas; não armazena saldo.
    versaoMovimentacoesMoeda: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  { timestamps: true }
);

export default mongoose.model('Aluno', alunoSchema);
