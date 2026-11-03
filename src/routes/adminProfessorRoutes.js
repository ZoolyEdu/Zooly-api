import { Router } from "express";
import autenticarToken from "../middlewares/autenticarToken.js";
import autorizarPerfil from "../middlewares/autorizarPerfil.js";
import adminProfessorController from "../controllers/adminProfessorController.js";

const router = Router();

router.use(autenticarToken, autorizarPerfil("administrador"));
router.get("/", adminProfessorController.listar);
router.post("/", adminProfessorController.cadastrar);
router.get("/:id", adminProfessorController.obterPorId);
router.put("/:id", adminProfessorController.atualizar);
router.delete("/:id", adminProfessorController.excluir);

export default router;
