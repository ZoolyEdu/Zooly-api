import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const QUINZE_MINUTOS = 15 * 60 * 1000;
const UMA_HORA = 60 * 60 * 1000;

function limitador({ windowMs, limit, chave, contaComoFalha }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (req, res) => !contaComoFalha(res.statusCode),
    keyGenerator: chave,
    handler: (req, res) =>
      res.status(429).json({
        sucesso: false,
        mensagem:
          "Muitas tentativas sem sucesso. Aguarde alguns minutos e tente novamente.",
      }),
  });
}

function ipDe(req) {
  return ipKeyGenerator(req.ip);
}

function contaDe(req) {
  const conta = req.body?.email ?? req.body?.ra;
  return typeof conta === "string"
    ? conta.trim().toLowerCase().slice(0, 254)
    : "";
}

const credencialErrada = (status) => status === 401;
const porConta = limitador({
  windowMs: QUINZE_MINUTOS,
  limit: 10,
  contaComoFalha: credencialErrada,
  chave: (req) => `conta:${ipDe(req)}:${contaDe(req)}`,
});
const porOrigem = limitador({
  windowMs: QUINZE_MINUTOS,
  limit: 100,
  contaComoFalha: credencialErrada,
  chave: (req) => `origem:${ipDe(req)}`,
});

export const limitarLogin = [porOrigem, porConta];
export const limitarCadastro = limitador({
  windowMs: UMA_HORA,
  limit: 20,
  contaComoFalha: (status) => status === 400 || status === 409,
  chave: (req) => `cadastro:${ipDe(req)}`,
});
