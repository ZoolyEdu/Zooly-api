import {
  buscarAprendizagens,
  obterAprendizagem,
  BnccServiceError,
} from "../services/bnccService.js";
import { enviarErro } from "../utils/erros.js";

function validarChaves(query, permitidas) {
  return Object.keys(query).every((chave) => permitidas.includes(chave));
}

async function buscar(req, res, next) {
  try {
    if (!validarChaves(req.query, ["tema", "limite"])) {
      return enviarErro(res, 400, "Parâmetros inválidos.");
    }
    const tema =
      typeof req.query.tema === "string" ? req.query.tema.trim() : "";
    const limite =
      req.query.limite === undefined ? 10 : Number(req.query.limite);
    if (
      !tema ||
      tema.length > 100 ||
      /[\u0000-\u001f]/.test(tema) ||
      !Number.isInteger(limite) ||
      limite < 1 ||
      limite > 10
    ) {
      return enviarErro(
        res,
        400,
        "Informe um tema de até 100 caracteres e limite entre 1 e 10.",
      );
    }
    const resultado = await buscarAprendizagens(tema, limite);
    return res.json({ sucesso: true, ...resultado });
  } catch (error) {
    return next(error);
  }
}

async function consultarCodigo(req, res, next) {
  try {
    const item = await obterAprendizagem(req.path.slice(1));
    return res.json({ sucesso: true, item });
  } catch (error) {
    return next(error);
  }
}

// Erros do serviço BNCC (ex.: código inexistente, serviço externo fora do ar).
function tratarErro(error, req, res, next) {
  if (!(error instanceof BnccServiceError)) return next(error);
  return enviarErro(res, error.status, error.message);
}

export default { buscar, consultarCodigo, tratarErro };
