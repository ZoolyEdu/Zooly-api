import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import Escola from "../models/Escola.js";
import Professor from "../models/Professor.js";
import Turma from "../models/Turma.js";

const periodosPermitidos = ["Manhã", "Tarde"];
const mascotesPermitidos = ["papagaio", "lagarto", "cobra", "sarue"];

function camposComplementaresValidos(body) {
  return (
    (!Object.hasOwn(body, "periodo") ||
      periodosPermitidos.includes(body.periodo)) &&
    (!Object.hasOwn(body, "mascote") ||
      mascotesPermitidos.includes(body.mascote))
  );
}

async function obterProfessor(professorId) {
  if (!mongoose.isValidObjectId(professorId)) return null;
  return Professor.findById(professorId).select("escolas");
}

// Cada professor gerencia somente as turmas pelas quais é responsável.
function professorTemAcesso(professor, turma) {
  return String(turma.professorResponsavel) === String(professor._id);
}

// Código curto da turma: "TUR-" + 4 caracteres de A–Z e 0–9 (ex.: TUR-6E27).
// São 36^4 = 1.679.616 combinações; a unicidade é garantida no cadastro.
// Códigos antigos (ex.: TUR-6E2772697D59, TURMA-A) continuam válidos: a entrada
// do aluno só normaliza o texto (trim + maiúsculas) e nunca exige um formato.
export const PREFIXO_CODIGO_TURMA = "TUR-";
export const ALFABETO_CODIGO_TURMA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const TAMANHO_SUFIXO_CODIGO_TURMA = 4;
export const FORMATO_CODIGO_TURMA = /^TUR-[A-Z0-9]{4}$/;
export const TENTATIVAS_CODIGO_TURMA = 10;

// `sortear(n)` devolve um inteiro em [0, n). Padrão: crypto.randomInt (uniforme e seguro).
export function gerarCodigoPermanente(sortear = randomInt) {
  let sufixo = "";
  for (let i = 0; i < TAMANHO_SUFIXO_CODIGO_TURMA; i += 1) {
    sufixo += ALFABETO_CODIGO_TURMA[sortear(ALFABETO_CODIGO_TURMA.length)];
  }
  return `${PREFIXO_CODIGO_TURMA}${sufixo}`;
}

// Permite aos testes forçar sequências de códigos (e colisões) de forma determinística.
let geradorCodigo = () => gerarCodigoPermanente();
export function configurarGeradorCodigoTurma(gerador) {
  geradorCodigo = gerador ?? (() => gerarCodigoPermanente());
}

async function cadastrar({ body, professorId }) {
  const { nome, escolaId, anoEscolar, periodo, mascote } = body;

  if (
    typeof nome !== "string" ||
    !nome.trim() ||
    typeof escolaId !== "string" ||
    !mongoose.isValidObjectId(escolaId) ||
    !Number.isInteger(anoEscolar) ||
    anoEscolar < 2000 ||
    anoEscolar > 2100
  )
    return { erro: "dados-invalidos" };
  if (!camposComplementaresValidos(body))
    return { erro: "dados-complementares-invalidos" };

  const professor = await obterProfessor(professorId);
  if (!professor) return { erro: "professor-nao-encontrado" };

  const escolaAutorizada = professor.escolas.some(
    (id) => id.toString() === escolaId,
  );
  if (!escolaAutorizada) return { erro: "professor-sem-vinculo-escola" };

  const escola = await Escola.findById(escolaId);
  if (!escola) return { erro: "escola-nao-encontrada" };

  // Unicidade em duas camadas: consulta prévia (evita tentar códigos já usados) e o
  // índice único do model, que protege contra corridas entre cadastros simultâneos.
  let turma;
  for (let tentativa = 0; tentativa < TENTATIVAS_CODIGO_TURMA; tentativa += 1) {
    const codigoPermanente = geradorCodigo();
    if (await Turma.exists({ codigoPermanente })) continue;
    try {
      turma = await Turma.create({
        nome: nome.trim(),
        codigoPermanente,
        anoEscolar,
        escola: escola._id,
        professorResponsavel: professor._id,
        ...(periodo !== undefined ? { periodo } : {}),
        ...(mascote !== undefined ? { mascote } : {}),
      });
      break;
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }

  if (!turma) return { erro: "codigo-nao-gerado" };
  return { turma };
}

async function listar(professorId) {
  const professor = await obterProfessor(professorId);
  if (!professor) return { erro: "professor-nao-encontrado" };

  const turmas = await Turma.find({
    professorResponsavel: professor._id,
    arquivada: false,
  })
    .populate("escola", "nome codigoPermanente")
    .populate("professorResponsavel", "nome email")
    .sort({ nome: 1 });

  return { turmas };
}

async function consultar({ turmaId, professorId }) {
  if (!mongoose.isValidObjectId(turmaId)) return { erro: "id-invalido" };

  const professor = await obterProfessor(professorId);
  if (!professor) return { erro: "professor-nao-encontrado" };

  const turma = await Turma.findOne({ _id: turmaId, arquivada: false });
  if (!turma) return { erro: "turma-nao-encontrada" };
  if (!professorTemAcesso(professor, turma))
    return { erro: "acesso-nao-autorizado" };

  await turma.populate("escola", "nome codigoPermanente");
  await turma.populate("professorResponsavel", "nome email");
  return { turma };
}

async function atualizar({ turmaId, professorId, body }) {
  if (!mongoose.isValidObjectId(turmaId)) return { erro: "id-invalido" };

  const professor = await obterProfessor(professorId);
  if (!professor) return { erro: "professor-nao-encontrado" };

  const turma = await Turma.findById(turmaId);
  if (!turma || turma.arquivada) return { erro: "turma-nao-encontrada" };
  if (!professorTemAcesso(professor, turma))
    return { erro: "acesso-nao-autorizado" };

  const { nome, anoEscolar, periodo, mascote } = body;

  if (!camposComplementaresValidos(body))
    return { erro: "dados-complementares-invalidos" };

  if (Object.hasOwn(body, "nome")) {
    if (typeof nome !== "string" || !nome.trim())
      return { erro: "nome-invalido" };
    turma.nome = nome.trim();
  }

  if (Object.hasOwn(body, "anoEscolar")) {
    if (
      !Number.isInteger(anoEscolar) ||
      anoEscolar < 2000 ||
      anoEscolar > 2100
    ) {
      return { erro: "ano-escolar-invalido" };
    }
    turma.anoEscolar = anoEscolar;
  }

  if (Object.hasOwn(body, "periodo")) turma.periodo = periodo;
  if (Object.hasOwn(body, "mascote")) turma.mascote = mascote;

  await turma.save();
  return { turma };
}

async function definirSenhaAcesso({ turmaId, professorId, body }) {
  if (!mongoose.isValidObjectId(turmaId)) return { erro: "id-invalido" };

  const { senha } = body;
  if (
    typeof senha !== "string" ||
    senha.trim().length < 4 ||
    senha.trim().length > 20
  ) {
    return { erro: "senha-invalida" };
  }

  const professor = await obterProfessor(professorId);
  if (!professor) return { erro: "professor-nao-encontrado" };

  const turma = await Turma.findById(turmaId);
  if (!turma || turma.arquivada)
    return { erro: "turma-ou-arquivada-nao-encontrada" };
  if (!professorTemAcesso(professor, turma))
    return { erro: "acesso-nao-autorizado" };

  turma.senhaAcessoHash = await bcrypt.hash(senha.trim(), 10);
  await turma.save();
  return { configurada: true };
}

async function arquivar({ turmaId, professorId }) {
  if (!mongoose.isValidObjectId(turmaId)) return { erro: "id-invalido" };

  const professor = await obterProfessor(professorId);
  if (!professor) return { erro: "professor-nao-encontrado" };

  const turma = await Turma.findById(turmaId);
  if (!turma || turma.arquivada)
    return { erro: "turma-ja-arquivada-ou-inexistente" };
  if (!professorTemAcesso(professor, turma))
    return { erro: "acesso-nao-autorizado" };

  turma.arquivada = true;
  await turma.save();
  return { arquivada: true };
}

export default {
  cadastrar,
  listar,
  consultar,
  atualizar,
  definirSenhaAcesso,
  arquivar,
};
