
import { Router } from 'express';
import { limitarLogin } from '../middlewares/limitarTentativas.js';
import authController from '../controllers/authController.js';

const router = Router();

// Login do professor
router.post('/login', limitarLogin, authController.loginProfessor);

// Login do administrador
router.post('/admin/login', limitarLogin, authController.loginAdmin);

// Login do aluno já cadastrado
router.post('/aluno/login', limitarLogin, authController.loginAluno);

// Entrada e cadastro do aluno por código permanente da turma
router.post('/aluno/entrar-turma', limitarLogin, authController.entrarTurma);

export default router;
