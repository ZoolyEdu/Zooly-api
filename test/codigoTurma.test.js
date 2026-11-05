// Código curto da turma (TUR-XXXX): geração, validação de formato, unicidade com o
// índice único real (MongoDB em memória) e compatibilidade com códigos antigos.
// Nenhum banco real é usado.
import assert from "node:assert/strict";
import {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  test,
} from "node:test";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import Professor from "../src/models/Professor.js";
import Turma from "../src/models/Turma.js";
import authService from "../src/services/authService.js";
import turmaService, {
  ALFABETO_CODIGO_TURMA,
  FORMATO_CODIGO_TURMA,
  configurarGeradorCodigoTurma,
  gerarCodigoPermanente,
} from "../src/services/turmaService.js";
import { iniciarBancoMemoria } from "./apoio/bancoMemoria.js";

describe("geração do código curto", () => {
  test("segue o formato TUR- + 4 caracteres A–Z/0–9", () => {
    for (let i = 0; i < 2000; i += 1) {
      const codigo = gerarCodigoPermanente();
      assert.match(codigo, FORMATO_CODIGO_TURMA);
      assert.equal(codigo.length, 8);
    }
  });

  test("usa todo o alfabeto, inclusive as pontas, de forma determinística quando injetado", () => {
    assert.equal(
      gerarCodigoPermanente(() => 0),
      "TUR-AAAA",
    );
    assert.equal(
      gerarCodigoPermanente(() => 35),
      "TUR-9999",
    );
    const indices = [32, 4, 28, 33];
    assert.equal(
      gerarCodigoPermanente(() => indices.shift()),
      "TUR-6E27",
    );
    assert.equal(ALFABETO_CODIGO_TURMA.length, 36);
  });

  test("é aleatório o suficiente para não repetir em lotes pequenos", () => {
    const codigos = new Set(
      Array.from({ length: 1000 }, () => gerarCodigoPermanente()),
    );
    assert.ok(codigos.size >= 990, `apenas ${codigos.size} códigos distintos`);
  });

  test("o formato novo não aceita códigos antigos nem variações (é só para os novos)", () => {
    for (const codigo of [
      "TUR-6E2772697D59",
      "TURMA-A",
      "tur-6e27",
      "TUR-6E2",
      "TUR-6E27X",
      "TUR_6E27",
    ]) {
      assert.doesNotMatch(codigo, FORMATO_CODIGO_TURMA, codigo);
    }
  });
});

describe("cadastro de turmas com código curto (MongoDB em memória)", () => {
  let banco;
  let professor;
  const escolaId = new mongoose.Types.ObjectId();
  const jwtAnterior = process.env.JWT_SECRET;

  before(async () => {
    banco = await iniciarBancoMemoria("zooly_teste_codigo_turma");
    process.env.JWT_SECRET = "segredo-somente-teste-codigo-turma";
  });
  after(async () => {
    if (jwtAnterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = jwtAnterior;
    await banco?.encerrar();
  });
  beforeEach(async () => {
    await banco.limpar();
    professor = await Professor.create({
      nome: "Professora",
      email: "professora@exemplo.test",
      senha: "hash-fictício",
      escolas: [escolaId],
    });
  });
  afterEach(() => configurarGeradorCodigoTurma(null));

  // O service exige que a escola exista; o model Escola tem muitos campos obrigatórios,
  // então a consulta é simulada só neste ponto.
  async function cadastrar(nome) {
    const { default: Escola } = await import("../src/models/Escola.js");
    const original = Escola.findById;
    Escola.findById = async () => ({ _id: escolaId });
    try {
      return await turmaService.cadastrar({
        body: { nome, escolaId: String(escolaId), anoEscolar: 2026 },
        professorId: String(professor._id),
      });
    } finally {
      Escola.findById = original;
    }
  }

  test("cria turma com código curto válido", async () => {
    const { turma, erro } = await cadastrar("1º ano A");
    assert.equal(erro, undefined);
    assert.match(turma.codigoPermanente, FORMATO_CODIGO_TURMA);
    assert.equal(
      await Turma.countDocuments({ codigoPermanente: turma.codigoPermanente }),
      1,
    );
  });

  test("código já existente é evitado e o próximo livre é usado", async () => {
    const sequencia = ["TUR-AAAA", "TUR-AAAA", "TUR-BBBB"];
    configurarGeradorCodigoTurma(() => sequencia.shift());
    const primeira = await cadastrar("Turma 1");
    const segunda = await cadastrar("Turma 2");
    assert.equal(primeira.turma.codigoPermanente, "TUR-AAAA");
    assert.equal(segunda.turma.codigoPermanente, "TUR-BBBB");
  });

  test("cadastros simultâneos com o mesmo sorteio não duplicam código (índice único)", async () => {
    const sequencia = ["TUR-ZZZZ", "TUR-ZZZZ", "TUR-YYYY", "TUR-XXXX"];
    configurarGeradorCodigoTurma(() => sequencia.shift());
    const resultados = await Promise.all([
      cadastrar("Turma A"),
      cadastrar("Turma B"),
    ]);
    const codigos = resultados.map((r) => r.turma.codigoPermanente).sort();
    assert.equal(new Set(codigos).size, 2);
    assert.ok(codigos.includes("TUR-ZZZZ"));
    assert.equal(
      await Turma.countDocuments({ codigoPermanente: "TUR-ZZZZ" }),
      1,
    );
  });

  test("todos os sorteios ocupados: erro controlado, nenhuma turma duplicada", async () => {
    configurarGeradorCodigoTurma(() => "TUR-AAAA");
    await cadastrar("Ocupa o código");
    const { erro } = await cadastrar("Sem código livre");
    assert.equal(erro, "codigo-nao-gerado");
    assert.equal(await Turma.countDocuments(), 1);
  });

  test("códigos antigos continuam intactos e funcionando ao lado dos novos", async () => {
    const senhaAcessoHash = await bcrypt.hash("1234", 4);
    const antigas = await Turma.create([
      {
        nome: "Antiga hex",
        codigoPermanente: "TUR-6E2772697D59",
        anoEscolar: 2026,
        escola: escolaId,
        professorResponsavel: professor._id,
        senhaAcessoHash,
      },
      {
        nome: "Antiga livre",
        codigoPermanente: "TURMA-ANTIGA",
        anoEscolar: 2026,
        escola: escolaId,
        professorResponsavel: professor._id,
        senhaAcessoHash,
      },
    ]);
    const nova = await cadastrar("Nova");
    assert.match(nova.turma.codigoPermanente, FORMATO_CODIGO_TURMA);

    // Nada nos documentos antigos foi alterado.
    for (const antiga of antigas) {
      const atual = await Turma.findById(antiga._id).lean();
      assert.equal(atual.codigoPermanente, antiga.codigoPermanente);
    }

    // Entrada do aluno: código antigo e código novo, digitados em minúsculas e com espaços.
    await Turma.updateOne({ _id: nova.turma._id }, { senhaAcessoHash });
    const comAntigo = await authService.entrarTurma(
      "0000000000001",
      " tur-6e2772697d59 ",
      "1234",
    );
    assert.equal(comAntigo.erro, undefined);
    assert.ok(comAntigo.token);
    const comNovo = await authService.entrarTurma(
      "0000000000002",
      ` ${nova.turma.codigoPermanente.toLowerCase()} `,
      "1234",
    );
    assert.equal(comNovo.erro, undefined);
    assert.ok(comNovo.token);
  });
});
