import Historia from '../models/Historia.js';

const camposPublicos = '_id titulo conteudo';

async function listarHistorias() {
  return Historia.find()
    .select(camposPublicos)
    .sort({ titulo: 1 });
}

async function obterHistoriaPorId(id) {
  return Historia.findById(id).select(camposPublicos);
}

export default { listarHistorias, obterHistoriaPorId };
