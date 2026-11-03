# Banco de Histórias

O Banco de Histórias guarda as histórias que os professores usam para criar atividades:

- **Histórias do Zooly** (`origem: "zooly"`): as seis histórias iniciais e qualquer história global antiga. Todos os professores as veem, e ninguém pode alterá-las pela API.
- **Histórias do professor** (`origem: "professor"`): criadas por um professor. Só o autor as vê, edita, arquiva ou exclui.

Todas as rotas exigem token de **professor**. Alunos recebem `403` em qualquer rota do banco.

## Modelo (`Historia`, coleção `historias`)

O modelo `Historia`, que já existia (`titulo`, `conteudo`), foi estendido. Documentos antigos continuam válidos: os campos novos têm valor padrão, e um documento sem `origem` é tratado como história do Zooly.

| Campo | Tipo | Descrição |
|---|---|---|
| `titulo` | texto (até 120) | Obrigatório. |
| `descricao` | texto (até 400) | Resumo para o professor. |
| `conteudo` | texto (até 8000) | Texto completo da história. Obrigatório. |
| `tema` | texto (até 80) | Tema ou categoria (ex.: "Folclore das águas"). |
| `faixaEtaria` | `{ minima, maxima }` | Idades inteiras de 3 a 12. Padrão: 4 a 8. |
| `objetivosPedagogicos` | lista de textos (até 10) | |
| `nota` | texto (até 400) | Créditos ou aviso de adaptação. |
| `origem` | `zooly` \| `professor` | Definida pelo servidor. |
| `professor` | ObjectId \| null | Autor. Definido pelo token, nunca pelo corpo da requisição. |
| `status` | `ativa` \| `arquivada` | Histórias arquivadas não podem ser usadas em novas atividades. |
| `chave` | texto | Identificador estável das histórias iniciais (índice único parcial). |
| `perguntas` | lista (até 20) | Ver abaixo. |
| `createdAt`, `updatedAt` | Date | `timestamps`. |

**Por que as perguntas ficam dentro da história:**
- uma história tem poucas perguntas (até 20);
- elas são sempre lidas e editadas junto com a história;
- nunca são referenciadas sozinhas, porque as atividades copiam o conteúdo.

Assim, um único documento mantém tudo consistente sem transações, no mesmo padrão das `questoes` em `Atividade`.

### Formato das perguntas

```json
{
  "enunciado": "Onde mora o Nego d'Água, segundo a história?",
  "alternativas": [
    { "texto": "Nas partes mais fundas do rio" },
    { "texto": "No alto de uma montanha" },
    { "texto": "Dentro de uma caverna escura" },
    { "texto": "Numa casa perto da escola" }
  ],
  "alternativaCorreta": 0,
  "feedback": "Isso! A história conta que ele mora nas partes mais fundas do Rio Ribeira.",
  "objetivoPedagogico": "Localizar uma informação que aparece no texto."
}
```

| Campo | Regras |
|---|---|
| `enunciado` | Obrigatório, até 300 caracteres. |
| `alternativas` | De 2 a 6 itens `{ texto }` (até 150 caracteres), sem textos repetidos. As histórias iniciais têm 4. |
| `alternativaCorreta` | Posição (a partir de 0) da alternativa correta. |
| `feedback` | Opcional, até 500 caracteres. É a explicação para depois da resposta. |
| `objetivoPedagogico` | Opcional, até 300 caracteres. |

Nas respostas da API, perguntas e alternativas também trazem `_id`. Na edição (`PUT`), `_id` válidos podem ser enviados de volta e são preservados.

## Endpoints

| Método e rota | Descrição | Respostas |
|---|---|---|
| `GET /api/historias?origem=todas\|zooly\|professor&incluirArquivadas=true` | Lista as histórias do Zooly e as do professor autenticado, sem perguntas. Padrão: `todas`, sem arquivadas. | `200 { total, historias }`, `400` para `origem` inválida |
| `GET /api/historias/:id` | Detalhe, com perguntas, gabarito e feedback. | `200 { historia }`, `400`, `404` |
| `GET /api/historias/:id/perguntas` | Só as perguntas. | `200 { historiaId, perguntas }`, `400`, `404` |
| `GET /api/historias/:id/modelo-atividade` | Conteúdo pronto para o formulário de atividade (ver abaixo). | `200 { modelo, apoioPedagogico }`, `404`, `409` se arquivada |
| `POST /api/historias/validar` | Valida o corpo **sem salvar**. | `200 { valida, erros: [{ campo, mensagem }] }` |
| `POST /api/historias` | Cadastra uma história do professor. | `201 { historia }`, `400 { erros }` |
| `PUT /api/historias/:id` | Substitui os campos editáveis de uma história **própria**. Campos opcionais ausentes voltam ao padrão. | `200`, `400 { erros }`, `403` se for do Zooly, `404` |
| `PATCH /api/historias/:id/arquivar` | Arquiva uma história própria. | `200`, `403`, `404` |
| `PATCH /api/historias/:id/reativar` | Reativa uma história própria. | `200`, `403`, `404` |
| `DELETE /api/historias/:id` | Exclui uma história própria. | `200`, `403`, `404`, `409` (ver abaixo) |

Cada item da lista e do detalhe traz:
- os campos antigos: `_id`, `titulo` e `conteudo`;
- os campos novos: `descricao`, `tema`, `faixaEtaria`, `objetivosPedagogicos`, `nota`, `origem`, `status`, `totalPerguntas`, `createdAt` e `updatedAt`;
- `editavel`, que é `true` só quando a história é do professor autenticado.

Campos aceitos no `POST`, no `PUT` e no `/validar`: `titulo`, `descricao`, `conteudo`, `tema`, `faixaEtaria`, `objetivosPedagogicos`, `nota` e `perguntas`. Qualquer outro campo, como `origem`, `professor`, `status` ou `chave`, é recusado com erro no próprio campo.

### Regras de autorização

- **Perfil:** só `professor` (`autenticarToken` + `autorizarPerfil("professor")`).
- **Identidade:** o autor de uma nova história é sempre o professor do token.
- **História particular de outro professor:** responde `404` em todas as rotas, para não revelar que ela existe.
- **História do Zooly:** pode ser lida e usada por qualquer professor. Alterar, arquivar ou excluir responde `403`.
- **Exclusão:** é segura, porque as atividades guardam cópias. A única exceção é uma atividade antiga sem cópia que leia a história ao vivo: nesse caso a exclusão responde `409` e o professor deve arquivar. Na prática isso não acontece com histórias de professor, que já nascem com o mecanismo de cópia.

## Integração com atividades

Fluxo sugerido para o Zooly-web:

1. Listar com `GET /api/historias` e mostrar o detalhe com `GET /api/historias/:id`.
2. Ao escolher "Usar em uma atividade", chamar `GET /api/historias/:id/modelo-atividade`:

```json
{
  "sucesso": true,
  "modelo": {
    "titulo": "O Curupira da Mata Atlântica",
    "historia": { "tipo": "propria", "texto": "Na Mata Atlântica…", "bancoHistoriaId": "6a5f0b000000000000000002" },
    "questoes": [
      {
        "tipo": "multipla_escolha",
        "enunciado": "Como são os cabelos do Curupira?",
        "alternativas": [{ "_id": "…", "texto": "Vermelhos como fogo" }, "…"],
        "respostasCorretas": ["…"]
      }
    ]
  },
  "apoioPedagogico": {
    "historiaId": "…", "tituloHistoria": "…", "descricao": "…", "tema": "…",
    "faixaEtaria": { "minima": 4, "maxima": 8 }, "objetivosPedagogicos": ["…"], "nota": "…",
    "perguntas": [{ "enunciado": "…", "feedback": "…", "objetivoPedagogico": "…" }]
  }
}
```

3. Pré-preencher o formulário com `modelo`. O professor pode trocar o título, editar o texto, alterar alternativas, remover ou acrescentar perguntas e revisar tudo.
4. Enviar `POST /api/atividades` com `turma`, os campos do `modelo` (já editados) e, se quiser, `recompensaMoedas`, `prazo`, `missao` e `habilidadesBncc`. O formato de `questoes` é exatamente o que a rota aceita. Cada chamada ao modelo gera `_id` novos para as alternativas.
5. Publicar com `PATCH /api/atividades/:id/publicar`, como hoje.

### Cópia independente

- A atividade guarda o **texto** (`historia.texto`) e as **questões** (com o gabarito em `respostasCorretas`) no próprio documento. `bancoHistoriaId` só registra de onde veio.
- O formato antigo `{ "tipo": "oficial", "historiaId" }` continua aceito. O servidor copia título e texto para `historia.tituloCopia` e `historia.textoCopia` no momento em que a atividade é criada (ou quando a história é trocada).
- O jogo lê sempre a cópia (`GET /api/progresso/atividades/:id/conteudo`). Assim, editar, arquivar ou excluir a história no banco **nunca** muda uma atividade criada, o que mantém o histórico de respostas e de tentativas consistente.
- **Atividades antigas** (com `tipo: "oficial"` e sem cópia) continuam lendo a história pelo `historiaId`. Elas só apontam para histórias globais, que a API não deixa alterar. Ganham a cópia na primeira edição.
- **Feedback e objetivo de cada pergunta não são copiados**, porque o modelo `Atividade` não tem esses campos. Eles chegam ao professor em `apoioPedagogico` e continuam no banco.

## Segurança do gabarito

- O banco (perguntas, `alternativaCorreta` e `feedback`) só é acessível a professores.
- O aluno só recebe o conteúdo de atividades por `GET /api/progresso/atividades/:id/conteudo`, que monta a resposta com uma lista **fechada** de campos: id, tipo, enunciado, pontos e alternativas (id e texto). Não inclui `respostasCorretas`, feedback nem objetivo.
- A correção é feita no servidor: o desempenho e o histórico de tentativas comparam as respostas com `respostasCorretas` da atividade. O cliente nunca envia correção, pontuação ou moedas.
- As rotas `/api/atividades` exigem perfil de professor. A listagem omite `respostasCorretas`, e o detalhe com gabarito é só do autor.

## Histórias iniciais e seed

| # | Título | Tema | Objetivos |
|---|---|---|---|
| 1 | O Nego d'Água do Rio Ribeira | Folclore das águas | Respeito à natureza, rios limpos, segurança perto da água |
| 2 | O Curupira da Mata Atlântica | Folclore da floresta | Educação ambiental, Mata Atlântica, animais e árvores |
| 3 | Mãe-do-Ouro e os Tesouros Escondidos | Folclore e recursos naturais | Generosidade, respeito à natureza, recursos naturais |
| 4 | O Minhocão do Rio Ribeira | Folclore, solo e águas | Importância do solo, terra e água, chuvas e enchentes |
| 5 | O Saci da Caverna do Diabo | Folclore e geografia regional | Percepção auditiva, eco, geografia de Eldorado |
| 6 | A Protetora dos Fandangueiros | Cultura caiçara | Fandango, tamancos e viola, tradições e patrimônio |

O texto completo e as 30 perguntas (5 por história, 4 alternativas, feedback e objetivo) estão em [`src/config/historiasIniciais.js`](../src/config/historiasIniciais.js). Cada história tem uma `nota` que a identifica como **adaptação infantil inspirada** no folclore e na cultura regional, e não como versão histórica definitiva.

### Executar o seed

```bash
npm run historias:semear                                        # simulação: mostra o que seria criado
npm run historias:semear -- --apply --banco=<MONGODB_DB_NAME>   # cria as histórias que faltam
```

- **Idempotente:** cada história tem `_id` e `chave` fixos. Rodar de novo não duplica histórias nem perguntas (`existentes: 6`).
- **Não sobrescreve:** se uma história inicial já existe, mesmo alterada, ela é mantida. Quando difere do texto de referência, aparece em `divergentes` para revisão manual.
- **Não toca** em histórias de professores nem em nenhum outro documento.
- **Segurança:** gravar exige `--banco=` igual ao `MONGODB_DB_NAME` configurado. O script lê o `.env`, e variáveis definidas no terminal têm prioridade.
- Para atualizar o texto de uma história inicial já cadastrada, é preciso uma decisão editorial e uma alteração manual revisada. O seed nunca faz isso.

## Como testar

```bash
npm test                                    # suíte completa
node --test test/bancoHistorias.test.js     # só o Banco de Histórias (integração)
node --test test/historias.test.js          # contrato HTTP com mocks
```

`test/bancoHistorias.test.js` usa um MongoDB em memória (`mongodb-memory-server`), sem banco externo, e a API HTTP completa. Ele cobre:
- conteúdo inicial (6 histórias, 30 perguntas distintas);
- seed: simulação, idempotência, não sobrescrever e não tocar nas histórias dos professores;
- listagens, CRUD, arquivamento, bloqueio entre professores, proteção das histórias globais e bloqueio de alunos;
- validação de perguntas e alternativas;
- modelo de atividade e cópia independente (inclusive depois de editar ou excluir a história);
- formato `oficial` com cópia;
- histórias arquivadas e de outro professor;
- proteção do gabarito para o aluno;
- atividade antiga sem cópia;
- compatibilidade com tentativas, moedas, progresso oficial e desempenho.
