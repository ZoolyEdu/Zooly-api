import mongoose from "mongoose";
import professorService from "../services/professorService.js";
import adminProfessorService from "../services/adminProfessorService.js";

function dto(professor) {
  if (!professor) return null;
  const escolas = (professor.escolas ?? []).map((escola) => {
    if (escola && typeof escola === "object" && escola._id) {
      return {
        id: String(escola._id),
        nome: escola.nome,
        codigoPermanente: escola.codigoPermanente,
      };
    }
    return { id: String(escola) };
  });
  return {
    id: String(professor._id ?? professor.id),
    nome: professor.nome,
    email: professor.email,
    escolas,
    criadoEm: professor.createdAt ?? null,
    atualizadoEm: professor.updatedAt ?? null,
  };
}

function erroValidacaoCadastro(body) {
  const { nome, email, senha, codigoPermanente } = body ?? {};
  if (
    [nome, email, senha, codigoPermanente].some(
      (valor) => typeof valor !== "string" || !valor.trim(),
    )
  ) {
    return "Nome, e-mail, senha e escola são obrigatórios.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return "Informe um e-mail válido.";
  if (senha.length < 8) return "A senha deve ter pelo menos 8 caracteres.";
  return null;
}

async function listar(req, res, next) {
  try {
    const professores = await adminProfessorService.listar(req.query.busca);
    return res
      .status(200)
      .json({
        sucesso: true,
        total: professores.length,
        professores: professores.map(dto),
      });
  } catch (error) {
    return next(error);
  }
}

async function obterPorId(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res
        .status(400)
        .json({ sucesso: false, mensagem: "ID de professor inválido." });
    const professor = await adminProfessorService.obterPorId(req.params.id);
    if (!professor)
      return res
        .status(404)
        .json({ sucesso: false, mensagem: "Professor não encontrado." });
    return res.status(200).json({ sucesso: true, professor: dto(professor) });
  } catch (error) {
    return next(error);
  }
}

async function cadastrar(req, res, next) {
  try {
    const mensagem = erroValidacaoCadastro(req.body);
    if (mensagem) return res.status(400).json({ sucesso: false, mensagem });
    const professor = await professorService.cadastrar({
      nome: req.body.nome.trim(),
      email: req.body.email.trim().toLowerCase(),
      senha: req.body.senha,
      codigoPermanente: req.body.codigoPermanente.trim(),
    });
    const criado = await adminProfessorService.obterPorId(professor._id);
    return res
      .status(201)
      .json({
        sucesso: true,
        mensagem: "Professor cadastrado com sucesso.",
        professor: dto(criado),
      });
  } catch (error) {
    if (error.code === 11000 || error.status === 409)
      return res
        .status(409)
        .json({ sucesso: false, mensagem: "Este e-mail já está cadastrado." });
    if (error.status === 400)
      return res.status(400).json({ sucesso: false, mensagem: error.message });
    return next(error);
  }
}

async function atualizar(req, res, next) {
  try {
    const { nome, email, senha, codigoPermanente } = req.body ?? {};
    if (!mongoose.isValidObjectId(req.params.id))
      return res
        .status(400)
        .json({ sucesso: false, mensagem: "ID de professor inválido." });
    if (
      Object.hasOwn(req.body ?? {}, "nome") &&
      (typeof nome !== "string" || !nome.trim())
    )
      return res
        .status(400)
        .json({ sucesso: false, mensagem: "Informe o nome do professor." });
    if (
      Object.hasOwn(req.body ?? {}, "email") &&
      (typeof email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    )
      return res
        .status(400)
        .json({ sucesso: false, mensagem: "Informe um e-mail válido." });
    if (
      Object.hasOwn(req.body ?? {}, "senha") &&
      (typeof senha !== "string" || senha.length < 8)
    )
      return res
        .status(400)
        .json({
          sucesso: false,
          mensagem: "A nova senha deve ter pelo menos 8 caracteres.",
        });
    if (
      Object.hasOwn(req.body ?? {}, "codigoPermanente") &&
      (typeof codigoPermanente !== "string" || !codigoPermanente.trim())
    )
      return res
        .status(400)
        .json({ sucesso: false, mensagem: "Selecione uma escola válida." });

    const dados = {};
    if (Object.hasOwn(req.body ?? {}, "nome")) dados.nome = nome.trim();
    if (Object.hasOwn(req.body ?? {}, "email"))
      dados.email = email.trim().toLowerCase();
    if (Object.hasOwn(req.body ?? {}, "senha")) dados.senha = senha;
    if (Object.hasOwn(req.body ?? {}, "codigoPermanente"))
      dados.codigoPermanente = codigoPermanente.trim();
    if (!Object.keys(dados).length)
      return res
        .status(400)
        .json({
          sucesso: false,
          mensagem: "Informe ao menos um campo para atualizar.",
        });

    const resultado = await adminProfessorService.atualizar(
      req.params.id,
      dados,
    );
    if (resultado.erro === "professor-nao-encontrado")
      return res
        .status(404)
        .json({ sucesso: false, mensagem: "Professor não encontrado." });
    if (resultado.erro === "email-duplicado")
      return res
        .status(409)
        .json({ sucesso: false, mensagem: "Este e-mail já está cadastrado." });
    if (resultado.erro === "escola-nao-encontrada")
      return res
        .status(400)
        .json({
          sucesso: false,
          mensagem: "A escola selecionada não foi encontrada.",
        });
    if (resultado.erro === "professor-vinculado")
      return res
        .status(409)
        .json({
          sucesso: false,
          mensagem:
            "Não é possível trocar a escola de um professor que possui turmas vinculadas.",
        });
    return res
      .status(200)
      .json({
        sucesso: true,
        mensagem: "Professor atualizado com sucesso.",
        professor: dto(resultado.professor),
      });
  } catch (error) {
    if (error.code === 11000)
      return res
        .status(409)
        .json({ sucesso: false, mensagem: "Este e-mail já está cadastrado." });
    return next(error);
  }
}

async function excluir(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res
        .status(400)
        .json({ sucesso: false, mensagem: "ID de professor inválido." });
    const resultado = await adminProfessorService.excluir(req.params.id);
    if (resultado.erro === "professor-nao-encontrado")
      return res
        .status(404)
        .json({ sucesso: false, mensagem: "Professor não encontrado." });
    if (resultado.erro === "professor-vinculado")
      return res
        .status(409)
        .json({
          sucesso: false,
          mensagem:
            "Não é possível excluir um professor que possui turmas ou atividades vinculadas.",
        });
    return res
      .status(200)
      .json({ sucesso: true, mensagem: "Professor excluído com sucesso." });
  } catch (error) {
    return next(error);
  }
}

export default { listar, obterPorId, cadastrar, atualizar, excluir };
