// O modo demonstração foi removido da API: ela trabalha somente com dados reais.
// Esta verificação impede que uma configuração antiga do modo demo seja usada por engano,
// o que faria dados fictícios aparecerem como reais.
const BANCO_DEMO_REMOVIDO = "zooly_demo";

function erroAmbiente(mensagem) {
  const erro = new Error(mensagem);
  erro.code = "AMBIENTE_BANCO_INVALIDO";
  return erro;
}

export function validarAmbienteBanco(
  dbName,
  ambiente = process.env.ZOOLY_AMBIENTE,
) {
  if (ambiente?.trim()) {
    throw erroAmbiente(
      "O modo demonstração foi removido da API. Remova ZOOLY_AMBIENTE da configuração.",
    );
  }
  if (dbName.toLowerCase() === BANCO_DEMO_REMOVIDO) {
    throw erroAmbiente(
      `O banco ${BANCO_DEMO_REMOVIDO} era do modo demonstração, que foi removido. Configure o banco real.`,
    );
  }
}
