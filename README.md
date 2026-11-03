# Zooly API

<p align="center">
  API REST do Zooly Game — Tecnologia assistiva para auxiliar no tratamento e prevenção do Transtorno Fonológico
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-Backend-339933?logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express.js-API-000000?logo=express&logoColor=white" alt="Express.js" />
  <img src="https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white" alt="MongoDB Atlas" />
  <img src="https://img.shields.io/badge/JavaScript-ES_Modules-F7DF1E?logo=javascript&logoColor=black" alt="JavaScript" />
</p>

## Descrição

A Zooly API é o backend responsável por centralizar as regras de negócio, a autenticação, as operações sobre os dados e os recursos utilizados pelas interfaces do Zooly.

A API atende duas interfaces:

- **Zooly Web:** sistema de gerenciamento utilizado por professores e administradores.
- **Zooly Game:** interface Mobile Web utilizada pelas crianças.

A comunicação entre as interfaces e o backend ocorre por meio de endpoints HTTP, com respostas em JSON.

## Tecnologias e bibliotecas

O projeto utiliza as seguintes tecnologias e bibliotecas:

| Tecnologia ou biblioteca | Finalidade |
|---|---|
| Node.js | Ambiente de execução JavaScript no servidor. |
| Express | Framework para criação do servidor HTTP e das rotas da API. |
| MongoDB Atlas | Banco de dados utilizado pela aplicação. |
| Mongoose | Modelagem, validação e acesso aos documentos MongoDB. |
| JavaScript ES Modules | Linguagem e sistema de módulos utilizados no projeto. |
| bcryptjs | Hash e comparação de senhas. |
| jsonwebtoken | Geração e verificação de tokens JWT. |
| cors | Configuração do compartilhamento de requisições entre origens. |
| dotenv | Carregamento das variáveis de ambiente. |
| PDFKit | Geração de relatórios em PDF. |
| nodemon | Reinicialização automática do servidor durante o desenvolvimento. |
| Node.js Test Runner | Execução dos testes automatizados com `node:test`. |
| mongodb-memory-server | MongoDB em memória (replica set) para os testes de integração. |

As dependências de execução estão declaradas em `dependencies` no `package.json`. O `nodemon` e o `mongodb-memory-server` estão declarados em `devDependencies`.

## Funcionalidades

- Autenticação e autorização de administradores, professores e alunos.
- Gerenciamento de escolas, professores, turmas e alunos.
- Cadastro, edição, publicação e consulta de atividades educativas.
- Banco de Histórias: seis histórias iniciais do Zooly, com 30 perguntas, e histórias próprias dos professores, reutilizáveis em atividades.
- Registro de respostas e acompanhamento do progresso dos alunos.
- Histórico de tentativas: cada vez que a missão é jogada fica registrada, e só a primeira conclusão vale para o desempenho e as moedas.
- Desbloqueio sequencial de atividades.
- Sistema de moedas, gastos, compras e seleção de avatares.
- Consulta de desempenho individual e por turma.
- Geração de relatórios semanais de desempenho em PDF.
- Consulta de conteúdos da Base Nacional Comum Curricular (BNCC).

## Arquitetura

A aplicação segue uma organização em camadas que separa as responsabilidades do backend.

```text
src/
├── config/
├── controllers/
├── middlewares/
├── models/
├── routes/
├── services/
├── utils/
├── app.js
└── server.js
```

### Responsabilidades das camadas

- **Routes:** registram os endpoints e aplicam os middlewares.
- **Controllers:** recebem as requisições, chamam os services e organizam as respostas HTTP.
- **Services:** concentram as regras de negócio, consultas e operações da aplicação.
- **Models:** definem os documentos, schemas, validações e índices do Mongoose.
- **Middlewares:** implementam verificações compartilhadas, como autenticação e autorização.
- **Config:** reúne configurações da aplicação, incluindo a conexão com o banco de dados.
- **Utils:** funções pequenas usadas por várias camadas (`erros.js`: resposta de erro, erro com status HTTP e detecção de MongoDB sem transações).

O arquivo `app.js` configura o Express e registra as rotas e os middlewares globais. O arquivo `server.js` inicializa o servidor.

## Configuração do projeto

### Pré-requisitos

- Node.js em uma versão compatível com as dependências do projeto.
- npm.
- Acesso a uma instância MongoDB configurada para o Zooly.

### Instalação

Clone o repositório e acesse a pasta do projeto:

```bash
git clone https://github.com/ZoolyEdu/Zooly-api.git
cd Zooly-api
```

Instale as dependências:

```bash
npm install
```

### Configuração das variáveis de ambiente

O projeto possui um arquivo `.env.example` que serve como modelo para configurar o ambiente local.

Copie o arquivo `.env.example` para `.env`, preservando o arquivo de exemplo para futuras configurações.

No Windows, você pode executar:

```cmd
copy .env.example .env
```

Depois, abra o arquivo `.env` e configure os valores necessários para seu ambiente.

| Variável | Finalidade |
|---|---|
| `MONGODB_URI` | String de conexão com o MongoDB. |
| `PORT` | Porta utilizada pelo servidor. |
| `JWT_SECRET` | Segredo utilizado para assinar e verificar os tokens JWT. |
| `MONGODB_DB_NAME` | Nome do banco. O padrão é `zooly`. |
| `CORS_ORIGINS` | Origens de navegador permitidas, separadas por vírgula. Veja [docs/cors.md](./docs/cors.md). |
| `ZOOLY_AMBIENTE` | **Não use.** O modo demonstração foi removido: a API recusa iniciar se essa variável estiver definida ou se o banco for `zooly_demo`. |
| `JWT_EXPIRES_IN` | Validade dos tokens de professor e administrador. O padrão é 1h; em uso, 8h. |
| `JWT_EXPIRES_IN_ALUNO` | Validade dos tokens de aluno. O padrão é 2h. |
| `ADMIN_EMAIL` | E-mail da conta administrativa configurada. |
| `ADMIN_SENHA_HASH` | Hash da senha da conta administrativa. |
| `MOEDAS_RECOMPENSA_CONCLUSAO` | Quantidade de moedas concedidas pela conclusão de uma atividade. É opcional; quando não configurada, a aplicação utiliza o valor padrão de 10 moedas. |

Ajuste os valores conforme o ambiente local. Não publique o arquivo `.env`, senhas, strings de conexão ou segredos no repositório. Mantenha credenciais reais fora do `.env.example`.

### Executando a aplicação

Para iniciar o servidor em modo de desenvolvimento, com reinicialização automática:

```bash
npm run dev
```

Para iniciar o servidor normalmente:

```bash
npm start
```

Os comandos correspondem aos scripts definidos no `package.json`.

## Executando os testes

A API utiliza o test runner nativo do Node.js para executar os testes automatizados.

Para executar a suíte completa:

```bash
npm test
```

A suíte cobre autenticação, autorização, validações, operações de negócio, progresso, tentativas, moedas, loja, desempenho, relatórios e outros comportamentos da API.

Grande parte dos testes de rotas utiliza mocks dos models. As exceções são `test/tentativas.test.js` e `test/bancoHistorias.test.js`, testes de **integração**: eles sobem um MongoDB em memória em replica set (`mongodb-memory-server`) e exercita a API HTTP completa, com índices únicos e transações reais. Nenhum banco externo é usado. Na primeira execução, o binário do MongoDB (cerca de 100 MB) é baixado e fica em cache.

## Principais endpoints da API

Os recursos estão organizados pelos seguintes prefixos:

| Prefixo | Recurso |
|---|---|
| `/api/auth` | Autenticação e entrada de usuários. |
| `/api/professores` | Cadastro público de professores e perfil do professor autenticado (`GET /me`). |
| `/api/admin/professores` | Gerenciamento administrativo de professores. |
| `/api/escolas` | Gerenciamento administrativo de escolas. |
| `/api/turmas` | Gerenciamento de turmas, restrito ao professor responsável. |
| `/api/alunos` | Gerenciamento de alunos, restrito ao professor responsável pela turma, e avatares. |
| `/api/historias` | Banco de Histórias: consulta, cadastro e reaproveitamento em atividades (somente professores). |
| `/api/atividades` | Criação, edição, publicação e consulta de atividades. |
| `/api/progresso` | Registro de respostas e acompanhamento do progresso. |
| `/api/moedas` | Saldo e movimentações de moedas. |
| `/api/loja` | Catálogo e compra de avatares. |
| `/api/desempenho` | Indicadores de desempenho e relatórios. |
| `/api/bncc` | Consulta de conteúdos da BNCC. |

Os endpoints protegidos exigem autenticação e o perfil autorizado para a operação. Os requisitos específicos são definidos pelos middlewares e pelas rotas correspondentes.

## Tentativas de atividade

Cada vez que o aluno joga uma atividade, a API cria uma `TentativaAtividade`. Os detalhes completos estão em [docs/tentativas.md](./docs/tentativas.md).

**Regras:**
- `POST /api/progresso/atividades/:id/iniciar` retoma a tentativa em andamento ou abre a próxima. Só pode haver uma em andamento, garantido por índice único parcial.
- `PUT .../respostas` grava só na tentativa em andamento. Tentativas concluídas não mudam (`409`).
- `PATCH .../concluir`:
  - a **primeira** tentativa concluída é a **oficial**: conclui o progresso, congela as respostas nele e concede as moedas, tudo na mesma transação;
  - as repetições ficam no histórico, sem moedas (`movimentacao: null`) e sem alterar o desempenho.
- O desempenho, o relatório semanal e o PDF continuam lendo o progresso, que guarda a tentativa oficial.

**Novos endpoints:**

| Endpoint | Perfil | Descrição |
|---|---|---|
| `GET /api/progresso/atividades/:atividadeId/tentativas` | aluno | Histórico do próprio aluno, sem gabarito. |
| `GET /api/desempenho/alunos/:alunoId/tentativas?atividadeId=` | professor responsável pela turma | Histórico com correção por questão. |

**Compatibilidade:** os endpoints existentes mantêm caminhos, corpos e campos. Só ganham `tentativa`, `tentativaRetomada` e `progresso.tentativaOficial`.

### Migração do histórico

Os progressos anteriores viram a tentativa 1 (oficial, se concluídos) com `scripts/migrarTentativas.js`. O script:
- simula por padrão;
- exige confirmar o nome do banco para gravar;
- é idempotente;
- valida o resultado;
- pode ser revertido;
- não altera nem apaga os dados originais.

```bash
npm run migrar:tentativas                                        # simulação (somente leitura)
npm run migrar:tentativas -- --apply --banco=<MONGODB_DB_NAME>   # aplicar e validar
npm run migrar:tentativas -- --reverter [--apply --banco=<nome>] # desfazer
```

Faça backup antes de aplicar. Enquanto a migração não roda, a API adota automaticamente cada progresso antigo como tentativa 1 na primeira vez que o aluno volta à atividade.

## Banco de Histórias

Os professores escolhem histórias prontas do Zooly ou cadastram as próprias, com perguntas, e as reutilizam em atividades. A documentação completa está em [docs/historias.md](./docs/historias.md).

- **Seis histórias iniciais** do Zooly (5 perguntas cada, 4 alternativas, feedback e objetivo pedagógico). São adaptações infantis inspiradas no folclore e na cultura do Vale do Ribeira, globais e protegidas: nenhum professor pode alterá-las.
- **Histórias próprias:** o professor cadastra, edita, arquiva, reativa e exclui as suas. Elas são visíveis só para o autor, identificado pelo token.
- **Atividades:** `GET /api/historias/:id/modelo-atividade` devolve o conteúdo pronto para o formulário de atividade. A atividade salva uma **cópia independente** do texto e das perguntas, então editar ou excluir a história depois não altera a atividade.
- **Gabarito:** o banco é exclusivo de professores, e o aluno continua recebendo só o conteúdo sem respostas.

Cadastro das histórias iniciais (idempotente, nunca sobrescreve):

```bash
npm run historias:semear                                       # simulação (somente leitura)
npm run historias:semear -- --apply --banco=<MONGODB_DB_NAME>  # grava as que faltarem
```

## Documentação

- [Banco de Histórias](./docs/historias.md): modelos, endpoints, autorização, perguntas, seed e integração com atividades.
- [Tentativas de atividade](./docs/tentativas.md): modelo, regras, endpoints, compatibilidade, migração e testes.
- [Atividades](./docs/atividades.md): rotas do professor, origem da história, missão, BNCC e pontuação.
- [CORS](./docs/cors.md): configuração de `CORS_ORIGINS`.

## Relatório semanal de desempenho

Professores autorizados podem consultar o endpoint:

```http
GET /api/desempenho/turmas/:turmaId/semanal?data=AAAA-MM-DD
```

A data informada seleciona a semana de segunda-feira a segunda-feira, com limite final exclusivo, considerando o fuso `America/Sao_Paulo`. Os campos `periodo.inicio` e `periodo.fim` são instantes UTC.

O campo `periodo.disponivel` indica se o período já terminou.

O relatório inclui todos os alunos da turma, inclusive aqueles sem registros. Os indicadores consideram:

- Inícios por `iniciadaEm`.
- Conclusões por `concluidaEm`.
- Respostas pela data da última submissão, registrada em `respostasRegistradasEm`. Depois da primeira conclusão, essa data é a da tentativa oficial e não muda quando a missão é repetida.

Progresso legado com respostas, mas sem essa data, é identificado em `respostasSemData` e não é atribuído a uma semana. O percentual de acerto é `null` quando não há respostas datadas no período.

A exportação do relatório em PDF está disponível em:

```http
GET /api/desempenho/turmas/:turmaId/semanal/pdf
```

## Criação de atividades

Para criar uma atividade, envie `POST /api/atividades` utilizando um token de professor responsável pela turma.

Exemplo de corpo JSON:

```json
{
  "turma": "507f1f77bcf86cd799439320",
  "titulo": "Atividade de leitura",
  "historia": {
    "tipo": "oficial",
    "historiaId": "507f1f77bcf86cd799439330"
  },
  "questoes": [
    {
      "enunciado": "Quais respostas estão corretas?",
      "alternativas": [
        {
          "_id": "507f1f77bcf86cd799439341",
          "texto": "Alternativa A"
        },
        {
          "_id": "507f1f77bcf86cd799439342",
          "texto": "Alternativa B"
        }
      ],
      "respostasCorretas": [
        "507f1f77bcf86cd799439341"
      ]
    }
  ]
}
```

Cada alternativa deve possuir um `_id` válido, e `respostasCorretas` deve referenciar os IDs das alternativas corretas da respectiva questão.

A história pode ser oficial ou própria. Para texto próprio, utilize:

```json
{
  "tipo": "propria",
  "texto": "Texto da história."
}
```

A origem deve ser uma história do Banco de Histórias que o professor possa usar (do Zooly ou dele mesmo, ativa) ou um texto próprio válido. O status inicial `rascunho` é definido pelo servidor.

Em qualquer caso, a atividade guarda uma **cópia** da história:
- com `tipo: "oficial"`, o servidor copia título e texto para `historia.tituloCopia` e `historia.textoCopia`;
- com texto próprio vindo do banco (`GET /api/historias/:id/modelo-atividade`), o texto fica em `historia.texto` e `historia.bancoHistoriaId` registra a origem.

Editar a história no banco depois não altera a atividade. Detalhes em [docs/historias.md](./docs/historias.md#integração-com-atividades).

### Edição de atividades

A edição completa é realizada por `PUT /api/atividades/:id`.

Mantenha os IDs das questões e alternativas existentes que deseja preservar. Esses IDs só podem ser reutilizados dentro da atividade e da questão a que já pertencem.

Para questões ou alternativas novas, omita `_id`. Quando forem enviadas novas alternativas, `respostasCorretas` pode utilizar índices começando em zero para identificar as alternativas corretas nesse envio.

### Publicação e exclusão de atividades

O professor criador pode publicar um rascunho utilizando:

```http
PATCH /api/atividades/:id/publicar
```

A API define `status: "publicada"` e registra `publicadoEm`. Uma atividade já publicada não pode ser publicada novamente.

O campo opcional `prazo` aceita uma data válida e não bloqueia o acesso quando vencido.

`GET /api/atividades/publicadas` lista as atividades da mais antiga para a mais recente, usando `_id` como desempate.

`DELETE /api/atividades/:id` permite excluir somente atividades sem registros de outros models que as referenciem. A exceção são os registros dos alunos: progressos e tentativas são apagados junto com a atividade, e as movimentações de moedas perdem o vínculo, numa transação.

Os contratos de rascunhos, detalhes protegidos, etapas da missão, habilidades BNCC, pontuação e campos de turma estão documentados em [docs/atividades.md](./docs/atividades.md).

## Status do projeto

Projeto acadêmico em desenvolvimento no curso de Desenvolvimento de Software Multiplataforma (DSM), da FATEC Registro.

**Equipe:** KofiTech.

### Banco de dados nos ambientes

A aplicacao usa o banco `zooly` por padrao, configurado explicitamente pela opcao `dbName` do Mongoose. Defina `MONGODB_DB_NAME` para substituir esse nome; a opcao prevalece sobre o nome no caminho de `MONGODB_URI`.

Os testes automatizados nao carregam `.env` nem conectam a um MongoDB externo: os testes de integracao (`test/tentativas.test.js` e `test/bancoHistorias.test.js`) usam um MongoDB temporario em memoria. Para testes de integracao locais, use uma instancia e credenciais isoladas e defina `MONGODB_DB_NAME=zooly_test` junto de uma `MONGODB_URI` dessa instancia. Nunca reutilize a URI de producao.

O modo demonstracao foi removido da API. A API recusa o banco `zooly_demo` e a variavel `ZOOLY_AMBIENTE`, para que dados ficticios nunca aparecam como reais. Os dados que ainda estejam no banco `zooly_demo` nao foram apagados.
