import 'dotenv/config';
import mongoose from 'mongoose';
import { analisarIndicesOrdem, planejarOrdemAtividades } from '../src/services/planejarOrdemAtividades.js';

function erroSeguro(mensagem) {
  const erro = new Error(mensagem);
  erro.safeMessage = true;
  return erro;
}

async function migrar() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI não está configurada.');

  mongoose.set('autoIndex', false);
  const { default: Atividade } = await import('../src/models/Atividade.js');
  await mongoose.connect(uri, { autoIndex: false });

  try {
    let indices = [];
    try {
      indices = await Atividade.collection.listIndexes().toArray();
    } catch (erroIndices) {
      if (erroIndices.code !== 26) throw erroIndices;
    }
    console.log(`Índices existentes em Atividade: ${indices.map(indice =>
      `${indice.name}(${JSON.stringify(indice.key)}, unique=${Boolean(indice.unique)})`
    ).join('; ') || 'nenhum'}.`);
    const analiseIndices = analisarIndicesOrdem(indices);
    console.log(`Índices turma/ordem existentes: ${JSON.stringify(analiseIndices.existentes) || 'nenhum'}.`);

    const documentos = await Atividade.collection.find({}, {
      projection: { _id: 1, turma: 1, ordem: 1, createdAt: 1 }
    }).toArray();
    let alteracoes;
    try {
      alteracoes = planejarOrdemAtividades(documentos);
    } catch (erroPlanejamento) {
      throw erroSeguro(erroPlanejamento.message);
    }
    console.log(`Atividades analisadas: ${documentos.length}; ordens a atribuir/ajustar: ${alteracoes.length}.`);
    for (const alteracao of alteracoes) {
      const anterior = alteracao.ordemAnterior === undefined ? 'ausente' : String(alteracao.ordemAnterior);
      console.log(`${String(alteracao._id)} turma=${String(alteracao.turma)} ordem=${anterior} -> ${alteracao.ordem}`);
    }

    if (!process.argv.includes('--apply')) {
      if (!analiseIndices.compativel) {
        console.log(`BLOQUEIO: índice(s) incompatível(is): ${analiseIndices.incompatíveis.join(', ')}. Nenhum dado foi alterado.`);
      }
      console.log('Prévia somente leitura. Use --apply durante uma janela sem gravações para aplicar a migração.');
      return;
    }

    if (!analiseIndices.compativel) {
      throw erroSeguro(`Índice(s) turma/ordem incompatível(is): ${analiseIndices.incompatíveis.join(', ')}. Nenhum documento foi alterado.`);
    }

    if (alteracoes.length) {
      const resultado = await Atividade.collection.bulkWrite(alteracoes.map(alteracao => ({
        updateOne: {
          filter: {
            _id: alteracao._id,
            ...(alteracao.ordemAnterior === undefined
              ? { ordem: { $exists: false } }
              : { ordem: alteracao.ordemAnterior })
          },
          update: { $set: { ordem: alteracao.ordem } }
        }
      })), { ordered: true });
      if (resultado.matchedCount !== alteracoes.length) {
        throw erroSeguro('Os dados mudaram após a prévia; interrompendo antes de criar o índice.');
      }
    }

    const documentosValidados = await Atividade.collection.find({}, {
      projection: { _id: 1, turma: 1, ordem: 1, createdAt: 1 }
    }).toArray();
    let pendenciasValidacao;
    try {
      pendenciasValidacao = planejarOrdemAtividades(documentosValidados);
    } catch (erroValidacao) {
      throw erroSeguro(`Validação posterior às atualizações falhou: ${erroValidacao.message}`);
    }
    if (pendenciasValidacao.length) {
      throw erroSeguro(`Validação posterior às atualizações encontrou ${pendenciasValidacao.length} ordem(ns) ainda inválida(s); índice não criado.`);
    }

    await Atividade.collection.createIndex({ turma: 1, ordem: 1 }, { unique: true });
    console.log('Migração aplicada e índice único turma/ordem confirmado.');
  } finally {
    await mongoose.disconnect();
  }
}

migrar().catch(erro => {
  const detalhe = erro.safeMessage ? erro.message : `falha de banco/execução (${erro.code ?? erro.name ?? 'erro'}).`;
  console.error(`Migração interrompida: ${detalhe}`);
  process.exitCode = 1;
});
