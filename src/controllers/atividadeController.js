import Atividade from '../models/Atividade.js';
import ProgressoAtividade from '../models/ProgressoAtividade.js';

export const listarMapaMissoes = async (req, res) => {
  try {
    const { turmaId } = req.params;
    const alunoId = req.usuarioId; 

    const atividades = await Atividade.find({ turma: turmaId, status: 'publicada' }).sort({ ordem: 1 });

    const progressos = await ProgressoAtividade.find({ aluno: alunoId });

    const agora = new Date();

    const mapaMissoes = atividades.map((atividade, index) => {
      const progresso = progressos.find(p => String(p.atividade) === String(atividade._id));
      const concluida = progresso?.status === 'concluida';


      let desbloqueada = false;
      if (index === 0) {
        desbloqueada = true;
      } else {
        const atividadeAnterior = atividades[index - 1];
        const progressoAnterior = progressos.find(p => String(p.atividade) === String(atividadeAnterior._id));
        desbloqueada = progressoAnterior?.status === 'concluida';
      }

     
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

    return res.status(200).json(mapaMissoes);
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro ao carregar o mapa de missões.', erro: error.message });
  }
};

export const concluirAtividade = async (req, res) => {
  try {
    const { atividadeId } = req.params;
    const alunoId = req.usuarioId;

    const atividadeAtual = await Atividade.findById(atividadeId);
    if (!atividadeAtual) {
      return res.status(404).json({ mensagem: 'Atividade não encontrada.' });
    }

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
            mensagem: 'Acesso negado. Você precisa concluir a missão anterior antes de avançar.'
          });
        }
      }
    }


    return res.status(200).json({ mensagem: 'Atividade concluída com sucesso!' });
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro ao concluir atividade.', erro: error.message });
  }
};