# Tentativas de atividade

Cada vez que o aluno joga uma atividade publicada, a API registra uma **tentativa**. Assim, jogar de novo não apaga as respostas anteriores e não muda o desempenho que o professor vê.

## Antes desta mudança

- Havia um único `ProgressoAtividade` por aluno e atividade (índice único `aluno + atividade`).
- `PUT /api/progresso/atividades/:id/respostas` **substituía** `respostas` e `respostasRegistradasEm`, mesmo com a atividade já concluída.
- Ao repetir uma missão, as respostas da primeira vez se perdiam. O percentual de acerto mudava e, no relatório semanal, a atividade passava para a semana da repetição (o filtro usa `respostasRegistradasEm`).
- As moedas já eram concedidas uma única vez, pela transação de `concluirAtividadeComRecompensa` e pelo índice único `uma_recompensa_por_atividade_aluno`. Isso foi mantido.

## Modelo de dados

### `TentativaAtividade` (nova coleção `tentativaatividades`)

| Campo | Tipo | Descrição |
|---|---|---|
| `aluno` | ObjectId → `Aluno` | Sempre o aluno do token. |
| `atividade` | ObjectId → `Atividade` | |
| `progresso` | ObjectId → `ProgressoAtividade` | Resumo ao qual a tentativa pertence. |
| `numeroTentativa` | inteiro ≥ 1 | Sequencial por aluno e atividade. |
| `status` | `em_andamento` \| `concluida` | |
| `oficial` | boolean | `true` só na primeira tentativa concluída. |
| `iniciadaEm` | Date | |
| `concluidaEm` | Date \| null | Obrigatória quando `concluida`; proibida quando `em_andamento`. |
| `respostas` | `[{ questaoId, alternativasSelecionadas }]` | Mesmo subesquema do progresso. |
| `respostasRegistradasEm` | Date \| null | Último envio de respostas nesta tentativa. |
| `origem` | `jogo` \| `progresso_existente` | `progresso_existente`: criada a partir de um progresso anterior ao histórico (migração ou adoção automática). |
| `createdAt`, `updatedAt` | Date | `timestamps` do Mongoose. |

O nome dos campos segue a convenção do projeto (`aluno` e `atividade`, como em `ProgressoAtividade` e `MovimentacaoMoeda`).

Índices:

| Nome | Chave | Garante |
|---|---|---|
| `numero_tentativa_por_aluno_atividade` | `aluno, atividade, numeroTentativa` (único) | Numeração sem repetição. Também atende às consultas de histórico. |
| `uma_tentativa_em_andamento_por_aluno_atividade` | `aluno, atividade` (único, parcial `status: "em_andamento"`) | No máximo uma tentativa aberta. |
| `uma_tentativa_oficial_por_aluno_atividade` | `aluno, atividade, oficial` (único, parcial `oficial: true`) | No máximo uma tentativa oficial. |

### `ProgressoAtividade` (mantido como resumo)

- Continua único por aluno e atividade. `status`, `iniciadaEm` e `concluidaEm` seguem alimentando o mapa e o desbloqueio sequencial.
- Novo campo `tentativaOficial` (ObjectId \| null).
- `respostas` e `respostasRegistradasEm`:
  - **antes da primeira conclusão**, espelham a tentativa em andamento (como antes);
  - **na primeira conclusão**, recebem a cópia da tentativa oficial e não mudam mais.
- Por isso o `desempenhoService` (indicadores, relatório semanal e PDF) não precisou mudar: ele continua lendo o progresso, que agora guarda sempre o resultado oficial.

## Regras de negócio

1. `POST .../iniciar` **retoma** a tentativa em andamento, se existir. Se não existir, abre a próxima (`numeroTentativa` = última + 1).
2. Só pode haver **uma tentativa em andamento** por aluno e atividade. Aberturas simultâneas colidem no índice único, e a API devolve a tentativa que a outra requisição criou.
3. `PUT .../respostas` grava **somente na tentativa em andamento**. Se não houver tentativa aberta (a última já foi concluída), responde `409`. Tentativas concluídas nunca são alteradas.
4. `PATCH .../concluir` conclui a tentativa aberta dentro da transação do aluno, a mesma que concede moedas:
   - **primeira conclusão:** a tentativa vira `oficial`, o progresso é concluído e recebe a cópia das respostas, e a recompensa é registrada;
   - **repetições:** a tentativa é concluída com `oficial: false`, `movimentacao: null` e o saldo não muda;
   - **requisição repetida** (nenhuma tentativa aberta): devolve `200` com a última tentativa, `movimentacao: null` e o saldo atual, sem efeitos.
5. **Concorrência:**
   - a transação incrementa `Aluno.versaoMovimentacoesMoeda`, o que serializa as operações de moedas do aluno;
   - duas conclusões simultâneas nunca enxergam a mesma tentativa aberta;
   - o índice parcial de `oficial` e o índice `uma_recompensa_por_atividade_aluno` são a segunda barreira.
6. **Identidade e acesso:**
   - o aluno sempre vem do token (`sub`);
   - as rotas rejeitam campos extras no corpo;
   - toda operação valida que a atividade está publicada, pertence à turma do aluno e está desbloqueada (as regras de antes).
7. **Cálculo no servidor:** a recompensa vem de `Atividade.recompensaMoedas` e a correção, de `questoes[].respostasCorretas`. O cliente nunca envia pontuação nem moedas.
8. **Progresso anterior ao histórico:** se um progresso não tem nenhuma tentativa, a primeira operação cria a tentativa 1 a partir dele (`origem: "progresso_existente"`, oficial se o progresso já estava concluído). Assim a API funciona antes, durante e depois da migração.
9. **Exclusão de atividade:** `DELETE /api/atividades/:id` apaga as tentativas junto com os progressos. As movimentações de moedas só perdem o vínculo, como antes.

## Endpoints

### Alterados (somente campos acrescentados)

Nenhum campo existente foi removido ou renomeado.

| Endpoint | Perfil | Campos novos na resposta |
|---|---|---|
| `POST /api/progresso/atividades/:atividadeId/iniciar` | aluno | `tentativa`, `tentativaRetomada` (boolean). O status continua `201` quando o progresso é criado e `200` quando já existia. |
| `PUT /api/progresso/atividades/:atividadeId/respostas` | aluno | `tentativa`. Novo erro: `409` quando não há tentativa em andamento. |
| `PATCH /api/progresso/atividades/:atividadeId/concluir` | aluno | `tentativa` |
| `GET /api/progresso`, `GET /api/progresso/atividades/:id` | aluno | `progresso.tentativaOficial` |

Formato de `tentativa`, igual em todas as respostas do aluno e **sem gabarito**:

```json
{
  "id": "…",
  "atividade": "…",
  "numeroTentativa": 2,
  "status": "em_andamento",
  "oficial": false,
  "iniciadaEm": "2026-11-03T13:00:00.000Z",
  "concluidaEm": null,
  "respostasRegistradasEm": null,
  "respostas": [{ "questaoId": "…", "alternativasSelecionadas": ["…"] }]
}
```

### `GET /api/progresso/atividades/:atividadeId/tentativas`

Histórico do próprio aluno numa atividade.

**Autorização:**
- token de **aluno**;
- a atividade precisa estar publicada e pertencer à turma do aluno;
- o aluno vem do token, então não existe parâmetro para consultar outro aluno.

**Respostas:**
- `400`: id inválido;
- `401`: sem token;
- `403`: outro perfil ou outra turma;
- `404`: atividade não publicada ou inexistente;
- `200`:

```json
{
  "sucesso": true,
  "totalTentativas": 2,
  "tentativaOficial": "…",
  "tentativas": [ /* tentativa, em ordem de numeroTentativa */ ]
}
```

Não inclui `respostasCorretas` nem a correção, para não expor o gabarito ao aluno.

### `GET /api/desempenho/alunos/:alunoId/tentativas?atividadeId=…`

Histórico de um aluno para o professor, com correção por questão.

**Autorização:** token de **professor**, que precisa ser o `professorResponsavel` da turma atual do aluno. A turma não pode estar arquivada. É a mesma regra das demais rotas de `/api/desempenho`.

**Parâmetros:**
- `alunoId` (obrigatório);
- `atividadeId` (opcional): filtra uma atividade, que precisa pertencer à turma do aluno.

**Respostas:**
- `400`: id inválido;
- `403`: outro perfil ou professor de outra turma;
- `404`: aluno inexistente, turma arquivada ou atividade fora da turma;
- `200`:

```json
{
  "sucesso": true,
  "turma": { "id": "…", "nome": "1º Ano A" },
  "aluno": { "id": "…", "ra": "…", "nomeCompleto": "…" },
  "atividades": [
    {
      "atividade": { "id": "…", "titulo": "Missão 1", "ordem": 1 },
      "totalTentativas": 2,
      "tentativaOficial": "…",
      "tentativas": [
        {
          "id": "…", "numeroTentativa": 1, "status": "concluida", "oficial": true,
          "iniciadaEm": "…", "concluidaEm": "…", "respostasRegistradasEm": "…",
          "respostas": [
            { "questaoId": "…", "enunciado": "…", "alternativasSelecionadas": ["…"], "correta": true }
          ],
          "acertos": 2, "erros": 0, "percentualAcerto": 100
        }
      ]
    }
  ]
}
```

Detalhes:
- só aparecem as atividades com ao menos uma tentativa;
- `correta` é `null` quando a questão não existe mais na atividade (edição posterior);
- a correção usa o gabarito atual da atividade, como o desempenho já fazia.

Os indicadores de `GET /api/desempenho/turmas/:id`, `/semanal`, `/semanal/pdf` e `/alunos/:id` **não mudaram**: continuam refletindo só a tentativa oficial.

## Compatibilidade com os front-ends

Os endpoints usados pelos dois front-ends foram conferidos no código:

| Front-end | Endpoints usados | Situação |
|---|---|---|
| Zooly-game | `progresso/turma/:id/mapa`, `progresso`, `progresso/atividades/:id/conteudo`, `iniciar`, `respostas`, `concluir` | Mesmos caminhos, corpos e campos. O fluxo atual (iniciar → respostas → concluir) cria uma tentativa por partida automaticamente. |
| Zooly-web | `desempenho/alunos/:id`, `desempenho/turmas/:id/semanal` e `/semanal/pdf` | Sem mudança de contrato. Os números deixam de mudar quando a criança repete uma missão. |

Mudanças de comportamento (intencionais):

- **Respostas depois da conclusão:** responder de novo sem chamar `iniciar` antes agora devolve `409`, em vez de sobrescrever. O Zooly-game sempre chama `iniciar` antes de responder.
- **`updatedAt` do progresso:** repetir uma missão já concluída não altera mais o `updatedAt` do progresso. O Zooly-game usa esse campo nas "atividades recentes" do painel dos responsáveis, que passam a mostrar a data da conclusão oficial.

## Migração

O script [`scripts/migrarTentativas.js`](../scripts/migrarTentativas.js) cria a tentativa 1 para cada progresso que ainda não tem histórico. A lógica fica em `src/services/migracaoTentativas.js`, que é testada.

**O que o script faz:**
- **Não apaga nem altera** respostas, datas, status ou `updatedAt` dos progressos. Só acrescenta `tentativaOficial`.
- Progresso **concluído** vira a tentativa 1 `concluida` e `oficial`, com as mesmas respostas e datas.
- Progresso **iniciado** vira a tentativa 1 `em_andamento`, com as respostas já enviadas. A criança retoma de onde parou.

**Garantias de segurança:**
- **Idempotente:** os pares que já têm tentativas são ignorados, e a criação é um `upsert` na chave única `(aluno, atividade, numeroTentativa = 1)`. Pode ser executado de novo com a API no ar.
- **Simulação:** sem `--apply`, o script só lê e mostra o relatório.
- **Confirmação do banco:** gravar exige `--banco=<MONGODB_DB_NAME>` igual ao configurado. O script também usa `validarAmbienteBanco`, como os demais.
- **Validação:** depois de aplicar, confere cada progresso:
  - existência de tentativas;
  - uma única oficial quando concluído;
  - respostas e datas iguais às do progresso;
  - `tentativaOficial` coerente.
  
  Se encontrar inconsistências, termina com código 1.
- **Recuperação:** `--reverter` remove só as tentativas `origem: "progresso_existente"` e o vínculo `tentativaOficial` delas. As tentativas criadas pelo jogo depois da migração ficam.

**Como executar:**

```bash
# 0. Backup antes de gravar (exemplo)
mongodump --uri="$MONGODB_URI" --db=<banco> --out=backup-antes-tentativas

# 1. Simulação (somente leitura)
npm run migrar:tentativas

# 2. Aplicar (cria os índices da nova coleção e as tentativas, depois valida)
npm run migrar:tentativas -- --apply --banco=<MONGODB_DB_NAME>

# Desfazer, se necessário (simulação e depois aplicação)
npm run migrar:tentativas -- --reverter
npm run migrar:tentativas -- --reverter --apply --banco=<MONGODB_DB_NAME>
```

O script lê o `.env`. Variáveis definidas no terminal têm prioridade. **Revise `MONGODB_URI` e `MONGODB_DB_NAME` antes de aplicar.**

A migração é opcional para o funcionamento (ver a adoção automática na regra 8), mas é recomendada: com ela, o histórico do professor mostra todos os progressos antigos desde o início.

**Limite conhecido:** respostas sobrescritas antes desta versão não podem ser recuperadas. O histórico vale a partir da implantação.

## Testes

```bash
npm test                                 # suíte completa
node --test test/tentativas.test.js      # só o histórico de tentativas
```

`test/tentativas.test.js` é de **integração real**:
- sobe um MongoDB em memória em replica set (`mongodb-memory-server`, dependência de desenvolvimento), necessário para as transações;
- usa a API HTTP completa, com os índices e transações de verdade;
- não usa nenhum banco externo;
- na primeira execução, baixa o binário do MongoDB (cerca de 100 MB, fica em cache).

Cobertura:
- primeira tentativa oficial;
- segunda e terceira tentativas, com as respostas anteriores preservadas;
- desempenho e relatório semanal inalterados;
- retomada;
- aberturas simultâneas;
- conclusões simultâneas e repetidas, com uma única recompensa;
- bloqueio de respostas em tentativa concluída;
- índices únicos;
- histórico do aluno, sem gabarito, e do professor, com correção;
- autorização (outro aluno, outra turma, outro professor, perfil errado);
- campos dos endpoints antigos;
- adoção de progresso legado;
- migração: simulação, aplicação, validação, idempotência e reversão.

Os testes existentes com mocks (`progresso.test.js` e `atividades.test.js`) ganharam mocks de `TentativaAtividade` que aplicam as mesmas restrições de unicidade.
