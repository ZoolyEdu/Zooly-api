import { Router } from "express";
import autenticarToken from "../middlewares/autenticarToken.js";
import autorizarPerfil from "../middlewares/autorizarPerfil.js";
import bnccController from "../controllers/bnccController.js";

// Qualquer caminho que não seja /busca é tratado como código BNCC.
const rotaCodigo = /^\/(?!busca(?:\/|$))[^/]+$/;

// A ordem das rotas é configurável para o teste que confirma que /busca não vira código.
export function criarBnccRouter({ codigoAntesDaBusca = false } = {}) {
  const router = Router();
  router.use(autenticarToken, autorizarPerfil("professor"));
  const rotas = {
    busca: () => router.get("/busca", bnccController.buscar),
    codigo: () => router.get(rotaCodigo, bnccController.consultarCodigo),
  };
  if (codigoAntesDaBusca) {
    rotas.codigo();
    rotas.busca();
  } else {
    rotas.busca();
    rotas.codigo();
  }
  router.use(bnccController.tratarErro);
  return router;
}

export default criarBnccRouter();
