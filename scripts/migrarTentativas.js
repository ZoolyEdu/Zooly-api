// Cria o histórico de tentativas a partir dos progressos existentes.
//
// Sem --apply, apenas simula e valida (somente leitura). Para gravar, é preciso confirmar o
// nome do banco:   node scripts/migrarTentativas.js --apply --banco=<MONGODB_DB_NAME>
// Para desfazer:    node scripts/migrarTentativas.js --reverter [--apply --banco=<nome>]
//
// Faça um backup (mongodump) antes de aplicar. Ver README, seção "Migração do histórico".
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
  const reverter = process.argv.includes("--reverter");
  if (aplicar && argumento("banco") !== dbName) {
    throw erroSeguro(
      `Para gravar, confirme o banco de destino com --banco=${dbName}. Nenhum dado foi alterado.`,
    );
  }

  // Sem criação automática de índices: só a etapa de gravação cria os da nova coleção.
  mongoose.set("autoIndex", false);
  const { default: TentativaAtividade } =
    await import("../src/models/TentativaAtividade.js");
  const { migrarTentativas, reverterMigracaoTentativas, validarTentativas } =
    await import("../src/services/migracaoTentativas.js");
  await mongoose.connect(uri, { autoIndex: false, dbName });
  console.log(
    `Banco: ${dbName}. Modo: ${aplicar ? "GRAVAÇÃO" : "simulação (somente leitura)"}.`,
  );

  try {
    if (reverter) {
      const relatorio = await reverterMigracaoTentativas({ aplicar });
      console.log(JSON.stringify(relatorio, null, 2));
      if (!aplicar)
        console.log(
          `Simulação. Use --reverter --apply --banco=${dbName} para remover.`,
        );
      return;
    }

    if (aplicar) await TentativaAtividade.createIndexes();
    const relatorio = await migrarTentativas({ aplicar });
    console.log(JSON.stringify(relatorio, null, 2));

    if (!aplicar) {
      console.log(
        `Simulação concluída; nada foi gravado. Use --apply --banco=${dbName} para aplicar.`,
      );
      return;
    }

    const inconsistencias = await validarTentativas();
    if (inconsistencias.length) {
      console.log(JSON.stringify(inconsistencias.slice(0, 50), null, 2));
      throw erroSeguro(
        `Validação encontrou ${inconsistencias.length} inconsistência(s). ` +
          "Os progressos originais não foram alterados; a migração pode ser revertida com --reverter.",
      );
    }
    console.log(
      "Migração aplicada e validada: cada progresso tem histórico coerente.",
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
  console.error(`Migração interrompida: ${detalhe}`);
  process.exitCode = 1;
});
