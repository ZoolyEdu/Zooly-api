import { Router } from "express";
import autenticarToken from "../middlewares/autenticarToken.js";
import autorizarPerfil from "../middlewares/autorizarPerfil.js";
import { limitarCadastro } from "../middlewares/limitarTentativas.js";
import professorController from "../controllers/professorController.js";

const router = Router();

router.post("/", limitarCadastro, professorController.cadastrarProfessor);
router.get(
  "/me",
  autenticarToken,
  autorizarPerfil("professor"),
  professorController.obterPerfil,
);

export default router;
