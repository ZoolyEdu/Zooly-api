import {
  calcularSaldoMoedas,
  gastarMoedas,
  listarMovimentacoes,
  validarAlunoMoedas
} from '../services/moedaService.js';

function erro(res, status, mensagem) {
  return res.status(status).json({ sucesso: false, mensagem });
}

function responderErroAluno(res, codigo) {
  if (codigo === 'identidade-invalida') return erro(res, 401, 'Identidade do aluno inválida.');
  if (codigo === 'aluno-nao-encontrado') return erro(res, 404, 'Aluno não encontrado.');
  return false;
}

async function saldo(req, res, next) {
  try {
    const alunoId = req.usuario.id;
    const validacao = await validarAlunoMoedas(alunoId);
    if (validacao.erro) return responderErroAluno(res, validacao.erro);
    const saldoAtual = await calcularSaldoMoedas(alunoId);
    return res.status(200).json({ sucesso: true, saldo: saldoAtual });
  } catch (error) {
    return next(error);
  }
}

async function movimentacoes(req, res, next) {
  try {
    const alunoId = req.usuario.id;
    const validacao = await validarAlunoMoedas(alunoId);
    if (validacao.erro) return responderErroAluno(res, validacao.erro);

    const limite = req.query.limite === undefined ? 100 : Number(req.query.limite);
    const pagina = req.query.pagina === undefined ? 1 : Number(req.query.pagina);
    if (!Number.isInteger(limite) || limite < 1 || limite > 100 ||
      !Number.isSafeInteger(pagina) || pagina < 1 || !Number.isSafeInteger((pagina - 1) * limite)) {
      return erro(res, 400, 'Informe página positiva e limite inteiro entre 1 e 100.');
    }

    const lista = await listarMovimentacoes({ alunoId, pagina, limite });
    return res.status(200).json({ sucesso: true, movimentacoes: lista, pagina, limite });
  } catch (error) {
    return next(error);
  }
}

async function gastos(req, res, next) {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) ||
      Object.keys(req.body).some(campo => !['quantidade', 'motivo'].includes(campo))) {
      return erro(res, 400, 'Envie somente quantidade e motivo.');
    }

    const alunoId = req.usuario.id;
    const validacao = await validarAlunoMoedas(alunoId);
    if (validacao.erro) return responderErroAluno(res, validacao.erro);

    const resultado = await gastarMoedas({
      alunoId,
      quantidade: req.body.quantidade,
      motivo: req.body.motivo
    });
    return res.status(201).json({ sucesso: true, ...resultado });
  } catch (error) {
    return next(error);
  }
}

export default { saldo, movimentacoes, gastos };
