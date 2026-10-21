# Zooly API

API do **Zooly Game**, uma plataforma educacional que apoia a alfabetização infantil por meio de histórias, atividades interativas e acompanhamento pedagógico.

## Objetivo

Centralizar as regras de negócio e o acesso aos dados do Zooly, atendendo duas interfaces:

- **Zooly Web:** sistema de gerenciamento utilizado pelos professores e administradores.
- **Zooly Game:** interface Mobile Web utilizada pelas crianças.

## Tecnologias

- Node.js
- Express
- MongoDB Atlas
- Mongoose
- JavaScript
- Git e GitHub

## Funcionalidades planejadas

- Autenticação e controle de permissões.
- Gerenciamento de escolas, professores, turmas e alunos.
- Cadastro e gerenciamento de atividades educativas.
- Consulta de histórias.
- Registro de respostas e progresso.
- Sistema de moedas e avatares.
- Acompanhamento do desempenho pedagógico.
- Relatórios de desempenho.

## Arquitetura

A API será compartilhada pelo Web dos professores e pelo Mobile Web das crianças.

As requisições serão processadas pelo backend em Node.js e Express, com persistência de dados no MongoDB Atlas por meio do Mongoose.

## Banco de dados

O projeto utilizará um novo banco MongoDB. Não está prevista a migração dos registros antigos do MySQL.

## Configuração local

1. Instale uma versão LTS do Node.js.
2. Clone este repositório.
3. Instale as dependências com `npm install`.
4. Configure as variáveis de ambiente necessárias no arquivo `.env`.
5. Execute o servidor com o comando definido no `package.json`.

As variáveis de ambiente e os comandos definitivos serão documentados conforme a implementação inicial for concluída.

## Status do projeto

Em desenvolvimento. As funcionalidades serão implementadas progressivamente e documentadas conforme forem concluídas.

## Equipe

Projeto acadêmico do curso de Desenvolvimento de Software Multiplataforma (DSM), da FATEC Registro.

Equipe: KofiTech

## Criação de atividades

Para criar uma atividade, envie `POST /api/atividades` com um token de professor responsável pela turma. Cada alternativa deve incluir um `_id` válido, e `respostasCorretas` deve conter os `_id`s das alternativas corretas daquela questão:

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
        { "_id": "507f1f77bcf86cd799439341", "texto": "Alternativa A" },
        { "_id": "507f1f77bcf86cd799439342", "texto": "Alternativa B" }
      ],
      "respostasCorretas": ["507f1f77bcf86cd799439341"]
    }
  ]
}
```

`historia` também pode usar `{ "tipo": "propria", "texto": "..." }`. A origem deve ser uma história oficial existente ou um texto próprio, e o status inicial `rascunho` é definido pelo servidor.

Na edição completa por `PUT /api/atividades/:id`, mantenha os `_id`s das questões e alternativas existentes que deseja preservar. Esses IDs só podem ser reutilizados dentro da atividade e da questão a que já pertencem. Omita `_id` para questões ou alternativas novas; para marcar alternativas novas como corretas no mesmo envio, use índices começando em zero em `respostasCorretas` (por exemplo, `[0]` seleciona a primeira alternativa). A API converte os índices para os IDs gerados pelo Mongoose.
