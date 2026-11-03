import { Router } from "express";
import autenticarToken from "../middlewares/autenticarToken.js";
import autorizarPerfil from "../middlewares/autorizarPerfil.js";
import historiaController from "../controllers/historiaController.js";

const router = Router();

// Banco de Histórias: somente professores. Alunos não acessam nenhuma rota daqui.
router.use(autenticarToken, autorizarPerfil("professor"));

router.get("/", historiaController.listarHistorias);
router.post("/", historiaController.criar);
router.post("/validar", historiaController.validar);
router.get("/:id", historiaController.obterHistoria);
router.get("/:id/perguntas", historiaController.obterPerguntas);
router.get("/:id/modelo-atividade", historiaController.modeloAtividade);
router.put("/:id", historiaController.atualizar);
router.patch("/:id/arquivar", historiaController.arquivar);
router.patch("/:id/reativar", historiaController.reativar);
router.delete("/:id", historiaController.excluir);

export default router;
