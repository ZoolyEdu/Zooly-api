import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import dns, { Resolver } from 'node:dns';
import { connectDatabase } from '../src/config/database.js';

let uriOriginal;
let connectOriginal;
let resolverOriginal;
let servidoresDnsOriginais;
let logOriginal;

beforeEach(() => {
  uriOriginal = process.env.MONGODB_URI;
  connectOriginal = mongoose.connect;
  resolverOriginal = Resolver.prototype.resolveSrv;
  servidoresDnsOriginais = dns.getServers();
  logOriginal = console.log;
  delete process.env.MONGODB_URI;
});

afterEach(() => {
  if (uriOriginal === undefined) delete process.env.MONGODB_URI;
  else process.env.MONGODB_URI = uriOriginal;

  mongoose.connect = connectOriginal;
  Resolver.prototype.resolveSrv = resolverOriginal;
  dns.setServers(servidoresDnsOriginais);
  console.log = logOriginal;
});

test('URI ausente falha claramente sem tentar conectar', async () => {
  let tentativas = 0;
  mongoose.connect = async () => { tentativas += 1; };

  await assert.rejects(connectDatabase(), erro => {
    assert.equal(erro.code, 'MONGODB_URI_MISSING');
    assert.equal(erro.message, 'MONGODB_URI não está configurada.');
    return true;
  });
  assert.equal(tentativas, 0);
});

test('URI padrão é aparada e passada uma vez à conexão Mongoose', async () => {
  const uri = 'mongodb://127.0.0.1:27017/zooly_test';
  process.env.MONGODB_URI = `  ${uri}  `;
  const chamadas = [];
  const logs = [];
  mongoose.connect = async valor => { chamadas.push(valor); };
  console.log = mensagem => logs.push(mensagem);

  await connectDatabase();

  assert.deepEqual(chamadas, [uri]);
  assert.deepEqual(logs, ['MongoDB Atlas conectado com sucesso!']);
});

test('erro do driver é sanitizado e mantém apenas um código seguro', async () => {
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/zooly_test';
  mongoose.connect = async () => {
    const erro = new Error('mensagem interna que não deve ser repassada');
    erro.code = 'ECONNREFUSED';
    throw erro;
  };

  await assert.rejects(connectDatabase(), erro => {
    assert.equal(erro.code, 'ECONNREFUSED');
    assert.equal(erro.message, 'Não foi possível conectar ao MongoDB Atlas.');
    assert.equal(erro.message.includes('mensagem interna'), false);
    return true;
  });
});

test('falha no DNS do sistema usa fallback SRV e conecta sem consulta de rede no teste', async () => {
  process.env.MONGODB_URI = 'mongodb+srv://cluster.invalid/zooly_test';
  let chamadasDns = 0;
  let uriRecebida;
  Resolver.prototype.resolveSrv = function resolveSrvSimulado(_consulta, callback) {
    chamadasDns += 1;
    if (chamadasDns === 1) {
      const erro = new Error('falha simulada do DNS do sistema');
      erro.code = 'ECONNREFUSED';
      callback(erro);
      return;
    }
    callback(null, [{ name: 'mongo.test.invalid', port: 27017, priority: 0, weight: 0 }]);
  };
  mongoose.connect = async uri => { uriRecebida = uri; };
  console.log = () => {};

  await connectDatabase();

  assert.equal(chamadasDns, 2);
  assert.equal(uriRecebida, process.env.MONGODB_URI);
  assert.deepEqual(dns.getServers(), ['1.1.1.1', '8.8.8.8']);
});
