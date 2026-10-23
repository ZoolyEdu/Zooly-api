# Saldo e movimentações de moedas

## Regra de recompensa

Uma primeira transição do progresso de uma atividade publicada para `concluida` concede 10 moedas. O valor pode ser substituído por `MOEDAS_RECOMPENSA_CONCLUSAO`, que deve conter um inteiro positivo. Repetir a conclusão não cria outro ganho. Progresso que já estava concluído antes desta funcionalidade não recebe uma recompensa retroativa.

A recompensa efetiva é gravada na movimentação com sua quantidade e referência da atividade. Alterações posteriores na atividade não recalculam nem removem essa movimentação. Um índice único parcial impede mais de um ganho associado à mesma combinação aluno/atividade.

## Saldo e gastos

O saldo não é armazenado no aluno. É calculado pela soma de `ganho` menos `gasto` no histórico de `MovimentacaoMoeda`. Somente inteiros positivos são aceitos como quantidade. A rota de gastos usa a identidade do token e retorna `409` quando o saldo não cobre a operação.

Rotas para alunos autenticados:

- `GET /api/moedas/saldo`: retorna o saldo derivado do ledger.
- `GET /api/moedas/movimentacoes?pagina=1&limite=50`: lista as movimentações mais recentes; o limite padrão é 100 e o máximo permitido é 100. Use `pagina` para percorrer o histórico completo.
- `POST /api/moedas/gastos`, corpo `{ "quantidade": 5, "motivo": "Item cosmético" }`: registra um gasto do próprio aluno.

O cliente não envia `aluno`, saldo calculado ou recompensa. Movimentações de ganho só são produzidas pelo fluxo de conclusão no servidor.

## Concorrência e requisito operacional

Gastos e conclusão/recompensa são gravados em transação MongoDB. Cada operação incrementa `Aluno.versaoMovimentacoesMoeda` dentro da mesma transação: esse campo é somente um marcador de serialização, não um saldo ou cópia do ledger. A gravação comum do documento do aluno faz transações concorrentes para o mesmo aluno entrarem em conflito e serem repetidas com leitura atualizada; o saldo insuficiente é então rejeitado. A atualização do progresso e o ganho são confirmados ou revertidos juntos.

O banco precisa suportar transações (replica set ou cluster sharded). Em MongoDB standalone, as rotas de escrita retornam `503`; não há fallback sem transação que possa permitir saldo negativo ou progresso concluído sem recompensa. Este repositório não executa migração nem valida configuração de banco real. Antes da implantação, confirme suporte a transações e criação dos índices Mongoose, especialmente `uma_recompensa_por_atividade_aluno`.
