import Escola from '../models/Escola.js';
import Professor from '../models/Professor.js';
import Turma from '../models/Turma.js';

const camposPermitidos = [
  'nome',
  'cnpj',
  'codigoPermanente',
  'municipio',
  'endereco',
  'email',
  'contato'
];

async function cadastrar(dados) {
  return Escola.create(dados);
}

async function listar() {
  return Escola.find().sort({ nome: 1 });
}

async function obterPorId(id) {
  return Escola.findById(id);
}

async function atualizar(id, dados) {
  const escola = await Escola.findById(id);
  if (!escola) return null;

  for (const campo of camposPermitidos) {
    if (Object.hasOwn(dados, campo)) escola.set(campo, dados[campo]);
  }

  await escola.save();
  return escola;
}

async function excluir(id) {
  const escola = await Escola.findById(id);
  if (!escola) return { escola: null };

  const [temTurmas, temProfessores] = await Promise.all([
    Turma.exists({ escola: id }),
    Professor.exists({ escolas: id })
  ]);

  if (temTurmas || temProfessores) return { erro: 'escola-vinculada' };

  const excluida = await Escola.findByIdAndDelete(id);
  return { escola: excluida };
}

export default { cadastrar, listar, obterPorId, atualizar, excluir };
