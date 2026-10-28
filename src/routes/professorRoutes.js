import { Router } from 'express';
import professorController from '../controllers/professorController.js';

const router = Router();

router.post('/', professorController.cadastrarProfessor);

export default router;
