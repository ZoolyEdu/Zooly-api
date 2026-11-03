import mongoose from "mongoose";
import lojaService from "../services/lojaService.js";
import { enviarErro } from "../utils/erros.js";

async function listarAvatares(req, res, next) {
  try {
    const avatares = await lojaService.listarAvatares(req.usuario.id);
    return res.status(200).json({ sucesso: true, avatares });
  } catch (error) {
    return next(error);
  }
}

async function comprarAvatar(req, res, next) {
  try {
    const alunoId = req.usuario.id;
    if (!mongoose.isValidObjectId(alunoId))
      return enviarErro(res, 401, "Identidade do aluno inválida.");

    const avatar = lojaService.buscarAvatarCatalogo(req.params.avatarId);
    if (!avatar) return enviarErro(res, 404, "Avatar não encontrado.");
    if (req.body && Object.keys(req.body).length) {
      return enviarErro(res, 400, "A compra não aceita dados no corpo.");
    }

    const resultado = await lojaService.comprar({ alunoId, avatar });
    return res.status(201).json({ sucesso: true, avatar, ...resultado });
  } catch (error) {
    return next(error);
  }
}

export default { listarAvatares, comprarAvatar };
