
import { Router } from 'express';
import Aluno from '../models/Aluno.js';
import Turma from '../models/Turma.js';
import Professor from '../models/Professor.js';
import autenticarToken from '../middlewares/autenticarToken.js';
import autorizarPerfil from '../middlewares/autorizarPerfil.js';

const router = Router();

// Verifica se o professor tem acesso à escola da turma
function professorTemAcesso(professor, turma) {
  return professor.escolas.some(
    escolaId => escolaId.toString() === turma.escola.toString()
  );
}

// Cadastrar aluno
router.post(
  '/',
  autenticarToken,
  autorizarPerfil('professor'),
  async (req, res) => {
    try {
      const { ra, turmaId } = req.body;

      if (!ra || !turmaId) {
        return res.status(400).json({
          sucesso: false,
          mensagem: 'O RA e a turma são obrigatórios.'
        });
      }

      const turma = await Turma.findById(turmaId);

      if (!turma || turma.arquivada) {
        return res.status(404).json({
          sucesso: false,
          mensagem: 'Turma não encontrada ou arquivada.'
        });
      }

      const professor = await Professor.findById(req.usuario.id);

      if (!professor || !professorTemAcesso(professor, turma)) {
        return res.status(403).json({
          sucesso: false,
          mensagem: 'Você não tem permissão para cadastrar alunos nesta turma.'
        });
      }

      const aluno = await Aluno.create({
        ra: String(ra).trim(),
        turma: turma._id
      });

      return res.status(201).json({
        sucesso: true,
        mensagem: 'Aluno cadastrado. O cadastro inicial está pendente.',
        aluno: {
          id: aluno._id,
          ra: aluno.ra,
          turma: aluno.turma,
          cadastroInicialConcluido: aluno.cadastroInicialConcluido
        }
      });
    } catch (erro) {
      if (erro.code === 11000) {
        return res.status(409).json({
          sucesso: false,
          mensagem: 'Já existe um aluno cadastrado com este RA.'
        });
      }

      if (erro.name === 'CastError') {
        return res.status(400).json({
          sucesso: false,
          mensagem: 'O ID informado é inválido.'
        });
      }

      console.error('Erro ao cadastrar aluno:', erro);
      return res.status(500).json({
        sucesso: false,
        mensagem: 'Erro interno ao cadastrar aluno.'
      });
    }
  }
);

// Listar alunos de uma turma
router.get(
  '/turma/:turmaId',
  autenticarToken,
  autorizarPerfil('professor'),
  async (req, res) => {
    try {
      const turma = await Turma.findById(req.params.turmaId);

      if (!turma || turma.arquivada) {
        return res.status(404).json({
          sucesso: false,
          mensagem: 'Turma não encontrada ou arquivada.'
        });
      }

      const professor = await Professor.findById(req.usuario.id);

      if (!professor || !professorTemAcesso(professor, turma)) {
        return res.status(403).json({
          sucesso: false,
          mensagem: 'Você não tem permissão para consultar esta turma.'
        });
      }

      const alunos = await Aluno.find({ turma: turma._id })
        .select('ra nomeCompleto sexo cadastroInicialConcluido turma createdAt')
        .sort({ nomeCompleto: 1, ra: 1 });

      return res.status(200).json({
        sucesso: true,
        total: alunos.length,
        alunos
      });
    } catch (erro) {
      if (erro.name === 'CastError') {
        return res.status(400).json({
          sucesso: false,
          mensagem: 'O ID da turma informado é inválido.'
        });
      }

      console.error('Erro ao listar alunos:', erro);
      return res.status(500).json({
        sucesso: false,
        mensagem: 'Erro interno ao listar alunos.'
      });
    }
  }
);

// Editar RA ou transferir aluno para outra turma
router.put(
  '/:alunoId',
  autenticarToken,
  autorizarPerfil('professor'),
  async (req, res) => {
    try {
      const { ra, turmaId } = req.body;

      if (ra === undefined && turmaId === undefined) {
        return res.status(400).json({
          sucesso: false,
          mensagem: 'Informe o RA ou a turma para atualizar.'
        });
      }

      const aluno = await Aluno.findById(req.params.alunoId);

      if (!aluno) {
        return res.status(404).json({
          sucesso: false,
          mensagem: 'Aluno não encontrado.'
        });
      }

      const professor = await Professor.findById(req.usuario.id);
      const turmaAtual = await Turma.findById(aluno.turma);

      if (
        !professor ||
        !turmaAtual ||
        !professorTemAcesso(professor, turmaAtual)
      ) {
        return res.status(403).json({
          sucesso: false,
          mensagem: 'Você não tem permissão para editar este aluno.'
        });
      }

      if (ra !== undefined) {
        const raNormalizado = String(ra).trim();

        if (!raNormalizado) {
          return res.status(400).json({
            sucesso: false,
            mensagem: 'O RA não pode ficar vazio.'
          });
        }

        const existente = await Aluno.findOne({
          ra: raNormalizado,
          _id: { $ne: aluno._id }
        });

        if (existente) {
          return res.status(409).json({
            sucesso: false,
            mensagem: 'Já existe outro aluno cadastrado com este RA.'
          });
        }

        aluno.ra = raNormalizado;
      }

      if (turmaId !== undefined) {
        const novaTurma = await Turma.findById(turmaId);

        if (!novaTurma || novaTurma.arquivada) {
          return res.status(404).json({
            sucesso: false,
            mensagem: 'Nova turma não encontrada ou arquivada.'
          });
        }

        if (!professorTemAcesso(professor, novaTurma)) {
          return res.status(403).json({
            sucesso: false,
            mensagem: 'Você não tem permissão para usar esta turma.'
          });
        }

        aluno.turma = novaTurma._id;
      }

      await aluno.save();

      return res.status(200).json({
        sucesso: true,
        mensagem: 'Aluno atualizado com sucesso.',
        aluno: {
          id: aluno._id,
          ra: aluno.ra,
          nomeCompleto: aluno.nomeCompleto,
          sexo: aluno.sexo,
          turma: aluno.turma,
          cadastroInicialConcluido: aluno.cadastroInicialConcluido
        }
      });
    } catch (erro) {
      if (erro.code === 11000) {
        return res.status(409).json({
          sucesso: false,
          mensagem: 'Já existe outro aluno cadastrado com este RA.'
        });
      }

      if (erro.name === 'CastError') {
        return res.status(400).json({
          sucesso: false,
          mensagem: 'O ID informado é inválido.'
        });
      }

      console.error('Erro ao editar aluno:', erro);
      return res.status(500).json({
        sucesso: false,
        mensagem: 'Erro interno ao editar aluno.'
      });
    }
  }
);

 // Concluir cadastro inicial do aluno
router.patch(
  '/cadastro-inicial',
  autenticarToken,
  autorizarPerfil('aluno'),
  async (req, res) => {
    try {
      const { nomeCompleto, codigoPermanente, sexo } = req.body;

      if (
        typeof nomeCompleto !== 'string' ||
        !nomeCompleto.trim() ||
        typeof codigoPermanente !== 'string' ||
        !codigoPermanente.trim() ||
        !['feminino', 'masculino', 'nao_informado'].includes(sexo)
      ) {
        return res.status(400).json({
          sucesso: false,
          mensagem: 'Informe nome completo, código da turma e sexo válido.'
        });
      }

      const aluno = await Aluno.findById(req.usuario.id);
      

      if (!aluno) {
        return res.status(404).json({
          sucesso: false,
          mensagem: 'Aluno não encontrado.'
        });
      }

      if (aluno.cadastroInicialConcluido) {
        return res.status(409).json({
          sucesso: false,
          mensagem: 'O cadastro inicial já foi concluído.'
        });
      }

      const turma = await Turma.findById(aluno.turma);

      if (!turma || turma.arquivada) {
        return res.status(404).json({
          sucesso: false,
          mensagem: 'Turma não encontrada ou arquivada.'
        });
      }

      if (
        turma.codigoPermanente !== codigoPermanente.trim().toUpperCase()
      ) {
        return res.status(400).json({
          sucesso: false,
          mensagem: 'O código informado não corresponde à turma do aluno.'
        });
      }

      aluno.nomeCompleto = nomeCompleto.trim();
      aluno.sexo = sexo;
      aluno.cadastroInicialConcluido = true;

      await aluno.save();

      return res.status(200).json({
        sucesso: true,
        mensagem: 'Cadastro inicial concluído com sucesso.',
        aluno: {
          id: aluno._id,
          ra: aluno.ra,
          nomeCompleto: aluno.nomeCompleto,
          sexo: aluno.sexo,
          turma: aluno.turma,
          cadastroInicialConcluido: aluno.cadastroInicialConcluido
        }
      });
    } catch (erro) {
      if (erro.name === 'CastError') {
        return res.status(400).json({
          sucesso: false,
          mensagem: 'Identificação do aluno inválida.'
        });
      }

      console.error('Erro ao concluir cadastro inicial:', erro);

      return res.status(500).json({
        sucesso: false,
        mensagem: 'Erro interno ao concluir cadastro inicial.'
      });
    }
  }
);

export default router;
