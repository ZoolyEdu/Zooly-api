import mongoose from 'mongoose';

const professorSchema = new mongoose.Schema(
  {
    nome: {
      type: String,
      required: [true, 'O nome é obrigatório.'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'O e-mail é obrigatório.'],
      unique: true,
      lowercase: true,
      trim: true
    },
    senha: {
      type: String,
      required: [true, 'A senha é obrigatória.'],
      select: false
    },
    escolas: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Escola'
      }
    ]
  },
  {
    timestamps: true
  }
);

export default mongoose.model('Professor', professorSchema);