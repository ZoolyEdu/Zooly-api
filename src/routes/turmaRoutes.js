import { Router } from 'express';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import Turma from '../models/Turma.js';
import Escola from '../models/Escola.js';
import Professor from '../models/Professor.js';
import autenticarToken from '../middlewares/autenticarToken.js';
import autorizarPerfil from '../middlewares/autorizarPerfil.js';

const router = Router();

router.use(autenticarToken, autorizarPerfil('professor'));

async function obterProfessor(req) {
  if (!mongoose.isValidObjectId(req.usuario.id)) {
    return null;
  }

  return Professor.findById(req.usuario.id).select('escolas');
}

function gerarCodigoPermanente() {
  return `TUR-${randomBytes(6).toString('hex').toUpperCase()}`;
}

// Cadastrar turma
router.post('/', async (req, res, next) => {
  try {
    const { nome, escolaId, anoEscolar } = req.body;

    if (
      typeof nome !== 'string' ||
      !nome.trim() ||
      typeof escolaId !== 'string' ||
      !mongoose.isValidObjectId(escolaId) ||
      !Number.isInteger(anoEscolar) ||
      anoEscolar < 2000 ||
      anoEscolar > 2100
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Informe nome, escola válida e ano escolar válido.'
      });
    }

    const professor = await obterProfessor(req);

    if (!professor) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Professor não encontrado.'
      });
    }

    const escolaAutorizada = professor.escolas.some(
      id => id.toString() === escolaId
    );

    if (!escolaAutorizada) {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Você não está vinculado a esta escola.'
      });
    }

    const escola = await Escola.findById(escolaId);

    if (!escola) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Escola não encontrada.'
      });
    }

    let codigoPermanente;
    let turma;

    // Repetir em caso de colisão improvável do código.
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      codigoPermanente = gerarCodigoPermanente();

      try {
        turma = await Turma.create({
          nome: nome.trim(),
          codigoPermanente,
          anoEscolar,
          escola: escola._id,
          professorResponsavel: professor._id
        });
        break;
      } catch (error) {
        if (error.code !== 11000) throw error;
      }
    }

    if (!turma) {
      return res.status(500).json({
        sucesso: false,
        mensagem: 'Não foi possível gerar um código para a turma.'
      });
    }

    return res.status(201).json({
      sucesso: true,
      mensagem: 'Turma cadastrada com sucesso.',
      turma
    });
  } catch (error) {
    next(error);
  }
});

// Listar turmas das escolas do professor
router.get('/', async (req, res, next) => {
  try {
    const professor = await obterProfessor(req);

    if (!professor) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Professor não encontrado.'
      });
    }

    const turmas = await Turma.find({
      escola: { $in: professor.escolas },
      arquivada: false
    })
      .populate('escola', 'nome codigoPermanente')
      .populate('professorResponsavel', 'nome email')
      .sort({ nome: 1 });

    return res.status(200).json({
      sucesso: true,
      total: turmas.length,
      turmas
    });
  } catch (error) {
    next(error);
  }
});

// Consultar uma turma
router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID de turma inválido.'
      });
    }

    const professor = await obterProfessor(req);

    if (!professor) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Professor não encontrado.'
      });
    }

    const turma = await Turma.findOne({
      _id: req.params.id,
      escola: { $in: professor.escolas },
      arquivada: false
    })
      .populate('escola', 'nome codigoPermanente')
      .populate('professorResponsavel', 'nome email');

    if (!turma) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Turma não encontrada.'
      });
    }

    return res.status(200).json({ sucesso: true, turma });
  } catch (error) {
    next(error);
  }
});

// Editar turma
router.put('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID de turma inválido.'
      });
    }

    const professor = await obterProfessor(req);

    if (!professor) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Professor não encontrado.'
      });
    }

    const turma = await Turma.findOne({
      _id: req.params.id,
      escola: { $in: professor.escolas },
      arquivada: false
    });

    if (!turma) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Turma não encontrada.'
      });
    }

    const { nome, anoEscolar } = req.body;

    if (Object.hasOwn(req.body, 'nome')) {
      if (typeof nome !== 'string' || !nome.trim()) {
        return res.status(400).json({
          sucesso: false,
          mensagem: 'O nome da turma é inválido.'
        });
      }

      turma.nome = nome.trim();
    }

    if (Object.hasOwn(req.body, 'anoEscolar')) {
      if (
        !Number.isInteger(anoEscolar) ||
        anoEscolar < 2000 ||
        anoEscolar > 2100
      ) {
        return res.status(400).json({
          sucesso: false,
          mensagem: 'O ano escolar é inválido.'
        });
      }

      turma.anoEscolar = anoEscolar;
    }

    await turma.save();

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Turma atualizada com sucesso.',
      turma
    });
  } catch (error) {
    next(error);
  }
});

// Arquivar turma sem excluí-la
router.patch('/:id/arquivar', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID de turma inválido.'
      });
    }

    const professor = await obterProfessor(req);

    if (!professor) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Professor não encontrado.'
      });
    }

    const turma = await Turma.findOne({
      _id: req.params.id,
      escola: { $in: professor.escolas },
      arquivada: false
    });

    if (!turma) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Turma não encontrada ou já arquivada.'
      });
    }

    turma.arquivada = true;
    await turma.save();

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Turma arquivada com sucesso.'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
