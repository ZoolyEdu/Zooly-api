import Atividade from '../models/Atividade.js';
import ProgressoAtividade from '../models/ProgressoAtividade.js';

// 1. Listar o mapa de missões da turma para o aluno (com estado de desbloqueio e atraso)
export const listarMapaMissoesAluno = async (req, res, next) => {
  try {
    const { turmaId } = req.params;
    const alunoId = req.usuario.id; // Obtido através do middleware de autenticação

    // Buscar todas as atividades publicadas da turma, ordenadas estritamente pela 'ordem'
    const atividades = await Atividade.find({ turma: turmaId, status: 'publicada' }).sort({ ordem: 1 });

    // Buscar todo o progresso registado deste aluno
    const progressos = await ProgressoAtividade.find({ aluno: alunoId });

    const agora = new Date();

    const mapaMissoes = atividades.map((atividade, index) => {
      const progresso = progressos.find(p => String(p.atividade) === String(atividade._id));
      const concluida = progresso?.status === 'concluida';

      // Regra de Desbloqueio Sequencial:
      // A primeira missão (índice 0 / ordem 1) é sempre desbloqueada.
      // As seguintes exigem obrigatoriamente que a atividade anterior esteja com status 'concluida'.
      let desbloqueada = false;
      if (index === 0) {
        desbloqueada = true;
      } else {
        const atividadeAnterior = atividades[index - 1];
        const progressoAnterior = progressos.find(p => String(p.atividade) === String(atividadeAnterior._id));
        desbloqueada = progressoAnterior?.status === 'concluida';
      }

      // Regra de Prazo Vencido:
      // O prazo vencido NÃO bloqueia a atividade, apenas a identifica como atrasada.
      const atrasada = atividade.prazo && new Date(atividade.prazo) < agora;

      return {
        id: atividade._id,
        titulo: atividade.titulo,
        ordem: atividade.ordem,
        desbloqueada,
        concluida,
        atrasada,
        prazo: atividade.prazo
      };
    });

    return res.status(200).json({ sucesso: true, mapaMissoes });
  } catch (error) {
    return next(error);
  }
};

// 2. Validar o acesso/conclusão de uma atividade (Proteção Anti-Bypass)
export const validarEConcluirAtividade = async (req, res, next) => {
  try {
    const { atividadeId } = req.params;
    const alunoId = req.usuario.id;

    const atividadeAtual = await Atividade.findById(atividadeId);
    if (!atividadeAtual) {
      return res.status(404).json({ sucesso: false, mensagem: 'Atividade não encontrada.' });
    }

    // Regra Anti-Bypass / Desbloqueio Sequencial no Backend:
    // Se a missão tiver ordem maior do que 1, verificamos se a anterior foi concluída
    if (atividadeAtual.ordem > 1) {
      const atividadeAnterior = await Atividade.findOne({
        turma: atividadeAtual.turma,
        ordem: atividadeAtual.ordem - 1
      });

      if (atividadeAnterior) {
        const progressoAnterior = await ProgressoAtividade.findOne({
          aluno: alunoId,
          atividade: atividadeAnterior._id,
          status: 'concluida'
        });

        if (!progressoAnterior) {
          return res.status(403).json({
            sucesso: false,
            mensagem: 'Acesso negado. Você precisa concluir a missão anterior antes de avançar para esta atividade.'
          });
        }
      }
    }

    // lógica de guardar ou atualizar o ProgressoAtividade como concluída
    let progresso = await ProgressoAtividade.findOne({ aluno: alunoId, atividade: atividadeId });
    
    if (!progresso) {
      progresso = new ProgressoAtividade({
        aluno: alunoId,
        atividade: atividadeId,
        status: 'concluida',
        concluidaEm: new Date()
      });
    } else {
      progresso.status = 'concluida';
      progresso.concluidaEm = new Date();
    }

    await progresso.validate();
    await progresso.save();

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Atividade concluída e progresso atualizado com sucesso!',
      progresso
    });
  } catch (error) {
    return next(error);
  }
};