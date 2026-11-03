import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import Aluno from "../../src/models/Aluno.js";
import Atividade from "../../src/models/Atividade.js";
import Escola from "../../src/models/Escola.js";
import Historia from "../../src/models/Historia.js";
import Professor from "../../src/models/Professor.js";
import Turma from "../../src/models/Turma.js";
import progressoService from "../../src/services/progressoService.js";

export const PLANO = [
  ["Escola", 1, "[DEMO] Escola Zooly (código DEMO-ESCOLA)"],
  ["Professora", 1, "Professora Zooly [DEMO] (professora@demo.zooly.example)"],
  ["Turmas", 2, "[DEMO] 1º Ano A e [DEMO] 2º Ano B"],
  ["Alunos", 6, "RAs DEMO-0001 a DEMO-0006: 4 completos e 2 pendentes"],
  ["Histórias", 2, "somente em zooly_demo"],
  ["Atividades", 3, "2 publicadas e 1 rascunho"],
  [
    "Progresso e moedas",
    4,
    "gerados pelas regras reais da API, somente para alunos demo",
  ],
];

function questao(enunciado, certa, errada, pontos = 5) {
  const idCerta = new mongoose.Types.ObjectId();
  const idErrada = new mongoose.Types.ObjectId();
  return {
    _id: new mongoose.Types.ObjectId(),
    tipo: "multipla_escolha",
    enunciado,
    pontos,
    alternativas: [
      { _id: idCerta, texto: certa },
      { _id: idErrada, texto: errada },
    ],
    respostasCorretas: [idCerta],
  };
}
async function responder(aluno, atividade, acertos, { concluir = true } = {}) {
  const alunoId = String(aluno._id);
  const atividadeId = String(atividade._id);
  const etapas = [
    await progressoService.iniciar({ atividadeId, alunoId }),
    await progressoService.salvarRespostas({
      atividadeId,
      alunoId,
      body: {
        respostas: atividade.questoes.map((item, indice) => ({
          questaoId: String(item._id),
          alternativasSelecionadas: [
            String(item.alternativas[indice < acertos ? 0 : 1]._id),
          ],
        })),
      },
    }),
  ];
  if (concluir)
    etapas.push(await progressoService.concluir({ atividadeId, alunoId }));

  const falha = etapas.find((etapa) => etapa.erro);
  if (falha)
    throw new Error(`Falha ao gerar progresso de demonstração: ${falha.erro}`);
}

export async function inserirDadosDemo({ senhaProfessora, senhaTurma }) {
  const escola = await Escola.create({
    nome: "[DEMO] Escola Zooly",
    codigoPermanente: "DEMO-ESCOLA",
    municipio: "[DEMO] Cidade Fictícia",
    endereco: "[DEMO] Rua das Capivaras, 100",
    email: "escola@demo.zooly.example",
    contato: "(00) 0000-0000",
  });

  const professora = await Professor.create({
    nome: "Professora Zooly [DEMO]",
    email: "professora@demo.zooly.example",
    senha: await bcrypt.hash(senhaProfessora, 12),
    escolas: [escola._id],
  });

  const senhaAcessoHash = await bcrypt.hash(senhaTurma, 10);
  const dadosTurma = {
    anoEscolar: new Date().getFullYear(),
    escola: escola._id,
    professorResponsavel: professora._id,
    senhaAcessoHash,
  };
  const turmaA = await Turma.create({
    ...dadosTurma,
    nome: "[DEMO] 1º Ano A",
    codigoPermanente: "DEMO-1A",
    periodo: "Manhã",
    mascote: "sarue",
  });
  const turmaB = await Turma.create({
    ...dadosTurma,
    nome: "[DEMO] 2º Ano B",
    codigoPermanente: "DEMO-2B",
    periodo: "Tarde",
    mascote: "papagaio",
  });

  const completo = (ra, nomeCompleto, sexo, turma) => ({
    ra,
    nomeCompleto: `${nomeCompleto} [DEMO]`,
    sexo,
    turma: turma._id,
    cadastroInicialConcluido: true,
  });
  const [ana, bruno, carla, , davi] = await Aluno.create([
    completo("DEMO-0001", "Ana Exemplo", "feminino", turmaA),
    completo("DEMO-0002", "Bruno Exemplo", "masculino", turmaA),
    completo("DEMO-0003", "Carla Exemplo", "feminino", turmaA),
    { ra: "DEMO-0004", turma: turmaA._id },
    completo("DEMO-0005", "Davi Exemplo", "masculino", turmaB),
    { ra: "DEMO-0006", turma: turmaB._id },
  ]);

  const [historiaRio] = await Historia.create([
    {
      titulo: "[DEMO] O passeio da capivara",
      conteudo:
        "A capivara passeou pela margem do rio e encontrou novos amigos.",
    },
    {
      titulo: "[DEMO] O papagaio curioso",
      conteudo:
        "Um papagaio curioso aprendeu a reconhecer palavras na floresta.",
    },
  ]);

  const agora = new Date();
  const base = {
    professorCriador: professora._id,
    recompensaMoedas: 10,
    missao: { etapas: ["ler_texto", "responder_perguntas"] },
  };
  const [aventura, vogais] = await Atividade.create([
    {
      ...base,
      turma: turmaA._id,
      titulo: "[DEMO] Aventura no rio",
      ordem: 1,
      status: "publicada",
      publicadoEm: agora,
      historia: { tipo: "oficial", historiaId: historiaRio._id },
      questoes: [
        questao("Quem passeou pela margem do rio?", "A capivara", "O elefante"),
        questao("Qual palavra começa com a letra C?", "Capivara", "Rio"),
        questao("Onde a história acontece?", "Na margem do rio", "Na cidade"),
        questao("O que a capivara encontrou?", "Novos amigos", "Um tesouro"),
      ],
    },
    {
      ...base,
      turma: turmaB._id,
      titulo: "[DEMO] Eco das vogais",
      ordem: 1,
      status: "publicada",
      publicadoEm: agora,
      historia: {
        tipo: "propria",
        texto: "Um passeio pela floresta para ouvir o som das vogais.",
      },
      questoes: [
        questao("Qual destas letras é uma vogal?", "A", "B"),
        questao("Qual palavra começa com vogal?", "Ovo", "Bola"),
      ],
    },
    {
      ...base,
      turma: turmaA._id,
      titulo: "[DEMO] Leitura guiada (rascunho)",
      ordem: 2,
      historia: {
        tipo: "propria",
        texto: "Uma leitura guiada para descobrir novas palavras.",
      },
      questoes: [questao("Qual palavra rima com pato?", "Gato", "Bola")],
    },
  ]);

  await responder(ana, aventura, 4);
  await responder(bruno, aventura, 3);
  await responder(carla, aventura, 1);
  await responder(davi, vogais, 1, { concluir: false });
}
