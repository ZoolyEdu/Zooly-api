import { Router } from 'express';
import mongoose from 'mongoose';
import Atividade from '../models/Atividade.js';
import Historia from '../models/Historia.js';
import Turma from '../models/Turma.js';
import autenticarToken from '../middlewares/autenticarToken.js';
import autorizarPerfil from '../middlewares/autorizarPerfil.js';

const router = Router();
const camposAtividadeEntrada = ['turma', 'titulo', 'historia', 'questoes', 'prazo'];

router.use(autenticarToken, autorizarPerfil('professor'));

function ehObjeto(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

function temCampoDesconhecido(objeto, camposPermitidos) {
  return Object.keys(objeto).some(campo => !camposPermitidos.includes(campo));
}

function rejeitarRequisicao(res, mensagem) {
  return res.status(400).json({ sucesso: false, mensagem });
}

function prazoDeEntradaValido(prazo) {
  return prazo === undefined || prazo === null ||
    (typeof prazo === 'string' && Number.isFinite(Date.parse(prazo)));
}

function validarCamposAninhados(body, { permitirIdsSubdocumentos = false } = {}) {
  if (!ehObjeto(body.historia) || temCampoDesconhecido(body.historia, ['tipo', 'historiaId', 'texto'])) {
    return false;
  }

  if (Object.hasOwn(body, 'questoes') && !Array.isArray(body.questoes)) {
    return false;
  }

  for (const questao of body.questoes ?? []) {
    const camposQuestao = permitirIdsSubdocumentos
      ? ['_id', 'enunciado', 'alternativas', 'respostasCorretas']
      : ['enunciado', 'alternativas', 'respostasCorretas'];
    if (!ehObjeto(questao) || temCampoDesconhecido(questao, camposQuestao)) {
      return false;
    }

    if (Object.hasOwn(questao, '_id') && !mongoose.isValidObjectId(questao._id)) {
      return false;
    }

    if (Object.hasOwn(questao, 'alternativas') && !Array.isArray(questao.alternativas)) {
      return false;
    }

    for (const alternativa of questao.alternativas ?? []) {
      if (
        !ehObjeto(alternativa) ||
        temCampoDesconhecido(alternativa, ['_id', 'texto']) ||
        (Object.hasOwn(alternativa, '_id') && !mongoose.isValidObjectId(alternativa._id))
      ) {
        return false;
      }
    }

    if (Object.hasOwn(questao, 'respostasCorretas') && !Array.isArray(questao.respostasCorretas)) {
      return false;
    }
  }

  return true;
}

function validarCorpoEdicao(body) {
  return ehObjeto(body) &&
    !temCampoDesconhecido(body, ['titulo', 'historia', 'questoes', 'prazo']) &&
    typeof body.titulo === 'string' &&
    Boolean(body.titulo.trim()) &&
    prazoDeEntradaValido(body.prazo) &&
    Object.hasOwn(body, 'historia') &&
    Object.hasOwn(body, 'questoes') &&
    Array.isArray(body.questoes) &&
    validarCamposAninhados(body, { permitirIdsSubdocumentos: true });
}

function idsSubdocumentosPertencemAtividade(questoesEntrada, atividade) {
  const questoesExistentes = new Map(
    atividade.questoes.map(questao => [String(questao._id), questao])
  );
  const idsQuestoesEnviadas = new Set();

  for (const questaoEntrada of questoesEntrada) {
    const idQuestao = questaoEntrada._id ? String(questaoEntrada._id) : null;
    const questaoExistente = idQuestao ? questoesExistentes.get(idQuestao) : null;

    if (idQuestao && (!questaoExistente || idsQuestoesEnviadas.has(idQuestao))) {
      return false;
    }
    if (idQuestao) idsQuestoesEnviadas.add(idQuestao);

    const alternativasExistentes = new Set(
      (questaoExistente?.alternativas ?? []).map(alternativa => String(alternativa._id))
    );
    const idsAlternativasEnviadas = new Set();

    for (const alternativa of questaoEntrada.alternativas ?? []) {
      if (!Object.hasOwn(alternativa, '_id')) continue;

      const idAlternativa = String(alternativa._id);
      if (!questaoExistente || !alternativasExistentes.has(idAlternativa) || idsAlternativasEnviadas.has(idAlternativa)) {
        return false;
      }
      idsAlternativasEnviadas.add(idAlternativa);
    }
  }

  return true;
}

function aplicarRespostasPorIndice(atividade, questoesEntrada) {
  for (const [indiceQuestao, questaoEntrada] of questoesEntrada.entries()) {
    const respostas = questaoEntrada.respostasCorretas ?? [];
    if (!respostas.some(resposta => typeof resposta === 'number')) continue;

    const questao = atividade.questoes[indiceQuestao];
    const respostasResolvidas = respostas.map(resposta => {
      if (typeof resposta !== 'number') return resposta;
      if (!Number.isInteger(resposta) || resposta < 0 || resposta >= questao.alternativas.length) return null;
      return questao.alternativas[resposta]._id;
    });

    if (respostasResolvidas.some(resposta => resposta === null)) return false;
    questao.respostasCorretas = respostasResolvidas;
  }

  return true;
}

async function validarHistoriaOficial(historiaEntrada, res) {
  if (historiaEntrada.tipo !== 'oficial') return true;

  if (typeof historiaEntrada.historiaId !== 'string' || !mongoose.isValidObjectId(historiaEntrada.historiaId)) {
    rejeitarRequisicao(res, 'O identificador da história oficial é inválido.');
    return false;
  }

  const historia = await Historia.findById(historiaEntrada.historiaId);
  if (!historia) {
    res.status(404).json({ sucesso: false, mensagem: 'História oficial não encontrada.' });
    return false;
  }

  return true;
}

router.post('/', async (req, res, next) => {
  try {
    const body = req.body;

    if (!ehObjeto(body)) {
      return rejeitarRequisicao(res, 'O corpo da requisição deve ser um objeto.');
    }

    if (Object.hasOwn(body, 'status')) {
      return rejeitarRequisicao(res, 'O status inicial da atividade é definido pelo servidor.');
    }

    if (temCampoDesconhecido(body, camposAtividadeEntrada)) {
      return rejeitarRequisicao(res, 'A requisição contém campos não permitidos.');
    }

    if (
      typeof body.turma !== 'string' ||
      !mongoose.isValidObjectId(body.turma) ||
      typeof body.titulo !== 'string' ||
      !body.titulo.trim() ||
      !prazoDeEntradaValido(body.prazo) ||
      !validarCamposAninhados(body)
    ) {
      return rejeitarRequisicao(res, 'Os dados da atividade são inválidos.');
    }

    if (!mongoose.isValidObjectId(req.usuario.id)) {
      return res.status(401).json({ sucesso: false, mensagem: 'Professor não encontrado.' });
    }

    const atividade = new Atividade({
      turma: body.turma,
      professorCriador: req.usuario.id,
      titulo: body.titulo,
      historia: body.historia,
      questoes: body.questoes,
      status: 'rascunho',
      prazo: body.prazo ?? null
    });

    await atividade.validate();

    const turma = await Turma.findById(body.turma);
    if (!turma || turma.arquivada) {
      return res.status(404).json({ sucesso: false, mensagem: 'Turma não encontrada ou arquivada.' });
    }

    if (String(turma.professorResponsavel) !== String(req.usuario.id)) {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Somente o professor responsável pela turma pode criar atividades.'
      });
    }

    if (!await validarHistoriaOficial(body.historia, res)) return;

    await atividade.save();

    return res.status(201).json({
      sucesso: true,
      mensagem: 'Atividade criada com sucesso.',
      atividade
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/publicadas', async (req, res, next) => {
  try {
    const atividades = await Atividade.find({ status: 'publicada' })
      .sort({ publicadoEm: 1, _id: 1 });
    return res.status(200).json({ sucesso: true, atividades });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id/publicar', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return rejeitarRequisicao(res, 'O identificador da atividade é inválido.');
    }
    if (req.body !== undefined && (!ehObjeto(req.body) || Object.keys(req.body).length > 0)) {
      return rejeitarRequisicao(res, 'A publicação não aceita campos enviados pelo cliente.');
    }

    const atividade = await Atividade.findById(req.params.id);
    if (!atividade) {
      return res.status(404).json({ sucesso: false, mensagem: 'Atividade não encontrada.' });
    }
    if (String(atividade.professorCriador) !== String(req.usuario.id)) {
      return res.status(403).json({ sucesso: false, mensagem: 'Somente o autor pode publicar esta atividade.' });
    }
    if (atividade.status !== 'rascunho') {
      return res.status(409).json({ sucesso: false, mensagem: 'Somente rascunhos podem ser publicados.' });
    }

    atividade.status = 'publicada';
    atividade.publicadoEm = new Date();
    await atividade.validate();
    await atividade.save();

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Atividade publicada com sucesso.',
      atividade
    });
  } catch (error) {
    return next(error);
  }
});

function pathsReferenciandoAtividade(schema, prefixo = '') {
  const paths = [];
  schema.eachPath((path, tipo) => {
    const caminho = `${prefixo}${path}`;
    const refsAtividade = tipo.options?.ref === 'Atividade' ||
      tipo.caster?.options?.ref === 'Atividade' ||
      tipo.$embeddedSchemaType?.options?.ref === 'Atividade';
    if (refsAtividade) paths.push(caminho);
    if (tipo.schema) paths.push(...pathsReferenciandoAtividade(tipo.schema, `${caminho}.`));
  });
  return paths;
}

async function existeDadoRelacionado(atividadeId) {
  for (const nomeModelo of mongoose.modelNames()) {
    if (nomeModelo === Atividade.modelName) continue;
    const Modelo = mongoose.model(nomeModelo);
    for (const path of pathsReferenciandoAtividade(Modelo.schema)) {
      if (await Modelo.exists({ [path]: atividadeId })) return true;
    }
  }
  return false;
}

router.delete('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return rejeitarRequisicao(res, 'O identificador da atividade é inválido.');
    }

    const atividade = await Atividade.findById(req.params.id);
    if (!atividade) {
      return res.status(404).json({ sucesso: false, mensagem: 'Atividade não encontrada.' });
    }
    if (String(atividade.professorCriador) !== String(req.usuario.id)) {
      return res.status(403).json({ sucesso: false, mensagem: 'Somente o autor pode excluir esta atividade.' });
    }
    if (await existeDadoRelacionado(atividade._id)) {
      return res.status(409).json({
        sucesso: false,
        mensagem: 'A atividade possui registros relacionados e não pode ser excluída.'
      });
    }

    await atividade.deleteOne();
    return res.status(200).json({ sucesso: true, mensagem: 'Atividade excluída com sucesso.' });
  } catch (error) {
    return next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return rejeitarRequisicao(res, 'O identificador da atividade é inválido.');
    }

    const atividade = await Atividade.findById(req.params.id);
    if (!atividade) {
      return res.status(404).json({ sucesso: false, mensagem: 'Atividade não encontrada.' });
    }

    if (String(atividade.professorCriador) !== String(req.usuario.id)) {
      return res.status(403).json({ sucesso: false, mensagem: 'Somente o autor pode editar esta atividade.' });
    }

    const body = req.body;
    if (!validarCorpoEdicao(body)) {
      return rejeitarRequisicao(res, 'Os dados da atividade são inválidos ou contêm campos não permitidos.');
    }

    if (!idsSubdocumentosPertencemAtividade(body.questoes, atividade)) {
      return rejeitarRequisicao(res, 'Os IDs enviados devem pertencer aos subdocumentos correspondentes desta atividade.');
    }

    // Substitui o conjunto editável; turma, autor e status permanecem intactos.
    atividade.titulo = body.titulo;
    atividade.historia = body.historia;
    atividade.prazo = body.prazo ?? null;
    atividade.questoes = body.questoes.map(questao => ({ ...questao, respostasCorretas: [] }));
    if (!aplicarRespostasPorIndice(atividade, body.questoes)) {
      return rejeitarRequisicao(res, 'O índice de uma resposta correta não corresponde a uma alternativa.');
    }
    for (const [indiceQuestao, questaoEntrada] of body.questoes.entries()) {
      const respostas = questaoEntrada.respostasCorretas ?? [];
      if (!respostas.some(resposta => typeof resposta === 'number')) {
        atividade.questoes[indiceQuestao].respostasCorretas = respostas;
      }
    }
    await atividade.validate();

    if (!await validarHistoriaOficial(body.historia, res)) return;

    await atividade.save();
    return res.status(200).json({
      sucesso: true,
      mensagem: 'Atividade atualizada com sucesso.',
      atividade
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
