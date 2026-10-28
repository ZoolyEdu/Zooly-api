import mongoose from 'mongoose';

const { Schema } = mongoose;

const alternativaSchema = new Schema(
  {
    texto: {
      type: String,
      required: [true, 'O texto da alternativa é obrigatório.'],
      trim: true
    }
  },
  { _id: true }
);

const questaoSchema = new Schema(
  {
    enunciado: {
      type: String,
      required: [true, 'O enunciado da questão é obrigatório.'],
      trim: true
    },
    alternativas: {
      type: [alternativaSchema],
      default: [],
      validate: {
        validator: alternativas => Array.isArray(alternativas) && alternativas.length >= 2,
        message: 'A questão deve ter pelo menos duas alternativas.'
      }
    },
    respostasCorretas: {
      type: [{ type: Schema.Types.ObjectId }],
      default: []
    }
  },
  { _id: true }
);

questaoSchema.pre('validate', function validarRespostasCorretas() {
  const alternativas = Array.isArray(this.alternativas) ? this.alternativas : [];
  const respostasCorretas = Array.isArray(this.respostasCorretas) ? this.respostasCorretas : [];
  const idsAlternativas = new Set(alternativas.map(alternativa => String(alternativa._id)));
  const idsRespostas = respostasCorretas.map(String);

  if (idsRespostas.length === 0) {
    this.invalidate('respostasCorretas', 'A questão deve ter pelo menos uma resposta correta.');
    return;
  }

  if (new Set(idsRespostas).size !== idsRespostas.length) {
    this.invalidate('respostasCorretas', 'As respostas corretas não podem se repetir.');
  }

  if (idsRespostas.some(id => !idsAlternativas.has(id))) {
    this.invalidate(
      'respostasCorretas',
      'Todas as respostas corretas devem corresponder a alternativas da questão.'
    );
  }
});

const origemHistoriaSchema = new Schema(
  {
    tipo: {
      type: String,
      required: [true, 'Informe a origem da história.'],
      enum: {
        values: ['oficial', 'propria'],
        message: 'A origem da história deve ser oficial ou própria.'
      }
    },
    historiaId: {
      type: Schema.Types.ObjectId,
      ref: 'Historia'
    },
    texto: {
      type: String,
      trim: true
    }
  },
  { _id: false }
);

const atividadeSchema = new Schema(
  {
    turma: {
      type: Schema.Types.ObjectId,
      ref: 'Turma',
      required: [true, 'A turma da atividade é obrigatória.']
    },
    professorCriador: {
      type: Schema.Types.ObjectId,
      ref: 'Professor',
      required: [true, 'O professor criador da atividade é obrigatório.']
    },
    titulo: {
      type: String,
      required: [true, 'O título da atividade é obrigatório.'],
      trim: true
    },
    ordem: {
      type: Number,
      default: 1,
      min: [1, 'A ordem mínima da atividade deve ser 1.']
    },
    recompensaMoedas: {
      type: Number,
      min: [1, 'A recompensa deve ser um inteiro positivo.'],
      validate: {
        validator: Number.isSafeInteger,
        message: 'A recompensa deve ser um inteiro positivo.'
      }
    },
    historia: {
      type: origemHistoriaSchema,
      required: [true, 'A história da atividade é obrigatória.']
    },
    questoes: {
      type: [questaoSchema],
      default: []
    },
    status: {
      type: String,
      enum: {
        values: ['rascunho', 'publicada'],
        message: 'O status deve ser rascunho ou publicada.'
      },
      default: 'rascunho'
    },
    publicadoEm: {
      type: Date,
      default: null
    },
    prazo: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

atividadeSchema.index({ turma: 1, ordem: 1 }, { unique: true });

atividadeSchema.pre('validate', function validarOrigemHistoria() {
  if (!this.historia) return;

  const { tipo, historiaId, texto } = this.historia;
  const temReferenciaOficial = historiaId !== undefined && historiaId !== null;
  const temTexto = texto !== undefined && texto !== null;

  if (tipo === 'oficial') {
    if (!temReferenciaOficial || temTexto) {
      this.invalidate(
        'historia',
        'Uma história oficial exige somente historiaId, sem texto próprio.'
      );
    }
    return;
  }

  if (tipo === 'propria' && (temReferenciaOficial || !temTexto || !texto.trim())) {
    this.invalidate(
      'historia',
      'Uma história própria exige texto não vazio e não aceita historiaId.'
    );
  }
});

atividadeSchema.pre('validate', function validarDataPublicacao() {
  if (this.status === 'publicada' && !this.publicadoEm) {
    this.invalidate('publicadoEm', 'Atividades publicadas devem registrar a data de publicação.');
  }
  if (this.status === 'rascunho' && this.publicadoEm) {
    this.invalidate('publicadoEm', 'Rascunhos não podem ter data de publicação.');
  }
});

atividadeSchema.pre('validate', function validarRecompensaNula() {
  if (this.recompensaMoedas === null) {
    this.invalidate('recompensaMoedas', 'A recompensa deve ser um inteiro positivo.');
  }
});

export default mongoose.model('Atividade', atividadeSchema);
