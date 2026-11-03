// Cadastra as histórias iniciais do Zooly no Banco de Histórias (ver docs/historias.md).
//
// Sem --apply, apenas simula (somente leitura). Para gravar, confirme o nome do banco:
//   npm run historias:semear -- --apply --banco=<MONGODB_DB_NAME>
// É idempotente: pode ser executado várias vezes sem duplicar nem sobrescrever histórias.
import "../src/config/carregarEnv.js";
import mongoose from "mongoose";
import { validarAmbienteBanco } from "../src/config/ambienteBanco.js";

function argumento(nome) {
  const prefixo = `--${nome}=`;
  return process.argv
    .find((item) => item.startsWith(prefixo))
    ?.slice(prefixo.length);
}

function erroSeguro(mensagem) {
  const erro = new Error(mensagem);
  erro.safeMessage = true;
  return erro;
}

async function executar() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw erroSeguro("MONGODB_URI não está configurada.");
  const dbName = process.env.MONGODB_DB_NAME?.trim() || "zooly";
  validarAmbienteBanco(dbName);

  const aplicar = process.argv.includes("--apply");
  if (aplicar && argumento("banco") !== dbName) {
    throw erroSeguro(
      `Para gravar, confirme o banco de destino com --banco=${dbName}. Nenhum dado foi alterado.`,
    );
  }

  mongoose.set("autoIndex", false);
  const { default: Historia } = await import("../src/models/Historia.js");
  const { semearHistoriasIniciais } =
    await import("../src/services/seedHistorias.js");
  await mongoose.connect(uri, { autoIndex: false, dbName });
  console.log(
    `Banco: ${dbName}. Modo: ${aplicar ? "GRAVAÇÃO" : "simulação (somente leitura)"}.`,
  );

  try {
    // O índice único de `chave` impede duplicatas mesmo com execuções simultâneas.
    if (aplicar) await Historia.createIndexes();
    const relatorio = await semearHistoriasIniciais({ aplicar });
    console.log(JSON.stringify(relatorio, null, 2));
    if (relatorio.divergentes.length)
      console.log(
        "Histórias divergentes foram mantidas como estão (o seed nunca sobrescreve).",
      );
    if (relatorio.conflitos.length)
      throw erroSeguro(
        "Há histórias com a mesma chave e outro _id. Revise antes de continuar.",
      );
    if (!aplicar)
      console.log(
        `Simulação concluída; nada foi gravado. Use --apply --banco=${dbName} para gravar.`,
      );
  } finally {
    await mongoose.disconnect();
  }
}

executar().catch((erro) => {
  const detalhe =
    erro.safeMessage || erro.code === "AMBIENTE_BANCO_INVALIDO"
      ? erro.message
      : `falha de banco/execução (${erro.code ?? erro.name ?? "erro"}).`;
  console.error(`Cadastro interrompido: ${detalhe}`);
  process.exitCode = 1;
});
