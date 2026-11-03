// Funções de erro usadas por vários controllers e services.

// Resposta de erro padrão da API: { sucesso: false, mensagem }.
export function enviarErro(res, status, mensagem) {
  return res.status(status).json({ sucesso: false, mensagem });
}

// Erro com status HTTP; o middleware de erros do app.js responde com a mensagem.
export function erroHttp(mensagem, status) {
  const erro = new Error(mensagem);
  erro.status = status;
  return erro;
}

// MongoDB sem suporte a transações (servidor isolado, sem replica set).
export function transacoesIndisponiveis(erro) {
  return (
    erro?.code === 20 ||
    erro?.code === 303 ||
    /transaction numbers are only allowed|replica set|transactions are not supported/i.test(
      erro?.message ?? "",
    )
  );
}
