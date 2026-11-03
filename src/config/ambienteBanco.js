export const BANCO_DEMO = "zooly_demo";

function erroAmbiente(mensagem) {
  const erro = new Error(mensagem);
  erro.code = "AMBIENTE_BANCO_INVALIDO";
  return erro;
}
export function validarAmbienteBanco(
  dbName,
  ambiente = process.env.ZOOLY_AMBIENTE,
) {
  const ambienteAtual = ambiente?.trim() ?? "";

  if (ambienteAtual && ambienteAtual !== "demo") {
    throw erroAmbiente('ZOOLY_AMBIENTE aceita somente o valor "demo".');
  }
  if (ambienteAtual === "demo" && dbName !== BANCO_DEMO) {
    throw erroAmbiente(
      `O ambiente de demonstração só pode usar o banco ${BANCO_DEMO}.`,
    );
  }
  if (!ambienteAtual && dbName.toLowerCase() === BANCO_DEMO) {
    throw erroAmbiente(`O banco ${BANCO_DEMO} exige ZOOLY_AMBIENTE=demo.`);
  }
}
