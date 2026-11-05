// Prepara dados fictícios de avaliação do PI (alunos e atividades publicadas) em duas turmas.
//
// Sem --apply, apenas simula (somente leitura): confere tudo e mostra o que seria criado.
//   npm run dados:avaliacao -- --professor=<e-mail> --turma-1a=<código> --turma-2b=<código>
// Para gravar, acrescente a confirmação explícita do banco de destino:
//   npm run dados:avaliacao -- --professor=<e-mail> --turma-1a=<código> --turma-2b=<código> --apply --banco=zooly
//
// Garantias:
// - Só insere documentos novos (alunos e atividades). Nunca atualiza nem exclui nada.
// - Idempotente: o que já foi criado por uma execução anterior é reconhecido e ignorado.
// - Qualquer inconsistência encontrada na verificação interrompe antes de gravar.
// - Não cria progresso, tentativas nem movimentações de moedas; não toca nas senhas das turmas.
// Para desfazer, veja scripts/removerDadosAvaliacao.js.
import "../src/config/carregarEnv.js";
import mongoose from "mongoose";
import {
  BANCO_ESPERADO,
  conectarBancoAvaliacao,
  erroSeguro,
  lerArgumentos,
  mensagemDeErro,
  prepararDadosAvaliacao,
} from "./avaliacao/dadosAvaliacao.js";

async function executar() {
  const opcoes = lerArgumentos(process.argv);
  if (opcoes.aplicar && opcoes.banco !== BANCO_ESPERADO)
    throw erroSeguro(`Para gravar, confirme o banco com --banco=${BANCO_ESPERADO}. Nenhum dado foi alterado.`);

  const { modelos, banco } = await conectarBancoAvaliacao();
  try {
    console.log(`Banco: ${banco}. Modo: ${opcoes.aplicar ? "GRAVAÇÃO" : "simulação (somente leitura)"}.`);
    const { relatorio, problemas } = await prepararDadosAvaliacao(modelos, opcoes);
    console.log(JSON.stringify(relatorio, null, 2));

    if (problemas.length) {
      console.error("Inconsistências encontradas:");
      problemas.forEach((p) => console.error(`- ${p}`));
      throw erroSeguro("Verificação falhou; nenhum dado foi gravado. Corrija as inconsistências e execute de novo.");
    }
    if (!opcoes.aplicar)
      console.log(`Simulação concluída; nada foi gravado. Use --apply --banco=${BANCO_ESPERADO} para gravar.`);
    else
      console.log(
        `Concluído: ${relatorio.alunos.criados.length} aluno(s) e ${relatorio.atividades.criadas.length} atividade(s) criados.`,
      );
  } finally {
    await mongoose.disconnect();
  }
}

executar().catch((erro) => {
  console.error(`Preparação interrompida: ${mensagemDeErro(erro)}`);
  process.exitCode = 1;
});
