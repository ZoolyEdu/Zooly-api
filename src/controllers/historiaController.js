import historiaService, {
  validarEntradaHistoria,
} from "../services/historiaService.js";

const ERROS = {
  "id-invalido": [400, "ID de história inválido."],
  "nao-encontrada": [404, "História não encontrada."],
  "historia-global-protegida": [
    403,
    "As histórias do Zooly não podem ser alteradas. Crie uma história própria a partir delas.",
  ],
  "historia-arquivada": [
    409,
    "Esta história está arquivada. Reative-a para usar em uma nova atividade.",
  ],
  "historia-em-uso": [
    409,
    "Esta história é usada por uma atividade antiga. Arquive-a em vez de excluir.",
  ],
  "dados-invalidos": [400, "Os dados da história são inválidos."],
};

function responder(res, resultado, sucesso) {
  if (resultado.erro) {
    const [status, mensagem] = ERROS[resultado.erro] ?? [500, "Erro interno."];
    return res.status(status).json({
      sucesso: false,
      mensagem,
      ...(resultado.erros ? { erros: resultado.erros } : {}),
    });
  }
  return sucesso();
}

const manipulador = (fn) => async (req, res, next) => {
  try {
    return await fn(req, res);
  } catch (error) {
    return next(error);
  }
};

const ORIGENS_FILTRO = ["zooly", "professor", "todas"];

const listarHistorias = manipulador(async (req, res) => {
  const origem = req.query.origem ?? "todas";
  if (typeof origem !== "string" || !ORIGENS_FILTRO.includes(origem))
    return res.status(400).json({
      sucesso: false,
      mensagem: "Use origem=zooly, origem=professor ou origem=todas.",
    });
  const historias = await historiaService.listar({
    professorId: req.usuario.id,
    origem,
    incluirArquivadas: req.query.incluirArquivadas === "true",
  });
  return res
    .status(200)
    .json({ sucesso: true, total: historias.length, historias });
});

const obterHistoria = manipulador(async (req, res) => {
  const resultado = await historiaService.obter({
    id: req.params.id,
    professorId: req.usuario.id,
  });
  return responder(res, resultado, () =>
    res.status(200).json({ sucesso: true, historia: resultado.historia }),
  );
});

const obterPerguntas = manipulador(async (req, res) => {
  const resultado = await historiaService.obterPerguntas({
    id: req.params.id,
    professorId: req.usuario.id,
  });
  return responder(res, resultado, () =>
    res.status(200).json({ sucesso: true, ...resultado }),
  );
});

const modeloAtividade = manipulador(async (req, res) => {
  const resultado = await historiaService.modeloAtividade({
    id: req.params.id,
    professorId: req.usuario.id,
  });
  return responder(res, resultado, () =>
    res.status(200).json({ sucesso: true, ...resultado }),
  );
});

// Valida sem salvar: o painel pode conferir o formulário antes de enviar.
const validar = manipulador(async (req, res) => {
  const { erros } = validarEntradaHistoria(req.body);
  return res
    .status(200)
    .json({ sucesso: true, valida: erros.length === 0, erros });
});

const criar = manipulador(async (req, res) => {
  const resultado = await historiaService.criar({
    body: req.body,
    professorId: req.usuario.id,
  });
  return responder(res, resultado, () =>
    res.status(201).json({ sucesso: true, historia: resultado.historia }),
  );
});

const atualizar = manipulador(async (req, res) => {
  const resultado = await historiaService.atualizar({
    id: req.params.id,
    body: req.body,
    professorId: req.usuario.id,
  });
  return responder(res, resultado, () =>
    res.status(200).json({ sucesso: true, historia: resultado.historia }),
  );
});

const arquivar = manipulador(async (req, res) => {
  const resultado = await historiaService.arquivar({
    id: req.params.id,
    professorId: req.usuario.id,
  });
  return responder(res, resultado, () =>
    res.status(200).json({ sucesso: true, historia: resultado.historia }),
  );
});

const reativar = manipulador(async (req, res) => {
  const resultado = await historiaService.reativar({
    id: req.params.id,
    professorId: req.usuario.id,
  });
  return responder(res, resultado, () =>
    res.status(200).json({ sucesso: true, historia: resultado.historia }),
  );
});

const excluir = manipulador(async (req, res) => {
  const resultado = await historiaService.excluir({
    id: req.params.id,
    professorId: req.usuario.id,
  });
  return responder(res, resultado, () =>
    res
      .status(200)
      .json({ sucesso: true, mensagem: "História excluída com sucesso." }),
  );
});

export default {
  listarHistorias,
  obterHistoria,
  obterPerguntas,
  modeloAtividade,
  validar,
  criar,
  atualizar,
  arquivar,
  reativar,
  excluir,
};
