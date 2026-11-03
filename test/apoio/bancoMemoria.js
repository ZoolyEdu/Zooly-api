// MongoDB em memória (replica set de 1 nó, necessário para transações) para testes de
// integração. Nenhum banco real é usado: o processo mongod some ao final dos testes.
// Na primeira execução, o mongodb-memory-server baixa o binário do MongoDB (fica em cache).
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

export async function iniciarBancoMemoria(dbName) {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  await mongoose.connect(replSet.getUri(), { dbName });
  // Garante os índices únicos antes do primeiro teste (eles sustentam as regras).
  await Promise.all(
    mongoose.modelNames().map((nome) => mongoose.model(nome).init()),
  );
  return {
    async limpar() {
      const colecoes = await mongoose.connection.db.collections();
      await Promise.all(colecoes.map((colecao) => colecao.deleteMany({})));
    },
    async encerrar() {
      await mongoose.disconnect();
      await replSet.stop({ doCleanup: true, force: false });
    },
  };
}
