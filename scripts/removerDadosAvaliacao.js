// Remove os dados de avaliação criados por scripts/prepararDadosAvaliacao.js.
//
// Sem --apply, apenas simula (somente leitura): lista exatamente o que seria removido,
// o que foi preservado e por quê.
//   npm run dados:avaliacao:remover -- --professor=<e-mail> --turma-1a=<código> --turma-2b=<código>
// Para remover, são necessárias DUAS confirmações explícitas:
//   ... --apply --banco=zooly --confirmar-remocao
// Se os alunos de avaliação já jogaram, acrescente --incluir-historico para remover
// também o progresso, as tentativas, as moedas e os avatares DELES.
//
// Garantias:
// - Só identifica alunos com RA reservado do plano, na turma e com o nome do plano, e
//   atividades exatamente no formato criado pelo script. Registros alterados são preservados.
// - Nunca remove histórico de alunos reais: se algum usou uma atividade de avaliação,
//   nada é removido.
// - Não remove atividades se houver outras com ordem posterior (sequência do jogo).
// - Remove por _id, numa única transação: ou tudo é removido, ou nada.
// - Não altera turmas, professores, histórias nem senhas.
import "../src/config/carregarEnv.js";
import mongoose from "mongoose";
import {
  BANCO_ESPERADO,
  conectarBancoAvaliacao,
  erroSeguro,
  executarRemocao,
  lerArgumentos,
  mensagemDeErro,
  planejarRemocao,
} from "./avaliacao/dadosAvaliacao.js";

async function executar() {
  const opcoes = lerArgumentos(process.argv, ["confirmar-remocao", "incluir-historico"]);
  if (opcoes.aplicar && (opcoes.banco !== BANCO_ESPERADO || !opcoes["confirmar-remocao"]))
    throw erroSeguro(
      `Para remover, confirme com --banco=${BANCO_ESPERADO} e --confirmar-remocao. Nenhum dado foi alterado.`,
    );

  const { modelos, banco } = await conectarBancoAvaliacao();
  try {
    console.log(`Banco: ${banco}. Modo: ${opcoes.aplicar ? "REMOÇÃO" : "simulação (somente leitura)"}.`);
    const { relatorio, problemas, ids } = await planejarRemocao(modelos, {
      ...opcoes,
      incluirHistorico: opcoes["incluir-historico"],
    });
    console.log(JSON.stringify(relatorio, null, 2));

    if (problemas.length) {
      console.error("Remoção bloqueada:");
      problemas.forEach((p) => console.error(`- ${p}`));
      throw erroSeguro("Nenhum dado foi removido. Resolva os pontos acima e execute de novo.");
    }
    if (!ids.alunos.length && !ids.atividades.length) {
      console.log("Nenhum dado de avaliação encontrado; nada a remover.");
      return;
    }
    if (!opcoes.aplicar) {
      console.log(
        `Simulação concluída; nada foi removido. Use --apply --banco=${BANCO_ESPERADO} --confirmar-remocao para remover.`,
      );
      return;
    }
    const removidos = await executarRemocao(modelos, ids);
    console.log(`Remoção concluída: ${JSON.stringify(removidos)}`);
  } finally {
    await mongoose.disconnect();
  }
}

executar().catch((erro) => {
  console.error(`Remoção interrompida: ${mensagemDeErro(erro)}`);
  process.exitCode = 1;
});
