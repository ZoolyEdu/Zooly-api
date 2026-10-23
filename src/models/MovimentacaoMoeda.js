import mongoose from 'mongoose';

const { Schema } = mongoose;

const movimentacaoMoedaSchema = new Schema({
  aluno: {
    type: Schema.Types.ObjectId,
    ref: 'Aluno',
    required: [true, 'O aluno da movimentação é obrigatório.']
  },
  tipo: {
    type: String,
    enum: {
      values: ['ganho', 'gasto'],
      message: 'O tipo deve ser ganho ou gasto.'
    },
    required: [true, 'O tipo da movimentação é obrigatório.']
  },
  quantidade: {
    type: Number,
    required: [true, 'A quantidade é obrigatória.'],
    min: [1, 'A quantidade deve ser positiva.'],
    validate: {
      validator: Number.isSafeInteger,
      message: 'A quantidade deve ser um número inteiro positivo.'
    }
  },
  motivo: {
    type: String,
    required: [true, 'O motivo da movimentação é obrigatório.'],
    trim: true,
    minlength: [3, 'O motivo deve ter ao menos 3 caracteres.'],
    maxlength: [120, 'O motivo deve ter no máximo 120 caracteres.']
  },
  atividade: {
    type: Schema.Types.ObjectId,
    ref: 'Atividade',
    default: null
  }
}, { timestamps: true });

movimentacaoMoedaSchema.index({ aluno: 1, createdAt: -1 });
movimentacaoMoedaSchema.index(
  { aluno: 1, atividade: 1, tipo: 1 },
  {
    unique: true,
    partialFilterExpression: { tipo: 'ganho', atividade: { $type: 'objectId' } },
    name: 'uma_recompensa_por_atividade_aluno'
  }
);

export default mongoose.model('MovimentacaoMoeda', movimentacaoMoedaSchema);
