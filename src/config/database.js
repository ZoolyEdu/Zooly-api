import mongoose from 'mongoose';
import dns, { Resolver } from 'node:dns';

const resolvedoresAlternativos = ['1.1.1.1', '8.8.8.8'];

function codigoSeguro(...codigos) {
  return codigos.find(codigo => typeof codigo === 'string' && /^[A-Z0-9_]+$/.test(codigo))
    ?? 'MONGODB_CONNECTION_FAILED';
}

function resolverSrv(resolver, consulta) {
  return new Promise((resolve, reject) => {
    resolver.resolveSrv(consulta, (erro, registros) => {
      if (erro) reject(erro);
      else resolve(registros);
    });
  });
}

async function prepararDnsAtlas(uri) {
  if (!uri.startsWith('mongodb+srv://')) return;

  let host;
  try {
    host = new URL(uri).hostname;
  } catch {
    throw new Error('MONGODB_URI não contém uma URI MongoDB válida.');
  }

  const consulta = `_mongodb._tcp.${host}`;
  try {
    await resolverSrv(new Resolver({ timeout: 2500, tries: 1 }), consulta);
    return;
  } catch {
    const alternativo = new Resolver({ timeout: 2500, tries: 1 });
    alternativo.setServers(resolvedoresAlternativos);
    try {
      await resolverSrv(alternativo, consulta);
      // Só altera o resolvedor do processo quando o DNS do sistema falha.
      dns.setServers(resolvedoresAlternativos);
    } catch (erro) {
      const falhaDns = new Error('Não foi possível resolver o endereço SRV do MongoDB Atlas.');
      falhaDns.code = codigoSeguro(erro.code, 'MONGODB_DNS_FAILED');
      throw falhaDns;
    }
  }
}

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    const erro = new Error('MONGODB_URI não está configurada.');
    erro.code = 'MONGODB_URI_MISSING';
    throw erro;
  }

  const dbName = process.env.MONGODB_DB_NAME?.trim() || 'zooly';

  try {
    await prepararDnsAtlas(uri);
    await mongoose.connect(uri, { dbName });
  } catch (error) {
    if (error.code && error.message === 'Não foi possível resolver o endereço SRV do MongoDB Atlas.') {
      throw error;
    }

    const codigo = codigoSeguro(error?.cause?.code, error?.code);
    const falhaConexao = new Error('Não foi possível conectar ao MongoDB Atlas.');
    falhaConexao.code = codigo;
    throw falhaConexao;
  }

  console.log('MongoDB Atlas conectado com sucesso!');
}
