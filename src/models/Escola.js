
import mongoose from 'mongoose';

function validarCNPJ(cnpj) {
  if (!cnpj) return true;

  const numeros = cnpj.replace(/\D/g, '');

  if (numeros.length !== 14 || /^(\d)\1{13}$/.test(numeros)) {
    return false;
  }

  const calcularDigito = (base, pesos) => {
    const soma = base
      .split('')
      .reduce((total, numero, indice) => {
        return total + Number(numero) * pesos[indice];
      }, 0);

    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const primeiro = calcularDigito(
    numeros.slice(0, 12),
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  );

  const segundo = calcularDigito(
    numeros.slice(0, 12) + primeiro,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  );

  return numeros === numeros.slice(0, 12) + primeiro + segundo;
}

const escolaSchema = new mongoose.Schema(
  {
    nome: {
      type: String,
      required: [true, 'O nome da escola é obrigatório.'],
      trim: true
    },
    cnpj: {
      type: String,
      default: null,
      set: valor => (typeof valor === 'string' && !valor.trim() ? null : valor),
      validate: {
        validator: validarCNPJ,
        message: 'O CNPJ informado é inválido.'
      }
    },
    codigoPermanente: {
      type: String,
      required: [true, 'O código permanente é obrigatório.'],
      unique: true,
      trim: true
    },
    municipio: {
      type: String,
      required: [true, 'O município é obrigatório.'],
      trim: true
    },
    endereco: {
      type: String,
      required: [true, 'O endereço é obrigatório.'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'O e-mail é obrigatório.'],
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Informe um e-mail válido.'
      ]
    },
    contato: {
      type: String,
      required: [true, 'O contato é obrigatório.'],
      trim: true
    }
  },
  {
    timestamps: true
  }
);

escolaSchema.index(
  { cnpj: 1 },
  {
    unique: true,
    partialFilterExpression: {
      cnpj: { $type: 'string' }
    }
  }
);

export default mongoose.model('Escola', escolaSchema);
