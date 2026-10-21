import mongoose from 'mongoose';

const { Schema } = mongoose;

const respostaSchema = new Schema({
  questaoId: {
    type: Schema.Types.ObjectId,
    required: [true, 'A questão respondida é obrigatória.']
  },
  alternativasSelecionadas: {
    type: [{ type: Schema.Types.ObjectId }],
    required: true,
    validate: [
      alternativas => Array.isArray(alternativas) && alternativas.length > 0,
      'Selecione ao menos uma alternativa para cada questão respondida.'
    ]
  }
}, { _id: false });

const progressoAtividadeSchema = new Schema({
  aluno: {
    type: Schema.Types.ObjectId,
    ref: 'Aluno',
    required: [true, 'O aluno é obrigatório.']
  },
  atividade: {
    type: Schema.Types.ObjectId,
    ref: 'Atividade',
    required: [true, 'A atividade é obrigatória.']
  },
  status: {
    type: String,
    enum: {
      values: ['iniciada', 'concluida'],
      message: 'O status deve ser iniciada ou concluida.'
    },
    default: 'iniciada'
  },
  iniciadaEm: {
    type: Date,
    required: true,
    default: Date.now
  },
  concluidaEm: {
    type: Date,
    default: null
  },
  respostas: {
    type: [respostaSchema],
    default: []
  }
}, { timestamps: true });

progressoAtividadeSchema.index({ aluno: 1, atividade: 1 }, { unique: true });

progressoAtividadeSchema.pre('validate', function validarRespostasSemDuplicacao() {
  const questoes = this.respostas.map(resposta => String(resposta.questaoId));
  if (new Set(questoes).size !== questoes.length) {
    this.invalidate('respostas', 'Não envie mais de uma resposta para a mesma questão.');
  }

  for (const [indice, resposta] of this.respostas.entries()) {
    const alternativas = resposta.alternativasSelecionadas.map(String);
    if (new Set(alternativas).size !== alternativas.length) {
      this.invalidate(`respostas.${indice}.alternativasSelecionadas`, 'Alternativas selecionadas não podem se repetir.');
    }
  }

  if (this.status === 'iniciada' && this.concluidaEm) {
    this.invalidate('concluidaEm', 'Uma atividade iniciada não pode ter data de conclusão.');
  }
  if (this.status === 'concluida' && !this.concluidaEm) {
    this.invalidate('concluidaEm', 'Uma atividade concluída deve registrar a data de conclusão.');
  }
});

export default mongoose.model('ProgressoAtividade', progressoAtividadeSchema);
