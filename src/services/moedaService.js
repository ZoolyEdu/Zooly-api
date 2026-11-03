import mongoose from "mongoose";
import Aluno from "../models/Aluno.js";
import MovimentacaoMoeda from "../models/MovimentacaoMoeda.js";
import ProgressoAtividade from "../models/ProgressoAtividade.js";
import AvatarAluno from "../models/AvatarAluno.js";
import {
  buscarUltimaTentativa,
  concluirTentativaAberta,
  copiarRespostas,
} from "./tentativaService.js";
import { erroHttp, transacoesIndisponiveis } from "../utils/erros.js";

function obterRecompensaConclusao(recompensaAtividade) {
  if (recompensaAtividade !== undefined) {
    if (!Number.isSafeInteger(recompensaAtividade) || recompensaAtividade < 1) {
      throw new Error(
        "A recompensa da atividade deve ser um inteiro positivo.",
      );
    }
    return recompensaAtividade;
  }

  const configurada = process.env.MOEDAS_RECOMPENSA_CONCLUSAO;
  const quantidade =
    configurada === undefined || configurada.trim() === ""
      ? 10
      : Number(configurada);
  if (!Number.isSafeInteger(quantidade) || quantidade < 1) {
    throw new Error(
      "MOEDAS_RECOMPENSA_CONCLUSAO deve ser um inteiro positivo.",
    );
  }
  return quantidade;
}

async function comTransacaoDeAluno(alunoId, operacao) {
  let sessao;
  let resultado;
  try {
    sessao = await mongoose.startSession();
    await sessao.withTransaction(async () => {
      const atualizacao = await Aluno.updateOne(
        { _id: alunoId },
        { $inc: { versaoMovimentacoesMoeda: 1 } },
        { session: sessao },
      );
      if ((atualizacao.matchedCount ?? atualizacao.n) === 0) {
        throw erroHttp("Aluno não encontrado.", 404);
      }
      resultado = await operacao(sessao);
    });
    return resultado;
  } catch (erro) {
    if (transacoesIndisponiveis(erro)) {
      throw erroHttp(
        "As operações de moedas exigem MongoDB com suporte a transações.",
        503,
      );
    }
    throw erro;
  } finally {
    if (sessao) await sessao.endSession();
  }
}

async function calcularSaldoComSessao(alunoId, sessao) {
  let agregacao = MovimentacaoMoeda.aggregate([
    { $match: { aluno: new mongoose.Types.ObjectId(String(alunoId)) } },
    {
      $group: {
        _id: null,
        saldo: {
          $sum: {
            $cond: [
              { $eq: ["$tipo", "ganho"] },
              "$quantidade",
              { $multiply: ["$quantidade", -1] },
            ],
          },
        },
      },
    },
  ]);
  if (sessao) agregacao = agregacao.session(sessao);
  const [resultado] = await agregacao;
  const saldo = resultado?.saldo ?? 0;
  if (!Number.isSafeInteger(saldo)) {
    throw erroHttp("O saldo excede o limite inteiro seguro suportado.", 503);
  }
  return saldo;
}

export function calcularSaldoMoedas(alunoId) {
  return calcularSaldoComSessao(alunoId);
}

export async function validarAlunoMoedas(alunoId) {
  if (!mongoose.isValidObjectId(alunoId))
    return { erro: "identidade-invalida" };
  const aluno = await Aluno.findById(alunoId).select("_id");
  return aluno ? { valido: true } : { erro: "aluno-nao-encontrado" };
}

export function listarMovimentacoes({ alunoId, pagina, limite }) {
  return MovimentacaoMoeda.find({ aluno: alunoId })
    .sort({ createdAt: -1, _id: -1 })
    .skip((pagina - 1) * limite)
    .limit(limite);
}

export async function gastarMoedas({ alunoId, quantidade, motivo }) {
  if (!Number.isSafeInteger(quantidade) || quantidade < 1) {
    throw erroHttp("A quantidade deve ser um inteiro positivo.", 400);
  }
  if (
    typeof motivo !== "string" ||
    motivo.trim().length < 3 ||
    motivo.trim().length > 120
  ) {
    throw erroHttp("Informe um motivo entre 3 e 120 caracteres.", 400);
  }

  return comTransacaoDeAluno(alunoId, async (sessao) => {
    const saldoAtual = await calcularSaldoComSessao(alunoId, sessao);
    if (saldoAtual < quantidade) throw erroHttp("Saldo insuficiente.", 409);

    const [movimentacao] = await MovimentacaoMoeda.create(
      [
        {
          aluno: alunoId,
          tipo: "gasto",
          quantidade,
          motivo: motivo.trim(),
        },
      ],
      { session: sessao },
    );
    return { movimentacao, saldo: saldoAtual - quantidade };
  });
}

export async function comprarAvatar({ alunoId, avatarId, preco }) {
  if (typeof avatarId !== "string" || !avatarId.trim())
    throw erroHttp("Avatar inválido.", 400);
  if (!Number.isSafeInteger(preco) || preco < 1)
    throw erroHttp("Preço do avatar inválido.", 400);

  return comTransacaoDeAluno(alunoId, async (sessao) => {
    let consulta = AvatarAluno.exists({ aluno: alunoId, avatarId });
    if (typeof consulta.session === "function")
      consulta = consulta.session(sessao);
    if (await consulta) throw erroHttp("Este avatar já foi adquirido.", 409);

    const saldoAtual = await calcularSaldoComSessao(alunoId, sessao);
    if (saldoAtual < preco) throw erroHttp("Saldo insuficiente.", 409);

    const [movimentacao] = await MovimentacaoMoeda.create(
      [
        {
          aluno: alunoId,
          tipo: "gasto",
          quantidade: preco,
          motivo: `Compra de avatar: ${avatarId}`,
        },
      ],
      { session: sessao },
    );
    const [aquisicao] = await AvatarAluno.create(
      [{ aluno: alunoId, avatarId }],
      { session: sessao },
    );
    return { movimentacao, aquisicao, saldo: saldoAtual - preco };
  });
}

export async function concluirAtividadeComRecompensa({
  alunoId,
  atividadeId,
  recompensaAtividade,
}) {
  const recompensa = obterRecompensaConclusao(recompensaAtividade);
  return comTransacaoDeAluno(alunoId, async (sessao) => {
    let consulta = ProgressoAtividade.findOne({
      aluno: alunoId,
      atividade: atividadeId,
    });
    if (typeof consulta.session === "function")
      consulta = consulta.session(sessao);
    const progresso = await consulta;
    if (!progresso)
      throw erroHttp("O aluno ainda não iniciou esta atividade.", 404);

    // A transação serializa as operações de moedas do aluno: duas conclusões simultâneas
    // não enxergam a mesma tentativa aberta, e só a primeira conclusão vira oficial.
    const { tentativa, primeiraConclusao } = await concluirTentativaAberta({
      progresso,
      sessao,
    });

    if (!primeiraConclusao) {
      // Repetição da missão ou requisição repetida: nunca gera moedas.
      return {
        progresso,
        tentativa:
          tentativa ??
          (await buscarUltimaTentativa(alunoId, atividadeId, sessao)),
        movimentacao: null,
        saldo: await calcularSaldoComSessao(alunoId, sessao),
      };
    }

    // A tentativa oficial fica congelada no progresso, que é o que o desempenho lê.
    progresso.status = "concluida";
    progresso.concluidaEm = tentativa.concluidaEm;
    progresso.tentativaOficial = tentativa._id;
    progresso.respostas = copiarRespostas(tentativa.respostas);
    progresso.respostasRegistradasEm = tentativa.respostasRegistradasEm;
    await progresso.save({ session: sessao });

    const [movimentacao] = await MovimentacaoMoeda.create(
      [
        {
          aluno: alunoId,
          tipo: "ganho",
          quantidade: recompensa,
          motivo: "Conclusão de atividade",
          atividade: atividadeId,
        },
      ],
      { session: sessao },
    );

    return {
      progresso,
      tentativa,
      movimentacao,
      saldo: await calcularSaldoComSessao(alunoId, sessao),
    };
  });
}
