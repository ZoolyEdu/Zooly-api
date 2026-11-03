import professorService from "../services/professorService.js";

async function cadastrarProfessor(req, res, next) {
  try {
    const { nome, email, senha, codigoPermanente } = req.body;

    if (
      typeof nome !== "string" ||
      typeof email !== "string" ||
      typeof senha !== "string" ||
      typeof codigoPermanente !== "string" ||
      !nome.trim() ||
      !email.trim() ||
      !senha ||
      !codigoPermanente.trim()
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem:
          "Nome, e-mail, senha e código permanente da escola são obrigatórios.",
      });
    }

    const nomeNormalizado = nome.trim();
    const emailNormalizado = email.trim().toLowerCase();
    const codigoNormalizado = codigoPermanente.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Informe um e-mail válido.",
      });
    }

    if (senha.length < 8) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "A senha deve ter pelo menos 8 caracteres.",
      });
    }

    const professor = await professorService.cadastrar({
      nome: nomeNormalizado,
      email: emailNormalizado,
      senha,
      codigoPermanente: codigoNormalizado,
    });

    return res.status(201).json({
      sucesso: true,
      mensagem: "Professor cadastrado com sucesso.",
      professor: {
        id: professor._id,
        nome: professor.nome,
        email: professor.email,
        escolas: professor.escolas,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        sucesso: false,
        mensagem: "Este e-mail já está cadastrado.",
      });
    }

    if (error.status === 400 || error.status === 409) {
      return res.status(error.status).json({
        sucesso: false,
        mensagem: error.message,
      });
    }

    return next(error);
  }
}

async function obterPerfil(req, res, next) {
  try {
    const professor = await professorService.obterPerfil(req.usuario.id);

    if (!professor) {
      return res.status(401).json({
        sucesso: false,
        mensagem: "Professor não encontrado.",
      });
    }

    return res.status(200).json({
      sucesso: true,
      professor: {
        id: professor._id,
        nome: professor.nome,
        email: professor.email,
        escolas: (professor.escolas ?? []).map((escola) => ({
          id: escola._id,
          nome: escola.nome,
          codigoPermanente: escola.codigoPermanente,
          municipio: escola.municipio,
          endereco: escola.endereco,
          email: escola.email,
          contato: escola.contato,
        })),
      },
    });
  } catch (error) {
    return next(error);
  }
}

export default { cadastrarProfessor, obterPerfil };
