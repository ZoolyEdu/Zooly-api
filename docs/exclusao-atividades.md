# Exclusão de atividades e registros relacionados

## Referências encontradas

- `ProgressoAtividade.atividade` referencia a atividade e contém estado, datas e respostas da criança. O desempenho é calculado a partir desse progresso e das questões da atividade; não existe model de desempenho separado.
- `MovimentacaoMoeda.atividade` referencia a atividade em ganhos de conclusão. Essas movimentações formam o ledger que determina o saldo; removê-las altera o saldo.
- A atividade pertence a uma turma. Alunos e turmas não possuem uma referência direta a ela.

## Política pendente

Política definida: ao excluir uma atividade, remover seus documentos `ProgressoAtividade` (incluindo respostas e datas), preservar integralmente cada movimentação e seu valor no ledger, e limpar somente a referência `MovimentacaoMoeda.atividade`. A atividade e as alterações relacionadas são confirmadas na mesma transação. Se o MongoDB não suportar transações, a exclusão falha com `503` sem apagar parcialmente os registros. Referências futuras de modelos não classificadas continuam bloqueando a exclusão com `409`.

Apagar progresso também remove respostas e horários usados nos relatórios. A rota de exclusão não remove registros de outras atividades ou de outros alunos. Os ganhos financeiros preservados deixam de apontar para o documento apagado; sua quantidade, data, motivo, aluno e efeito sobre saldo permanecem.
