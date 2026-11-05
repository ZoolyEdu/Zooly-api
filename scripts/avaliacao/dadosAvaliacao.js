// Lógica compartilhada pelos scripts de dados de avaliação do PI:
//   scripts/prepararDadosAvaliacao.js  (cria)
//   scripts/removerDadosAvaliacao.js   (remove)
//
// Este módulo não conecta ao banco nem lê variáveis de ambiente: recebe os modelos
// já carregados. Assim os testes podem exercitá-lo contra um MongoDB em memória.
//
// Nenhum identificador real (código de turma, e-mail de professor) fica no código:
// eles chegam por argumento de linha de comando. Os alunos e RAs abaixo são fictícios
// e propositalmente marcados ("Teste Avaliação" e RAs numéricos reservados).
import mongoose from "mongoose";

export const BANCO_ESPERADO = "zooly";
export const RECOMPENSA_MOEDAS = 10;
export const PONTOS_POR_QUESTAO = 2;
export const QUESTOES_POR_ATIVIDADE = 5;
export const ETAPAS_MISSAO = ["ler_texto", "responder_perguntas"];

// Cada grupo é associado a uma turma real pelo argumento indicado em `argumento`.
export const PLANO = [
  {
    argumento: "turma-1a",
    rotulo: "1º ano A",
    alunos: [
      { ra: "9990000000001", nomeCompleto: "Ana Teste Avaliação", sexo: "feminino" },
      { ra: "9990000000002", nomeCompleto: "Bruno Teste Avaliação", sexo: "masculino" },
      { ra: "9990000000003", nomeCompleto: "Clara Teste Avaliação", sexo: "feminino" },
      { ra: "9990000000004", nomeCompleto: "Davi Teste Avaliação", sexo: "masculino" },
      { ra: "9990000000005", nomeCompleto: "Eli Teste Avaliação", sexo: "nao_informado" },
    ],
    // _id e chave estáveis das histórias iniciais (src/config/historiasIniciais.js).
    historias: [
      { _id: "6a5f0b000000000000000001", chave: "nego-dagua-rio-ribeira" },
      { _id: "6a5f0b000000000000000002", chave: "curupira-mata-atlantica" },
      { _id: "6a5f0b000000000000000003", chave: "mae-do-ouro-tesouros" },
    ],
  },
  {
    argumento: "turma-2b",
    rotulo: "2º ano B",
    alunos: [
      { ra: "9990000000006", nomeCompleto: "Fernanda Teste Avaliação", sexo: "feminino" },
      { ra: "9990000000007", nomeCompleto: "Gabriel Teste Avaliação", sexo: "masculino" },
      { ra: "9990000000008", nomeCompleto: "Helena Teste Avaliação", sexo: "feminino" },
      { ra: "9990000000009", nomeCompleto: "Igor Teste Avaliação", sexo: "masculino" },
      { ra: "9990000000010", nomeCompleto: "Jade Teste Avaliação", sexo: "nao_informado" },
    ],
    historias: [
      { _id: "6a5f0b000000000000000004", chave: "minhocao-rio-ribeira" },
      { _id: "6a5f0b000000000000000005", chave: "saci-caverna-do-diabo" },
      { _id: "6a5f0b000000000000000006", chave: "protetora-fandangueiros" },
    ],
  },
];

export function erroSeguro(mensagem) {
  const erro = new Error(mensagem);
  erro.safeMessage = true;
  return erro;
}

const mesmoId = (a, b) => a != null && b != null && String(a) === String(b);
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODIGO_VALIDO = /^[A-Z0-9][A-Z0-9-]{2,63}$/;

export function argumento(argv, nome) {
  const prefixo = `--${nome}=`;
  return argv.find((item) => item.startsWith(prefixo))?.slice(prefixo.length);
}

// Lê e valida os argumentos comuns aos dois scripts. Não consulta o banco.
export function lerArgumentos(argv, flagsExtras = []) {
  const faltando = [];
  const invalidos = [];

  const professor = argumento(argv, "professor")?.trim().toLowerCase();
  if (!professor) faltando.push("--professor=<e-mail>");
  else if (!EMAIL_VALIDO.test(professor))
    invalidos.push("--professor precisa ser um e-mail válido");

  const turmas = PLANO.map((grupo) => {
    const codigo = argumento(argv, grupo.argumento)?.trim().toUpperCase();
    if (!codigo) faltando.push(`--${grupo.argumento}=<código permanente>`);
    else if (!CODIGO_VALIDO.test(codigo))
      invalidos.push(`--${grupo.argumento} tem um código de turma inválido`);
    return { ...grupo, codigoPermanente: codigo };
  });

  const codigos = turmas.map((t) => t.codigoPermanente).filter(Boolean);
  if (new Set(codigos).size !== codigos.length)
    invalidos.push("os códigos das turmas precisam ser diferentes");

  if (faltando.length || invalidos.length) {
    const partes = [];
    if (faltando.length) partes.push(`faltando: ${faltando.join(", ")}`);
    if (invalidos.length) partes.push(invalidos.join("; "));
    throw erroSeguro(`Argumentos inválidos (${partes.join(" | ")}). Nenhum dado foi lido nem alterado.`);
  }

  const extras = Object.fromEntries(
    flagsExtras.map((flag) => [flag, argv.includes(`--${flag}`)]),
  );
  return {
    aplicar: argv.includes("--apply"),
    banco: argumento(argv, "banco"),
    professor,
    turmas,
    ...extras,
  };
}

// ---------------------------------------------------------------------------
// Verificações comuns (somente leitura)
// ---------------------------------------------------------------------------

async function verificarProfessor(Professor, email, problemas) {
  const professor = await Professor.findOne({ email }).select("_id").lean();
  if (!professor)
    problemas.push("Professor informado em --professor não foi encontrado.");
  return professor;
}

async function verificarTurma(Turma, grupo, professor, problemas, { exigirSenha }) {
  const turma = await Turma.findOne({ codigoPermanente: grupo.codigoPermanente })
    .select("+senhaAcessoHash")
    .lean();
  if (!turma) {
    problemas.push(`${grupo.rotulo}: turma informada em --${grupo.argumento} não encontrada.`);
    return null;
  }
  if (professor && !mesmoId(turma.professorResponsavel, professor._id))
    problemas.push(`${grupo.rotulo}: a turma não pertence ao professor informado.`);
  if (exigirSenha) {
    if (turma.arquivada) problemas.push(`${grupo.rotulo}: a turma está arquivada.`);
    // Só confere a existência da senha; o hash nunca é exibido nem alterado.
    if (!turma.senhaAcessoHash)
      problemas.push(
        `${grupo.rotulo}: a turma não tem senha de acesso configurada (os alunos não conseguiriam entrar).`,
      );
  }
  return turma;
}

async function verificarHistoria(Historia, referencia, rotulo, problemas) {
  const historia = await Historia.findById(referencia._id).lean();
  if (!historia) {
    problemas.push(`${rotulo}: história ${referencia.chave} não está cadastrada.`);
    return null;
  }
  const falhas = [];
  if (historia.chave !== referencia.chave) falhas.push("chave diferente da esperada");
  if (historia.origem === "professor") falhas.push("não é uma história global");
  if (historia.status !== undefined && historia.status !== "ativa")
    falhas.push(`status "${historia.status}"`);
  if (!historia.titulo?.trim() || !historia.conteudo?.trim())
    falhas.push("título ou conteúdo vazio");

  const perguntas = historia.perguntas ?? [];
  if (perguntas.length < QUESTOES_POR_ATIVIDADE)
    falhas.push(`tem ${perguntas.length} perguntas (são necessárias ${QUESTOES_POR_ATIVIDADE})`);
  perguntas.slice(0, QUESTOES_POR_ATIVIDADE).forEach((pergunta, indice) => {
    const total = pergunta.alternativas?.length ?? 0;
    if (
      !pergunta.enunciado?.trim() ||
      total < 2 ||
      !Number.isInteger(pergunta.alternativaCorreta) ||
      pergunta.alternativaCorreta < 0 ||
      pergunta.alternativaCorreta >= total
    )
      falhas.push(`pergunta ${indice + 1} incompleta ou com gabarito inválido`);
  });

  if (falhas.length) {
    problemas.push(`${rotulo}: história ${referencia.chave}: ${falhas.join("; ")}.`);
    return null;
  }
  return historia;
}

// Critério usado pela preparação para não duplicar: turma + professor + história + título.
export function ehAtividadeDoScript(atividade, turma, professor, historia) {
  return (
    mesmoId(atividade.turma, turma._id) &&
    mesmoId(atividade.professorCriador, professor._id) &&
    atividade.historia?.tipo === "oficial" &&
    mesmoId(atividade.historia?.historiaId, historia._id) &&
    atividade.titulo === historia.titulo.trim()
  );
}

// Critério estrito usado pela remoção: além do anterior, a atividade precisa estar
// exatamente como o script a cria. Se o professor alterou algo, ela é preservada.
export function atividadeIntactaDoScript(atividade, turma, professor, historia) {
  if (!ehAtividadeDoScript(atividade, turma, professor, historia)) return false;
  const perguntas = historia.perguntas.slice(0, QUESTOES_POR_ATIVIDADE);
  const questoes = atividade.questoes ?? [];
  const etapas = atividade.missao?.etapas ?? [];
  return (
    atividade.recompensaMoedas === RECOMPENSA_MOEDAS &&
    (atividade.habilidadesBncc ?? []).length === 0 &&
    atividade.prazo == null &&
    etapas.length === ETAPAS_MISSAO.length &&
    etapas.every((etapa, i) => etapa === ETAPAS_MISSAO[i]) &&
    questoes.length === QUESTOES_POR_ATIVIDADE &&
    questoes.every(
      (questao, i) =>
        questao.tipo === "multipla_escolha" &&
        questao.pontos === PONTOS_POR_QUESTAO &&
        questao.enunciado === perguntas[i]?.enunciado,
    )
  );
}

// Aluno criado pelo script: RA do plano, na turma informada e com o nome do plano.
function alunoDoScript(aluno, turma, dados) {
  return (
    aluno.ra === dados.ra &&
    mesmoId(aluno.turma, turma._id) &&
    aluno.nomeCompleto === dados.nomeCompleto
  );
}

// ---------------------------------------------------------------------------
// Preparação
// ---------------------------------------------------------------------------

async function planejarAlunos(Aluno, grupo, turma, problemas, relatorio) {
  const aCriar = [];
  for (const dados of grupo.alunos) {
    // RA é único no sistema inteiro: a busca não filtra pela turma.
    const existente = await Aluno.findOne({ ra: dados.ra })
      .select("_id ra nomeCompleto turma")
      .lean();
    if (!existente) {
      aCriar.push(dados);
    } else if (alunoDoScript(existente, turma, dados)) {
      relatorio.alunos.ignorados.push({
        ra: dados.ra,
        turma: grupo.rotulo,
        motivo: "já existe (criado em execução anterior)",
      });
    } else {
      problemas.push(`${grupo.rotulo}: o RA ${dados.ra} já pertence a outro aluno ou a outra turma.`);
    }
  }
  return aCriar;
}

// Converte as perguntas da história (gabarito por índice) em questões da atividade
// (gabarito por ObjectId de alternativa), como exige o modelo Atividade.
function montarQuestoes(historia) {
  return historia.perguntas.slice(0, QUESTOES_POR_ATIVIDADE).map((pergunta) => {
    const alternativas = pergunta.alternativas.map((alternativa) => ({
      _id: new mongoose.Types.ObjectId(),
      texto: alternativa.texto,
    }));
    return {
      _id: new mongoose.Types.ObjectId(),
      tipo: "multipla_escolha",
      enunciado: pergunta.enunciado,
      pontos: PONTOS_POR_QUESTAO,
      alternativas,
      respostasCorretas: [alternativas[pergunta.alternativaCorreta]._id],
    };
  });
}

async function planejarAtividades({ Atividade, Historia }, grupo, turma, professor, problemas, relatorio) {
  const historias = [];
  for (const referencia of grupo.historias) {
    const historia = await verificarHistoria(Historia, referencia, grupo.rotulo, problemas);
    if (historia) historias.push(historia);
  }
  if (historias.length !== grupo.historias.length || !professor) return [];

  const existentes = await Atividade.find({ turma: turma._id })
    .select("_id titulo ordem status turma professorCriador historia.tipo historia.historiaId")
    .lean();

  // O jogo desbloqueia a atividade de ordem N só depois da N-1 publicada e concluída.
  // Para as novas atividades ficarem alcançáveis, as existentes precisam formar a
  // sequência 1..n, toda publicada. Caso contrário, nada é criado nesta turma.
  const ordens = existentes.map((a) => a.ordem).sort((a, b) => a - b);
  const sequenciaContinua = ordens.every(
    (ordem, indice) => Number.isInteger(ordem) && ordem === indice + 1,
  );
  const rascunhos = existentes.filter((a) => a.status !== "publicada");
  if (!sequenciaContinua || rascunhos.length) {
    problemas.push(
      `${grupo.rotulo}: as atividades existentes não formam uma sequência publicada contínua ` +
        `(ordens: [${ordens.join(", ")}]; rascunhos: ${rascunhos.length}). ` +
        "As novas atividades ficariam bloqueadas no jogo; ajuste manualmente antes de continuar.",
    );
    return [];
  }

  let proximaOrdem = ordens.length + 1;
  const aCriar = [];
  for (const historia of historias) {
    const anterior = existentes.find((a) => ehAtividadeDoScript(a, turma, professor, historia));
    if (anterior) {
      relatorio.atividades.ignoradas.push({
        id: String(anterior._id),
        turma: grupo.rotulo,
        titulo: anterior.titulo,
        ordem: anterior.ordem,
        motivo: "já existe (criada em execução anterior)",
      });
      continue;
    }

    const atividade = new Atividade({
      turma: turma._id,
      professorCriador: professor._id,
      titulo: historia.titulo.trim(),
      ordem: proximaOrdem,
      recompensaMoedas: RECOMPENSA_MOEDAS,
      historia: {
        tipo: "oficial",
        historiaId: historia._id,
        // Mesma cópia que atividadeService.prepararHistoria faz ao criar pela API.
        tituloCopia: historia.titulo,
        textoCopia: historia.conteudo,
      },
      missao: { etapas: ETAPAS_MISSAO },
      habilidadesBncc: [],
      questoes: montarQuestoes(historia),
      status: "publicada",
      publicadoEm: new Date(),
      prazo: null,
    });

    // Validação real do modelo (gabarito, publicação, origem da história, etapas...).
    // `validate` não grava nada.
    try {
      await atividade.validate();
    } catch (erro) {
      const campos = Object.keys(erro.errors ?? {}).join(", ") || erro.name;
      problemas.push(`${grupo.rotulo}: atividade "${atividade.titulo}" inválida (${campos}).`);
      continue;
    }

    aCriar.push(atividade);
    proximaOrdem += 1;
  }
  return aCriar;
}

async function gravarPreparacao({ Aluno, Atividade }, planos, relatorio) {
  for (const { grupo, turma, alunos, atividades } of planos) {
    for (const dados of alunos) {
      // Confere de novo logo antes de inserir, caso algo tenha mudado desde a verificação.
      if (await Aluno.exists({ ra: dados.ra }))
        throw erroSeguro(
          `O RA ${dados.ra} passou a existir durante a execução. Nada mais foi gravado; execute de novo.`,
        );
      const aluno = await Aluno.create({
        ra: dados.ra,
        nomeCompleto: dados.nomeCompleto,
        sexo: dados.sexo,
        turma: turma._id,
        cadastroInicialConcluido: true,
      });
      relatorio.alunos.criados.push({ id: String(aluno._id), ra: aluno.ra, turma: grupo.rotulo });
    }

    for (const atividade of atividades) {
      if (await Atividade.exists({ turma: turma._id, ordem: atividade.ordem }))
        throw erroSeguro(
          `${grupo.rotulo}: a ordem ${atividade.ordem} foi ocupada durante a execução. Nada mais foi gravado; execute de novo.`,
        );
      try {
        await atividade.save();
      } catch (erro) {
        if (erro?.code === 11000)
          throw erroSeguro(
            `${grupo.rotulo}: conflito de ordem ao gravar "${atividade.titulo}". Nada mais foi gravado; execute de novo.`,
          );
        throw erro;
      }
      relatorio.atividades.criadas.push({
        id: String(atividade._id),
        turma: grupo.rotulo,
        titulo: atividade.titulo,
        ordem: atividade.ordem,
      });
    }
  }
}

// Verifica tudo e, somente com `aplicar`, insere. Nunca atualiza nem exclui.
export async function prepararDadosAvaliacao(modelos, { professor: email, turmas, aplicar }) {
  const relatorio = {
    modo: aplicar ? "aplicar" : "simulacao",
    turmas: [],
    alunos: { aCriar: [], criados: [], ignorados: [] },
    atividades: { aCriar: [], criadas: [], ignoradas: [] },
  };
  const problemas = [];
  const professor = await verificarProfessor(modelos.Professor, email, problemas);

  const planos = [];
  for (const grupo of turmas) {
    const turma = await verificarTurma(modelos.Turma, grupo, professor, problemas, { exigirSenha: true });
    if (!turma) continue;
    relatorio.turmas.push({
      turma: grupo.rotulo,
      id: String(turma._id),
      alunosExistentes: await modelos.Aluno.countDocuments({ turma: turma._id }),
    });
    const alunos = await planejarAlunos(modelos.Aluno, grupo, turma, problemas, relatorio);
    const atividades = await planejarAtividades(modelos, grupo, turma, professor, problemas, relatorio);
    relatorio.alunos.aCriar.push(
      ...alunos.map((a) => ({ ra: a.ra, nome: a.nomeCompleto, turma: grupo.rotulo })),
    );
    relatorio.atividades.aCriar.push(
      ...atividades.map((a) => ({
        turma: grupo.rotulo,
        titulo: a.titulo,
        ordem: a.ordem,
        questoes: a.questoes.length,
      })),
    );
    planos.push({ grupo, turma, alunos, atividades });
  }

  if (!problemas.length && aplicar) await gravarPreparacao(modelos, planos, relatorio);
  return { relatorio, problemas };
}

// ---------------------------------------------------------------------------
// Remoção
// ---------------------------------------------------------------------------
//
// Identifica SOMENTE o que o script de preparação cria:
// - alunos: RA da lista reservada, na turma informada e com o nome do plano;
// - atividades: na turma informada, do professor informado, com a história oficial
//   do plano e exatamente no formato criado pelo script (atividadeIntactaDoScript).
// Qualquer registro parecido, mas diferente, é listado como preservado e nunca removido.
//
// Bloqueia a remoção quando:
// - algum aluno que NÃO é de avaliação tem progresso, tentativa ou moedas ligados a
//   uma atividade de avaliação (apagar a atividade destruiria histórico real);
// - as atividades de avaliação não são as últimas da turma (sobraria um buraco na
//   sequência e as atividades seguintes ficariam bloqueadas no jogo);
// - os alunos de avaliação têm histórico (progresso, tentativas, moedas, avatares)
//   e --incluir-historico não foi informado.

export async function planejarRemocao(modelos, { professor: email, turmas, incluirHistorico = false }) {
  const { Aluno, Atividade, Historia, ProgressoAtividade, TentativaAtividade, MovimentacaoMoeda, AvatarAluno } =
    modelos;
  const problemas = [];
  const relatorio = {
    alunos: { aRemover: [], preservados: [] },
    atividades: { aRemover: [], preservadas: [] },
    historico: { alunosAvaliacao: {}, outrosAlunos: {} },
  };
  const ids = {
    alunos: [],
    atividades: [],
    ProgressoAtividade: [],
    TentativaAtividade: [],
    MovimentacaoMoeda: [],
    AvatarAluno: [],
  };

  const professor = await verificarProfessor(modelos.Professor, email, problemas);

  for (const grupo of turmas) {
    const turma = await verificarTurma(modelos.Turma, grupo, professor, problemas, { exigirSenha: false });
    if (!turma || !professor) continue;

    const encontrados = await Aluno.find({ ra: { $in: grupo.alunos.map((a) => a.ra) } })
      .select("_id ra nomeCompleto turma")
      .lean();
    for (const dados of grupo.alunos) {
      const aluno = encontrados.find((a) => a.ra === dados.ra);
      if (!aluno) continue;
      if (alunoDoScript(aluno, turma, dados)) {
        ids.alunos.push(aluno._id);
        relatorio.alunos.aRemover.push({ id: String(aluno._id), ra: aluno.ra, turma: grupo.rotulo });
      } else {
        relatorio.alunos.preservados.push({
          ra: aluno.ra,
          motivo: "RA de avaliação em outra turma ou com outro nome; não foi criado por este script",
        });
      }
    }

    const atividadesTurma = await Atividade.find({ turma: turma._id }).lean();
    const daTurma = [];
    for (const referencia of grupo.historias) {
      const historia = await Historia.findById(referencia._id).lean();
      if (!historia?.titulo || !Array.isArray(historia.perguntas)) continue;
      for (const atividade of atividadesTurma) {
        if (!ehAtividadeDoScript(atividade, turma, professor, historia)) continue;
        if (atividadeIntactaDoScript(atividade, turma, professor, historia)) {
          daTurma.push(atividade);
        } else {
          relatorio.atividades.preservadas.push({
            id: String(atividade._id),
            turma: grupo.rotulo,
            titulo: atividade.titulo,
            motivo: "foi alterada depois de criada ou não segue o formato do script",
          });
        }
      }
    }

    if (daTurma.length) {
      const removidas = new Set(daTurma.map((a) => String(a._id)));
      const menorOrdem = Math.min(...daTurma.map((a) => a.ordem));
      const posteriores = atividadesTurma.filter(
        (a) => !removidas.has(String(a._id)) && a.ordem > menorOrdem,
      );
      if (posteriores.length)
        problemas.push(
          `${grupo.rotulo}: há ${posteriores.length} atividade(s) com ordem posterior às de avaliação; ` +
            "removê-las deixaria um buraco na sequência do jogo.",
        );
    }
    for (const atividade of daTurma) {
      ids.atividades.push(atividade._id);
      relatorio.atividades.aRemover.push({
        id: String(atividade._id),
        turma: grupo.rotulo,
        titulo: atividade.titulo,
        ordem: atividade.ordem,
      });
    }
  }

  const historicos = { ProgressoAtividade, TentativaAtividade, MovimentacaoMoeda };
  for (const [nome, Modelo] of Object.entries(historicos)) {
    const deAvaliacao = ids.alunos.length
      ? await Modelo.find({ aluno: { $in: ids.alunos } }).select("_id").lean()
      : [];
    const deOutros = ids.atividades.length
      ? await Modelo.countDocuments({ atividade: { $in: ids.atividades }, aluno: { $nin: ids.alunos } })
      : 0;
    ids[nome] = deAvaliacao.map((d) => d._id);
    relatorio.historico.alunosAvaliacao[nome] = deAvaliacao.length;
    relatorio.historico.outrosAlunos[nome] = deOutros;
    if (deOutros)
      problemas.push(
        `${deOutros} registro(s) de ${nome} de alunos que não são de avaliação usam atividades de avaliação. ` +
          "Removê-las apagaria histórico real; nada será removido.",
      );
  }
  const avatares = ids.alunos.length
    ? await AvatarAluno.find({ aluno: { $in: ids.alunos } }).select("_id").lean()
    : [];
  ids.AvatarAluno = avatares.map((d) => d._id);
  relatorio.historico.alunosAvaliacao.AvatarAluno = avatares.length;

  const totalHistorico =
    ids.ProgressoAtividade.length +
    ids.TentativaAtividade.length +
    ids.MovimentacaoMoeda.length +
    ids.AvatarAluno.length;
  if (totalHistorico && !incluirHistorico)
    problemas.push(
      `Os alunos de avaliação têm ${totalHistorico} registro(s) de histórico (progresso, tentativas, moedas, avatares). ` +
        "Para removê-los junto, informe --incluir-historico.",
    );

  return { relatorio, problemas, ids };
}

// Exclui exatamente os _id planejados, numa transação: ou tudo é removido, ou nada.
export async function executarRemocao(modelos, ids) {
  const { Aluno, Atividade, ProgressoAtividade, TentativaAtividade, MovimentacaoMoeda, AvatarAluno } = modelos;
  const etapas = [
    [ProgressoAtividade, ids.ProgressoAtividade],
    [TentativaAtividade, ids.TentativaAtividade],
    [MovimentacaoMoeda, ids.MovimentacaoMoeda],
    [AvatarAluno, ids.AvatarAluno],
    [Atividade, ids.atividades],
    [Aluno, ids.alunos],
  ];
  const removidos = {};
  const sessao = await mongoose.startSession();
  try {
    await sessao.withTransaction(async () => {
      // Reconfere dentro da transação: se algum aluno real passou a usar uma
      // atividade de avaliação desde o planejamento, nada é removido.
      for (const Modelo of [ProgressoAtividade, TentativaAtividade, MovimentacaoMoeda]) {
        const novos = ids.atividades.length
          ? await Modelo.countDocuments(
              { atividade: { $in: ids.atividades }, aluno: { $nin: ids.alunos } },
              { session: sessao },
            )
          : 0;
        if (novos)
          throw erroSeguro(
            `${Modelo.modelName}: surgiram registros de alunos reais nas atividades de avaliação. Nada foi removido.`,
          );
      }
      for (const [Modelo, lista] of etapas) {
        if (!lista.length) {
          removidos[Modelo.modelName] = 0;
          continue;
        }
        const { deletedCount } = await Modelo.deleteMany({ _id: { $in: lista } }, { session: sessao });
        if (deletedCount !== lista.length)
          throw erroSeguro(
            `${Modelo.modelName}: esperado remover ${lista.length}, mas ${deletedCount} foram encontrados. Nada foi removido.`,
          );
        removidos[Modelo.modelName] = deletedCount;
      }
    });
  } finally {
    await sessao.endSession();
  }
  return removidos;
}

// ---------------------------------------------------------------------------
// Conexão para os scripts de linha de comando
// ---------------------------------------------------------------------------

export async function conectarBancoAvaliacao() {
  const dbName = process.env.MONGODB_DB_NAME?.trim() || BANCO_ESPERADO;
  if (dbName !== BANCO_ESPERADO)
    throw erroSeguro(`Este script só opera no banco "${BANCO_ESPERADO}" (configurado: "${dbName}").`);

  // Não cria índices a partir destes scripts.
  mongoose.set("autoIndex", false);
  const { connectDatabase } = await import("../../src/config/database.js");
  const nomes = [
    "Aluno",
    "Atividade",
    "AvatarAluno",
    "Historia",
    "MovimentacaoMoeda",
    "Professor",
    "ProgressoAtividade",
    "TentativaAtividade",
    "Turma",
  ];
  const modelos = {};
  for (const nome of nomes) {
    modelos[nome] = (await import(`../../src/models/${nome}.js`)).default;
  }

  await connectDatabase();
  const conectado = mongoose.connection.db?.databaseName;
  if (conectado !== BANCO_ESPERADO) {
    await mongoose.disconnect();
    throw erroSeguro(`Banco conectado ("${conectado}") difere de "${BANCO_ESPERADO}". Nada foi alterado.`);
  }
  return { modelos, banco: conectado };
}

export function mensagemDeErro(erro) {
  if (erro.safeMessage) return erro.safeMessage;

  if (erro.code === "AMBIENTE_BANCO_INVALIDO") {
    return erro.message;
  }

  return `falha de banco/execução (${erro.code ?? erro.name ?? "erro"}).`;
}