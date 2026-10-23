import mongoose from 'mongoose';

const avatarAlunoSchema = new mongoose.Schema({
  aluno: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Aluno',
    required: [true, 'O aluno é obrigatório.']
  },
  avatarId: {
    type: String,
    required: [true, 'O identificador do avatar é obrigatório.'],
    trim: true
  }
}, { timestamps: true });

avatarAlunoSchema.index({ aluno: 1, avatarId: 1 }, { unique: true, name: 'um_avatar_por_aluno' });

export default mongoose.model('AvatarAluno', avatarAlunoSchema);
