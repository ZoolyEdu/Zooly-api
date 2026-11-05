# Zooly API

<p align="center">
  <strong>API REST do Zooly — Tecnologia assistiva para auxiliar no tratamento e na prevenção do Transtorno Fonológico.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-Backend-339933?logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express.js-API-000000?logo=express&logoColor=white" alt="Express.js" />
  <img src="https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb" alt="MongoDB Atlas" />
  <img src="https://img.shields.io/badge/JavaScript-ES_Modules-F7DF1E?logo=javascript&logoColor=black" alt="JavaScript" />
</p>

## Sobre o projeto

A Zooly API é o backend responsável por centralizar as regras de negócio, a autenticação, o gerenciamento de dados e os recursos utilizados pelas aplicações do Zooly.

O projeto foi desenvolvido para atender duas interfaces:

- **Zooly Web:** painel de gerenciamento utilizado por professores e administradores.
- **Zooly Game:** aplicação Mobile Web destinada às crianças, com atividades educativas e recursos de gamificação.

A comunicação entre as aplicações e o backend acontece por meio de requisições HTTP, com respostas no formato JSON.

## Aplicações e links oficiais

| Aplicação | Endereço |
|---|---|
| Zooly API | https://zooly-api.onrender.com |
| Zooly Web | https://zooly-web.vercel.app |
| Zooly Game | https://zooly-game.vercel.app |

## Tecnologias utilizadas

| Tecnologia ou biblioteca | Finalidade |
|---|---|
| Node.js | Ambiente de execução JavaScript no servidor. |
| Express.js | Framework para criação do servidor HTTP e das rotas. |
| MongoDB Atlas | Banco de dados da aplicação. |
| Mongoose | Modelagem, validação e acesso aos documentos MongoDB. |
| JavaScript ES Modules | Linguagem e sistema de módulos. |
| bcryptjs | Criptografia e comparação de senhas por hash. |
| jsonwebtoken | Geração e verificação de tokens JWT. |
| cors | Configuração de acesso entre diferentes origens. |
| dotenv | Gerenciamento das variáveis de ambiente. |
| PDFKit | Geração de relatórios em PDF. |
| nodemon | Reinicialização automática do servidor durante o desenvolvimento. |
| Node.js Test Runner | Execução dos testes automatizados. |
| mongodb-memory-server | Banco MongoDB em memória para testes de integração. |

As dependências de execução estão declaradas em `dependencies` no `package.json`. As ferramentas de desenvolvimento e testes estão em `devDependencies`.

## Funcionalidades

- Autenticação e autorização de administradores, professores e alunos.
- Cadastro e gerenciamento de professores.
- Gerenciamento de escolas.
- Cadastro e gerenciamento de turmas.
- Cadastro, edição e gerenciamento de alunos.
- Primeiro acesso de alunos sem necessidade de senha individual.
- Cadastro, edição, publicação e consulta de atividades educativas.
- Banco de Histórias com histórias iniciais do Zooly e histórias próprias dos professores.
- Registro de respostas e acompanhamento do progresso dos alunos.
- Histórico de tentativas das atividades.
- Desbloqueio sequencial de atividades.
- Sistema de moedas e movimentações.
- Loja de avatares e gerenciamento de compras.
- Consulta de desempenho individual e por turma.
- Geração de relatórios semanais de desempenho em PDF.
- Consulta de conteúdos da Base Nacional Comum Curricular (BNCC).

## Arquitetura do projeto

A aplicação segue uma organização em camadas, separando as responsabilidades do backend.

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
- **Services:** concentram as regras de negócio e operações da aplicação.
- **Models:** definem documentos, schemas, validações e índices do Mongoose.
- **Middlewares:** implementam verificações compartilhadas, como autenticação e autorização.
- **Config:** reúne configurações da aplicação, incluindo a conexão com o banco de dados.
- **Utils:** contém funções auxiliares utilizadas por diferentes camadas.

O arquivo `app.js` configura o Express e registra as rotas e os middlewares globais. O arquivo `server.js` inicializa o servidor.

## Configuração do projeto

### Pré-requisitos

- Node.js em versão compatível com as dependências do projeto.
- npm.
- Acesso a uma instância MongoDB configurada para o Zooly.

### Instalação

Clone o repositório:

```bash
git clone https://github.com/ZoolyEduc/Zooly-api.git
```

Entre na pasta:

```bash
cd Zooly-api
```

Instale as dependências:

```bash
npm install
```

### Variáveis de ambiente

O projeto possui um arquivo `.env.example`, utilizado como modelo para a configuração do ambiente local.

Crie seu arquivo `.env` a partir dele.

No Windows:

```cmd
copy .env.example .env
```

No Linux ou macOS:

```bash
cp .env.example .env
```

Configure os valores necessários no arquivo `.env`:

| Variável | Finalidade |
|---|---|
| `MONGODB_URI` | String de conexão com o MongoDB. |
| `PORT` | Porta utilizada pelo servidor. |
| `JWT_SECRET` | Segredo utilizado para assinar e verificar os tokens JWT. |
| `MONGODB_DB_NAME` | Nome do banco de dados. O padrão é `zooly`. |
| `CORS_ORIGINS` | Origens permitidas para requisições do navegador, separadas por vírgula. |
| `JWT_EXPIRES_IN` | Validade dos tokens de professores e administradores. |
| `JWT_EXPIRES_IN_ALUNO` | Validade dos tokens de alunos. |
| `ADMIN_EMAIL` | E-mail da conta administrativa configurada. |
| `ADMIN_SENHA_HASH` | Hash da senha da conta administrativa. |
| `MOEDAS_RECOMPENSA_CONCLUSAO` | Quantidade de moedas concedidas pela conclusão de uma atividade. |

O modo de demonstração foi removido. Não configure `ZOOLY_AMBIENTE` e não utilize o banco `zooly_demo`, pois a API recusa essas configurações.

**Importante:** nunca publique o arquivo `.env`, senhas, strings de conexão ou segredos no repositório. Mantenha credenciais reais fora dos arquivos de exemplo.

A configuração de CORS está documentada em [docs/cors.md](./docs/cors.md).

### Executando a aplicação

Para iniciar o servidor em modo de desenvolvimento:

```bash
npm run dev
```

Para iniciar o servidor normalmente:

```bash
npm start
```

A API ficará disponível na porta definida pela variável `PORT`.

## Executando os testes

O projeto utiliza o test runner nativo do Node.js para executar os testes automatizados.

Execute a suíte completa:

```bash
npm test
```

**Último resultado registrado: 322 testes aprovados.**

A suíte contempla testes de autenticação, autorização, validações, operações de negócio, progresso, tentativas, moedas, loja, desempenho, relatórios e outros comportamentos da API.

Grande parte dos testes de rotas utiliza mocks dos models. Os testes de integração `test/tentativas.test.js` e `test/bancoHistorias.test.js` utilizam um MongoDB em memória por meio do `mongodb-memory-server`, sem conexão com banco externo.

Na primeira execução, o binário do MongoDB pode ser baixado automaticamente e armazenado em cache.

## Principais endpoints

Os recursos da API estão organizados pelos seguintes prefixos:

| Prefixo | Recurso |
|---|---|
| `/api/auth` | Autenticação e entrada de usuários. |
| `/api/professores` | Cadastro e perfil de professores. |
| `/api/admin/professores` | Gerenciamento administrativo de professores. |
| `/api/escolas` | Gerenciamento administrativo de escolas. |
| `/api/turmas` | Gerenciamento de turmas. |
| `/api/alunos` | Gerenciamento de alunos e avatares. |
| `/api/historias` | Banco de Histórias. |
| `/api/atividades` | Criação, edição, publicação e consulta de atividades. |
| `/api/progresso` | Registro de respostas e acompanhamento do progresso. |
| `/api/moedas` | Saldo e movimentações de moedas. |
| `/api/loja` | Catálogo e compra de avatares. |
| `/api/desempenho` | Indicadores e relatórios de desempenho. |
| `/api/bncc` | Consulta de conteúdos da BNCC. |

Os endpoints protegidos exigem autenticação e o perfil autorizado para a operação. As permissões específicas são definidas pelas rotas e pelos middlewares correspondentes.

## Autenticação e primeiro acesso dos alunos

A API possui fluxos de autenticação para administradores, professores e alunos.

### Cadastro inicial do aluno

O primeiro acesso do aluno pode ser realizado sem uma senha individual.

O fluxo utiliza o endpoint:

```http
POST /api/auth/aluno/cadastro
```

O aluno informa:

- Nome;
- RA;
- Sexo;
- Código da turma.

A API valida os dados recebidos, verifica se a turma existe, se não está arquivada e se possui uma senha de acesso configurada.

Após o cadastro:

1. A API registra o aluno.
2. Não retorna um token de autenticação nesse momento.
3. O aluno é direcionado para a tela de login.
4. O RA fica preenchido para facilitar a entrada.
5. O aluno utiliza a senha de acesso da turma para realizar o login.

### Alunos cadastrados pelo professor

Quando o professor cadastra um aluno pelo painel, o aluno pode realizar o primeiro login utilizando o RA e a senha da turma.

Caso ainda possua um cadastro inicial pendente, deverá completar seus dados por meio de:

```http
PATCH /api/alunos/cadastro-inicial
```

Depois da conclusão do cadastro, o aluno pode seguir para a introdução guiada do jogo.

O RA é armazenado como texto, e zeros à esquerda fazem parte dele. Novos RAs (aluno cadastrado pelo professor, troca de RA, primeiro acesso pelo jogo ou entrada na turma que cria o aluno) precisam ter exatamente 13 dígitos. Alunos já cadastrados com RA em outro formato continuam podendo fazer login, entrar na turma e concluir o cadastro pendente; esses RAs nunca são alterados automaticamente. Para saber quantos RAs estão fora do padrão, sem alterar nada:

```bash
npm run alunos:auditar-ra
```

### Login do aluno

```http
POST /api/auth/aluno/login
```

A autenticação valida o RA e a senha de acesso da turma, respeitando as regras de cadastro e acesso do aluno.

As senhas não devem ser armazenadas em texto puro.

## Tentativas de atividade

Cada vez que o aluno joga uma atividade, a API cria um registro de `TentativaAtividade`.

A documentação completa está em [docs/tentativas.md](./docs/tentativas.md).

### Regras principais

- `POST /api/progresso/atividades/:id/iniciar`: retoma uma tentativa em andamento ou abre uma nova.
- `PUT /api/progresso/atividades/:id/respostas`: registra as respostas da tentativa em andamento.
- `PATCH /api/progresso/atividades/:id/concluir`: conclui a tentativa.

A primeira tentativa concluída é considerada oficial:

- Atualiza o progresso do aluno.
- Registra as respostas oficiais.
- Concede as moedas de recompensa.
- É utilizada nos indicadores de desempenho.

As tentativas seguintes continuam registradas no histórico, mas não concedem novas moedas nem alteram o desempenho oficial.

### Histórico de tentativas

| Endpoint | Perfil | Descrição |
|---|---|---|
| `GET /api/progresso/atividades/:atividadeId/tentativas` | Aluno | Consulta o histórico do próprio aluno, sem acesso ao gabarito. |
| `GET /api/desempenho/alunos/:alunoId/tentativas?atividadeId=` | Professor responsável | Consulta o histórico com correção por questão. |

Os endpoints anteriores de progresso mantêm seus contratos, com os campos adicionais relacionados às tentativas.

### Migração do histórico

Os progressos anteriores podem ser convertidos em tentativas utilizando o script `scripts/migrarTentativas.js`.

O script possui modo de simulação por padrão, exige confirmação do banco para gravação, valida o resultado e permite reversão.

Comandos:

```bash
# Simulação, sem gravar alterações
npm run migrar:tentativas

# Aplicar a migração
npm run migrar:tentativas -- --apply --banco=<MONGODB_DB_NAME>

# Reverter a migração
npm run migrar:tentativas -- --reverter
```

**Atenção:** faça um backup do banco antes de aplicar qualquer migração. Não execute esse procedimento diretamente em produção sem validar o ambiente e os dados.

## Banco de Histórias

O Banco de Histórias permite que os professores utilizem histórias disponibilizadas pelo Zooly ou cadastrem suas próprias histórias para reutilização em atividades.

A documentação completa está em [docs/historias.md](./docs/historias.md).

### Histórias iniciais

O projeto possui seis histórias iniciais do Zooly, com cinco perguntas cada, quatro alternativas, feedback e objetivo pedagógico.

São adaptações infantis inspiradas no folclore e na cultura do Vale do Ribeira. Essas histórias são protegidas e não podem ser alteradas pelos professores.

### Histórias próprias

Os professores podem cadastrar, editar, arquivar, reativar e excluir suas próprias histórias.

Cada história própria é vinculada ao professor responsável e fica disponível somente para seu autor.

### Integração com atividades

O endpoint abaixo disponibiliza o conteúdo de uma história para utilização no formulário de criação de atividades:

```http
GET /api/historias/:id/modelo-atividade
```

A atividade salva uma cópia independente do texto e das perguntas. Assim, alterações ou exclusões posteriores da história original não modificam a atividade já criada.

O Banco de Histórias é exclusivo dos professores. Os alunos recebem somente o conteúdo necessário para realizar as atividades, sem acesso às respostas corretas.

### Cadastro das histórias iniciais

O script de cadastro é idempotente e não sobrescreve histórias existentes.

```bash
# Simulação
npm run historias:semear

# Aplicar o cadastro
npm run historias:semear -- --apply --banco=<MONGODB_DB_NAME>
```

## Criação de atividades

Para criar uma atividade, utilize:

```http
POST /api/atividades
```

A operação exige um token de professor autorizado para a turma.

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

A história pode ser oficial ou própria. Para utilizar um texto próprio:

```json
{
  "tipo": "propria",
  "texto": "Texto da história."
}
```

A origem deve ser uma história do Banco de Histórias que o professor tenha autorização para utilizar ou um texto próprio válido.

O status inicial `rascunho` é definido pelo servidor.

A atividade armazena uma cópia da história, preservando seu conteúdo mesmo que a história original seja alterada posteriormente.

### Edição de atividades

A edição completa é realizada por:

```http
PUT /api/atividades/:id
```

Mantenha os IDs das questões e alternativas existentes que deseja preservar. Para questões ou alternativas novas, omita o campo `_id`.

### Publicação de atividades

O professor criador pode publicar um rascunho utilizando:

```http
PATCH /api/atividades/:id/publicar
```

A API define o status como `publicada` e registra a data de publicação.

Uma atividade já publicada não pode ser publicada novamente.

O campo opcional `prazo` aceita uma data válida, mas não bloqueia automaticamente o acesso quando vencido.

### Exclusão de atividades

A exclusão é realizada por:

```http
DELETE /api/atividades/:id
```

A API verifica se existem registros relacionados à atividade antes de permitir sua exclusão.

Os progressos, tentativas e movimentações de moedas relacionadas são tratados conforme as regras de exclusão e transação implementadas no backend.

Mais detalhes estão disponíveis em [docs/atividades.md](./docs/atividades.md).

## Relatório semanal de desempenho

Professores autorizados podem consultar o relatório semanal de uma turma utilizando:

```http
GET /api/desempenho/turmas/:turmaId/semanal?data=AAAA-MM-DD
```

A data informada seleciona a semana de segunda-feira a segunda-feira, com limite final exclusivo, considerando o fuso `America/Sao_Paulo`.

O relatório inclui todos os alunos da turma, inclusive aqueles sem registros.

Os indicadores consideram:

- Inícios de atividades;
- Conclusões;
- Respostas registradas;
- Percentual de acertos.

A exportação em PDF está disponível em:

```http
GET /api/desempenho/turmas/:turmaId/semanal/pdf
```

## Documentação complementar

O projeto possui documentação técnica adicional na pasta `docs/`:

| Arquivo | Conteúdo |
|---|---|
| [docs/historias.md](./docs/historias.md) | Banco de Histórias, modelos, endpoints, autorização e integração com atividades. |
| [docs/tentativas.md](./docs/tentativas.md) | Modelo de tentativas, regras, endpoints, migração e testes. |
| [docs/atividades.md](./docs/atividades.md) | Criação, edição, publicação, histórias, BNCC e pontuação. |
| [docs/cors.md](./docs/cors.md) | Configuração de CORS e origens permitidas. |

## Banco de dados e ambientes

A aplicação utiliza o banco `zooly` por padrão, configurado explicitamente pela opção `dbName` do Mongoose.

A variável `MONGODB_DB_NAME` permite substituir esse nome.

Os testes automatizados não carregam o arquivo `.env` nem utilizam o banco de produção. Os testes de integração utilizam um MongoDB temporário em memória.

Para testes de integração locais, utilize uma instância e credenciais isoladas, com um banco de testes, por exemplo `zooly_test`.

**Nunca reutilize a URI de produção nos testes.**

O modo de demonstração foi removido da API. O backend recusa o banco `zooly_demo` e a variável `ZOOLY_AMBIENTE`, evitando que dados fictícios sejam apresentados como dados reais.

Os dados que ainda existam no banco antigo `zooly_demo` não são apagados automaticamente.

## Deploy

A API está publicada no Render:

**Produção:** https://zooly-api.onrender.com

O frontend Web e o Game estão publicados na Vercel e consomem a API por meio de suas respectivas configurações de ambiente.

As origens autorizadas devem ser configuradas na variável `CORS_ORIGINS`.

## Status do projeto

O Zooly é um projeto acadêmico desenvolvido no curso de **Desenvolvimento de Software Multiplataforma (DSM)** da **FATEC Registro**.

**Equipe:** KofiTech.

O projeto está em desenvolvimento contínuo, com evolução das funcionalidades, testes e melhorias na integração entre as aplicações.

---

<p align="center">
  Desenvolvido pela equipe KofiTech.
</p>
