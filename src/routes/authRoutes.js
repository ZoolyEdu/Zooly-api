
import { Router } from 'express';
import authController from '../controllers/authController.js';

const router = Router();

// Login do professor
router.post('/login', authController.loginProfessor);

// Login do administrador
router.post('/admin/login', authController.loginAdmin);

// Login do aluno já cadastrado
router.post('/aluno/login', authController.loginAluno);

// Entrada e cadastro do aluno por código permanente da turma
router.post('/aluno/entrar-turma', authController.entrarTurma);

export default router;
