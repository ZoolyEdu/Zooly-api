// Prepara o banco zooly_demo. Sem --executar, apenas valida o destino e mostra as contagens.
// Uso: npm run demo:verificar | npm run demo:semear | npm run demo:limpar
import "./demo/semEscritaAutomatica.js";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { BANCO_DEMO } from "../src/config/ambienteBanco.js";
import { connectDatabase } from "../src/config/database.js";
import Aluno from "../src/models/Aluno.js";
import Atividade from "../src/models/Atividade.js";
import AvatarAluno from "../src/models/AvatarAluno.js";
import Escola from "../src/models/Escola.js";
import Historia from "../src/models/Historia.js";
import MovimentacaoMoeda from "../src/models/MovimentacaoMoeda.js";
import Professor from "../src/models/Professor.js";
import ProgressoAtividade from "../src/models/ProgressoAtividade.js";
import Turma from "../src/models/Turma.js";
import { inserirDadosDemo, PLANO } from "./demo/dados.js";

const MODELOS = [
  Escola,
  Professor,
  Turma,
  Aluno,
  Historia,
  Atividade,
  ProgressoAtividade,
  MovimentacaoMoeda,
  AvatarAluno,
];
const BANCO_REAL = "zooly";
const executar = process.argv.includes("--executar");
const limpar = process.argv.includes("--limpar");

function abortar(mensagem) {
  throw new Error(`ABORTADO: ${mensagem}`);
}

function usuarioDaUri(uri) {
  try {
    return new URL(uri).username;
  } catch {
    return abortar("MONGODB_URI não é uma URI válida.");
  }
}

function validarConfiguracao() {
  if (process.env.ZOOLY_AMBIENTE !== "demo")
    abortar(
      'ZOOLY_AMBIENTE precisa ser "demo". Use os comandos npm run demo:*.',
    );
  if (process.env.MONGODB_DB_NAME !== BANCO_DEMO)
    abortar(`MONGODB_DB_NAME precisa ser ${BANCO_DEMO}.`);
  for (const nome of ["MONGODB_URI", "JWT_SECRET", "ADMIN_SENHA_HASH"]) {
    if (!process.env[nome]?.trim())
      abortar(`${nome} não está preenchida no .env.demo.`);
  }
  console.log("OK  ambiente demo e banco de destino configurados");

  if (existsSync(".env")) {
    const real = dotenv.parse(readFileSync(".env"));
    if (real.JWT_SECRET === process.env.JWT_SECRET)
      abortar("JWT_SECRET é igual ao do ambiente real.");
    if (real.ADMIN_SENHA_HASH === process.env.ADMIN_SENHA_HASH)
      abortar("ADMIN_SENHA_HASH é igual ao do ambiente real.");
    if (
      real.MONGODB_URI &&
      usuarioDaUri(real.MONGODB_URI) === usuarioDaUri(process.env.MONGODB_URI)
    ) {
      abortar("O usuário do Atlas é o mesmo do ambiente real.");
    }
  }
  console.log("OK  segredos e usuário do Atlas diferentes dos reais");
}

async function validarIsolamento() {
  if (mongoose.connection.name !== BANCO_DEMO)
    abortar(`Conectado em banco inesperado: ${mongoose.connection.name}.`);
  console.log(`OK  conectado em ${mongoose.connection.name}`);

  // A credencial precisa ser recusada no banco real. Esta tentativa é só de leitura.
  try {
    await mongoose.connection
      .getClient()
      .db(BANCO_REAL)
      .collection("professors")
      .findOne({}, { projection: { _id: 1 } });
  } catch (erro) {
    // O MongoDB usa o código 13; o Atlas responde com 8000 (AtlasError) e "not allowed".
    const acessoNegado =
      erro.code === 13 ||
      erro.codeName === "Unauthorized" ||
      (erro.code === 8000 &&
        /not allowed|not authorized/i.test(erro.message ?? ""));
    if (acessoNegado) {
      console.log(`OK  esta credencial não tem acesso ao banco ${BANCO_REAL}`);
      return;
    }
    throw erro;
  }
  abortar(
    `Esta credencial consegue ler o banco ${BANCO_REAL}. Use um usuário com readWrite somente em ${BANCO_DEMO}.`,
  );
}

async function contagens() {
  const linhas = await Promise.all(
    MODELOS.map(async (modelo) => [
      modelo.collection.collectionName,
      await modelo.countDocuments(),
    ]),
  );
  console.log(`\nContagens em ${mongoose.connection.name}:`);
  for (const [nome, total] of linhas) console.log(`  ${nome}: ${total}`);
  return linhas.reduce((soma, [, total]) => soma + total, 0);
}

async function main() {
  validarConfiguracao();
  await connectDatabase();
  await validarIsolamento();
  const total = await contagens();

  if (limpar) {
    if (!executar) return console.log("\nNada removido: faltou --executar.");
    for (const modelo of MODELOS) await modelo.deleteMany({});
    console.log("\nDados removidos.");
    await contagens();
    return undefined;
  }

  console.log("\nPlano de inserção:");
  for (const [nome, quantidade, detalhe] of PLANO)
    console.log(`  ${nome}: ${quantidade} (${detalhe})`);

  if (total > 0)
    abortar(
      `${BANCO_DEMO} já tem ${total} registro(s). Use npm run demo:limpar antes de semear de novo.`,
    );
  if (!executar)
    return console.log(
      "\nNada foi inserido. Para inserir: npm run demo:semear",
    );

  await Promise.all(MODELOS.map((modelo) => modelo.createIndexes()));
  const senhaProfessora = randomBytes(12).toString("base64url");
  const senhaTurma = randomBytes(6).toString("base64url");
  await inserirDadosDemo({ senhaProfessora, senhaTurma });

  console.log("\nDados inseridos.");
  await contagens();
  // Exibidas uma única vez; não são gravadas em arquivo.
  console.log("\nGuarde estes acessos, pois não serão mostrados de novo:");
  console.log("  Professora: professora@demo.zooly.example");
  console.log(`  Senha da professora: ${senhaProfessora}`);
  console.log(`  Senha de acesso das turmas (alunos): ${senhaTurma}`);
  return undefined;
}

main()
  .catch((erro) => {
    // Evita imprimir detalhes de conexão.
    console.error(
      erro.message?.startsWith("ABORTADO")
        ? erro.message
        : `Falha: ${erro.code ?? erro.message}`,
    );
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
