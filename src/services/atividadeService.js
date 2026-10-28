import mongoose from 'mongoose';
import Atividade from '../models/Atividade.js';
import Historia from '../models/Historia.js';
import Professor from '../models/Professor.js';
import Turma from '../models/Turma.js';

const camposAtividadeEntrada = ['turma', 'titulo', 'ordem', 'historia', 'questoes', 'prazo', 'recompensaMoedas'];

function recompensaValida(valor) {
  return Number.isSafeInteger(valor) && valor >= 1;
}

function ehObjeto(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

function temCampoDesconhecido(objeto, camposPermitidos) {
  return Object.keys(objeto).some(campo => !camposPermitidos.includes(campo));
}

function prazoDeEntradaValido(prazo) {
  return prazo === undefined || prazo === null ||
    (typeof prazo === 'string' && Number.isFinite(Date.parse(prazo)));
}

function validarCamposAninhados(body, { permitirIdsSubdocumentos = false } = {}) {
  if (!ehObjeto(body.historia) || temCampoDesconhecido(body.historia, ['tipo', 'historiaId', 'texto'])) {
    return false;
  }

  if (Object.hasOwn(body, 'questoes') && !Array.isArray(body.questoes)) return false;

  for (const questao of body.questoes ?? []) {
    const camposQuestao = permitirIdsSubdocumentos
      ? ['_id', 'enunciado', 'alternativas', 'respostasCorretas']
      : ['enunciado', 'alternativas', 'respostasCorretas'];
    if (!ehObjeto(questao) || temCampoDesconhecido(questao, camposQuestao)) return false;

    if (Object.hasOwn(questao, '_id') && !mongoose.isValidObjectId(questao._id)) return false;
    if (Object.hasOwn(questao, 'alternativas') && !Array.isArray(questao.alternativas)) return false;

    for (const alternativa of questao.alternativas ?? []) {
      if (
        !ehObjeto(alternativa) ||
        temCampoDesconhecido(alternativa, ['_id', 'texto']) ||
        (Object.hasOwn(alternativa, '_id') && !mongoose.isValidObjectId(alternativa._id))
      ) return false;
    }

    if (Object.hasOwn(questao, 'respostasCorretas') && !Array.isArray(questao.respostasCorretas)) return false;
  }

  return true;
}

function validarCorpoEdicao(body) {
  return ehObjeto(body) &&
    !temCampoDesconhecido(body, ['titulo', 'ordem', 'historia', 'questoes', 'prazo', 'recompensaMoedas']) &&
    typeof body.titulo === 'string' &&
    Boolean(body.titulo.trim()) &&
    (body.ordem === undefined || (typeof body.ordem === 'number' && Number.isInteger(body.ordem) && body.ordem >= 1)) &&
    (body.recompensaMoedas === undefined || recompensaValida(body.recompensaMoedas)) &&
    prazoDeEntradaValido(body.prazo) &&
    Object.hasOwn(body, 'historia') &&
    Object.hasOwn(body, 'questoes') &&
    Array.isArray(body.questoes) &&
    validarCamposAninhados(body, { permitirIdsSubdocumentos: true });
}

function idsSubdocumentosPertencemAtividade(questoesEntrada, atividade) {
  const questoesExistentes = new Map(atividade.questoes.map(questao => [String(questao._id), questao]));
  const idsQuestoesEnviadas = new Set();

  for (const questaoEntrada of questoesEntrada) {
    const idQuestao = questaoEntrada._id ? String(questaoEntrada._id) : null;
    const questaoExistente = idQuestao ? questoesExistentes.get(idQuestao) : null;

    if (idQuestao && (!questaoExistente || idsQuestoesEnviadas.has(idQuestao))) return false;
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

async function validarHistoriaOficial(historiaEntrada) {
  if (historiaEntrada.tipo !== 'oficial') return { valida: true };

  if (typeof historiaEntrada.historiaId !== 'string' || !mongoose.isValidObjectId(historiaEntrada.historiaId)) {
    return { erro: 'historia-id-invalido' };
  }

  const historia = await Historia.findById(historiaEntrada.historiaId);
  if (!historia) return { erro: 'historia-nao-encontrada' };
  return { valida: true };
}

async function proximaOrdemDisponivel(turmaId) {
  const atividades = await Atividade.find({ turma: turmaId }).select('ordem');
  const maiorOrdem = atividades.reduce((maior, atividade) => {
    const ordem = Number(atividade.ordem);
    return Number.isInteger(ordem) && ordem > maior ? ordem : maior;
  }, 0);
  return maiorOrdem + 1;
}

function removerRespostasCorretas(valor) {
  if (Array.isArray(valor)) return valor.map(removerRespostasCorretas);
  if (!valor || typeof valor !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(valor))) {
    return valor;
  }

  return Object.fromEntries(Object.entries(valor)
    .filter(([campo]) => campo !== 'respostasCorretas')
    .map(([campo, conteudo]) => [campo, removerRespostasCorretas(conteudo)]));
}

async function criar({ body, professorId }) {
  if (!ehObjeto(body)) return { erro: 'corpo-deve-ser-objeto' };
  if (Object.hasOwn(body, 'status')) return { erro: 'status-inicial-protegido' };
  if (temCampoDesconhecido(body, camposAtividadeEntrada)) return { erro: 'campos-nao-permitidos' };

  if (
    typeof body.turma !== 'string' ||
    !mongoose.isValidObjectId(body.turma) ||
    typeof body.titulo !== 'string' ||
    !body.titulo.trim() ||
    (body.ordem !== undefined && (typeof body.ordem !== 'number' || !Number.isInteger(body.ordem) || body.ordem < 1)) ||
    (body.recompensaMoedas !== undefined && !recompensaValida(body.recompensaMoedas)) ||
    !prazoDeEntradaValido(body.prazo) ||
    !validarCamposAninhados(body)
  ) return { erro: 'dados-atividade-invalidos' };

  if (!mongoose.isValidObjectId(professorId)) return { erro: 'professor-nao-encontrado' };

  const atividade = new Atividade({
    turma: body.turma,
    professorCriador: professorId,
    titulo: body.titulo,
    ordem: body.ordem !== undefined ? body.ordem : 1,
    historia: body.historia,
    questoes: body.questoes,
    status: 'rascunho',
    prazo: body.prazo ?? null
  });
  if (body.recompensaMoedas !== undefined) atividade.recompensaMoedas = body.recompensaMoedas;

  await atividade.validate();

  const turma = await Turma.findById(body.turma);
  if (!turma || turma.arquivada) return { erro: 'turma-nao-encontrada' };
  if (String(turma.professorResponsavel) !== String(professorId)) return { erro: 'professor-nao-responsavel' };

  const historia = await validarHistoriaOficial(body.historia);
  if (historia.erro) return historia;

  const ordemManual = body.ordem !== undefined;
  if (ordemManual && await Atividade.exists({ turma: body.turma, ordem: body.ordem })) {
    return { erro: 'ordem-ocupada' };
  }

  const maxTentativas = ordemManual ? 1 : 5;
  for (let tentativa = 0; tentativa < maxTentativas; tentativa += 1) {
    atividade.ordem = ordemManual ? body.ordem : await proximaOrdemDisponivel(body.turma);
    try {
      await atividade.save();
      break;
    } catch (error) {
      if (error.code !== 11000) throw error;
      if (ordemManual) return { erro: 'ordem-ocupada' };
      if (tentativa === maxTentativas - 1) return { erro: 'ordem-nao-reservada' };
    }
  }

  return { atividade };
}

async function listarPublicadas(professorId) {
  const professor = await Professor.findById(professorId).select('escolas');
  if (!professor) return { erro: 'professor-nao-encontrado' };

  const escolas = (professor.escolas ?? []).map(escola => escola?._id ?? escola);
  const turmas = await Turma.find({ escola: { $in: escolas }, arquivada: false })
    .select('_id escola arquivada');
  const escolasPermitidas = new Set(escolas.map(String));
  const turmaIds = turmas
    .filter(turma => !turma.arquivada && escolasPermitidas.has(String(turma.escola)))
    .map(turma => turma._id);

  if (turmaIds.length === 0) return { atividades: [] };

  const atividades = await Atividade.find({ status: 'publicada', turma: { $in: turmaIds } })
    .select({ 'questoes.respostasCorretas': 0 })
    .sort({ publicadoEm: 1, _id: 1 });

  return {
    atividades: atividades.map(atividade => removerRespostasCorretas(
      typeof atividade.toObject === 'function' ? atividade.toObject() : atividade
    ))
  };
}

async function publicar({ atividadeId, professorId, body }) {
  if (!mongoose.isValidObjectId(atividadeId)) return { erro: 'atividade-id-invalido' };
  if (body !== undefined && (!ehObjeto(body) || Object.keys(body).length > 0)) return { erro: 'publicacao-com-campos' };

  const atividade = await Atividade.findById(atividadeId);
  if (!atividade) return { erro: 'atividade-nao-encontrada' };
  if (String(atividade.professorCriador) !== String(professorId)) return { erro: 'somente-autor-publica' };
  if (atividade.status !== 'rascunho') return { erro: 'somente-rascunho-publica' };

  atividade.status = 'publicada';
  atividade.publicadoEm = new Date();
  await atividade.validate();
  await atividade.save();
  return { atividade };
}

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

async function referenciasDaAtividade(atividadeId, sessao) {
  const referencias = [];
  for (const nomeModelo of mongoose.modelNames()) {
    if (nomeModelo === Atividade.modelName) continue;
    const Modelo = mongoose.model(nomeModelo);
    for (const path of pathsReferenciandoAtividade(Modelo.schema)) {
      let consulta = Modelo.exists({ [path]: atividadeId });
      if (sessao && typeof consulta.session === 'function') consulta = consulta.session(sessao);
      if (await consulta) referencias.push({ Modelo, path });
    }
  }
  return referencias;
}

function erroHttp(mensagem, status) {
  const erro = new Error(mensagem);
  erro.status = status;
  return erro;
}

function transacoesIndisponiveis(erro) {
  return erro?.code === 20 || erro?.code === 303 ||
    /transaction numbers are only allowed|replica set|transactions are not supported/i.test(erro?.message ?? '');
}

async function excluir({ atividadeId, professorId }) {
  if (!mongoose.isValidObjectId(atividadeId)) return { erro: 'atividade-id-invalido' };

  const atividade = await Atividade.findById(atividadeId);
  if (!atividade) return { erro: 'atividade-nao-encontrada' };
  if (String(atividade.professorCriador) !== String(professorId)) return { erro: 'somente-autor-exclui' };
  const referencias = await referenciasDaAtividade(atividade._id);
  if (referencias.length === 0) {
    await atividade.deleteOne();
    return { excluida: true };
  }

  if (referencias.some(({ Modelo }) => !['ProgressoAtividade', 'MovimentacaoMoeda'].includes(Modelo.modelName))) {
    return { erro: 'atividade-com-registros' };
  }

  let sessao;
  try {
    sessao = await mongoose.startSession();
    await sessao.withTransaction(async () => {
      const referenciasAtuais = await referenciasDaAtividade(atividade._id, sessao);
      if (referenciasAtuais.some(({ Modelo }) => !['ProgressoAtividade', 'MovimentacaoMoeda'].includes(Modelo.modelName))) {
        throw erroHttp('A atividade possui referências que não podem ser removidas com segurança.', 409);
      }

      for (const { Modelo, path } of referenciasAtuais) {
        const filtro = { [path]: atividade._id };
        if (Modelo.modelName === 'MovimentacaoMoeda') {
          await Modelo.updateMany(filtro, { $unset: { [path]: 1 } }, { session: sessao });
        } else {
          await Modelo.deleteMany(filtro, { session: sessao });
        }
      }
      await atividade.deleteOne({ session: sessao });
    });
  } catch (erro) {
    if (transacoesIndisponiveis(erro)) {
      throw erroHttp('A exclusão com registros relacionados exige MongoDB com suporte a transações.', 503);
    }
    throw erro;
  } finally {
    if (sessao) await sessao.endSession();
  }

  return { excluida: true };
}

async function atualizar({ atividadeId, professorId, body }) {
  if (!mongoose.isValidObjectId(atividadeId)) return { erro: 'atividade-id-invalido' };

  const atividade = await Atividade.findById(atividadeId);
  if (!atividade) return { erro: 'atividade-nao-encontrada' };
  if (String(atividade.professorCriador) !== String(professorId)) return { erro: 'somente-autor-edita' };
  if (!validarCorpoEdicao(body)) return { erro: 'dados-edicao-invalidos' };
  if (!idsSubdocumentosPertencemAtividade(body.questoes, atividade)) return { erro: 'ids-subdocumentos-invalidos' };

  atividade.titulo = body.titulo;
  if (body.ordem !== undefined) atividade.ordem = body.ordem;
  atividade.historia = body.historia;
  atividade.prazo = body.prazo ?? null;
  if (body.recompensaMoedas !== undefined) atividade.recompensaMoedas = body.recompensaMoedas;
  atividade.questoes = body.questoes.map(questao => ({ ...questao, respostasCorretas: [] }));
  if (!aplicarRespostasPorIndice(atividade, body.questoes)) return { erro: 'indice-resposta-invalido' };

  for (const [indiceQuestao, questaoEntrada] of body.questoes.entries()) {
    const respostas = questaoEntrada.respostasCorretas ?? [];
    if (!respostas.some(resposta => typeof resposta === 'number')) {
      atividade.questoes[indiceQuestao].respostasCorretas = respostas;
    }
  }
  await atividade.validate();

  const historia = await validarHistoriaOficial(body.historia);
  if (historia.erro) return historia;

  try {
    await atividade.save();
  } catch (error) {
    if (error.code === 11000 && body.ordem !== undefined) return { erro: 'ordem-ocupada' };
    throw error;
  }
  return { atividade };
}

export default { criar, listarPublicadas, publicar, excluir, atualizar };
