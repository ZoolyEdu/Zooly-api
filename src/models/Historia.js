import mongoose from 'mongoose';

const historiaSchema = new mongoose.Schema(
  {
    titulo: {
      type: String,
      required: [true, 'O título da história é obrigatório.'],
      trim: true
    },
    conteudo: {
      type: String,
      required: [true, 'O conteúdo da história é obrigatório.'],
      trim: true
    }
  },
  { timestamps: true }
);

export default mongoose.model('Historia', historiaSchema);
