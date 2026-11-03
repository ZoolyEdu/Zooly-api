import { Router } from "express";
import autenticarToken from "../middlewares/autenticarToken.js";
import autorizarPerfil from "../middlewares/autorizarPerfil.js";
import alunoController from "../controllers/alunoController.js";

const router = Router();

router.get(
  "/me",
  autenticarToken,
  autorizarPerfil("aluno"),
  alunoController.obterPerfil,
);
router.put(
  "/me/avatar",
  autenticarToken,
  autorizarPerfil("aluno"),
  alunoController.selecionarAvatar,
);

router.post(
  "/",
  autenticarToken,
  autorizarPerfil("professor"),
  alunoController.cadastrar,
);

router.get(
  "/turma/:turmaId",
  autenticarToken,
  autorizarPerfil("professor"),
  alunoController.listarPorTurma,
);

router.put(
  "/:alunoId",
  autenticarToken,
  autorizarPerfil("professor"),
  alunoController.atualizar,
);

router.patch(
  "/cadastro-inicial",
  autenticarToken,
  autorizarPerfil("aluno"),
  alunoController.concluirCadastroInicial,
);

export default router;
