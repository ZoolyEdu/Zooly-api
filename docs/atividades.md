# Atividades: rascunhos, missão, BNCC e pontuação

Todas as rotas abaixo exigem JWT de professor (`Authorization: Bearer <token>`).

## Atividades do professor

| Método | Endpoint | Comportamento |
|---|---|---|
| `GET` | `/api/atividades` | Lista atividades criadas pelo professor autenticado, incluindo rascunhos e publicadas. Omite respostas corretas. |
| `GET` | `/api/atividades/:id` | Retorna todos os dados para consulta/edição, inclusive gabarito, somente ao professor criador. |
| `POST` | `/api/atividades` | Cria atividade como rascunho; o autor é definido pelo token. |
| `PUT` | `/api/atividades/:id` | Atualiza a atividade do autor, preservando IDs de subdocumentos válidos. |
| `PATCH` | `/api/atividades/:id/publicar` | Publica um rascunho do autor. |
| `DELETE` | `/api/atividades/:id` | Mantém a política existente de exclusão e proteção de registros relacionados. |

`GET /api/atividades/publicadas` permanece compatível com o contrato anterior e não retorna respostas corretas.

## Missão e habilidades

Não há uma coleção de missões reutilizáveis. A missão da referência Figma é a seleção de etapas diretamente na atividade. O campo opcional `missao.etapas` aceita valores únicos da lista:

- `ler_texto`
- `completar_palavras`
- `escutar_escrever`
- `identificar_sons`
- `responder_perguntas`

As habilidades são snapshots dos resultados selecionados pela busca BNCC já existente (`GET /api/bncc/busca`). Cada item persistido contém `codigo`, `texto` e `etapa` (`EI` ou `EF`); códigos repetidos ou fora do escopo atual da busca são rejeitados.

Exemplo de payload para criar ou atualizar:

```json
{
  "turma": "507f1f77bcf86cd799439320",
  "titulo": "Atividade de leitura",
  "historia": {
    "tipo": "oficial",
    "historiaId": "507f1f77bcf86cd799439330"
  },
  "missao": {
    "etapas": ["ler_texto", "responder_perguntas"]
  },
  "habilidadesBncc": [
    {
      "codigo": "EF01LP05",
      "texto": "Reconhecer o sistema de escrita alfabética.",
      "etapa": "EF"
    }
  ],
  "questoes": [
    {
      "tipo": "multipla_escolha",
      "enunciado": "Qual alternativa está correta?",
      "pontos": 5,
      "alternativas": [
        { "_id": "507f1f77bcf86cd799439341", "texto": "Alternativa A" },
        { "_id": "507f1f77bcf86cd799439342", "texto": "Alternativa B" }
      ],
      "respostasCorretas": ["507f1f77bcf86cd799439341"]
    }
  ]
}
```

`questoes.tipo` aceita atualmente apenas `multipla_escolha`, o único formato suportado pela API existente. `pontos` é um inteiro seguro não negativo, com padrão `0` para compatibilidade. `pontuacaoTotal` é calculada e persistida pela API a partir das questões; o cliente não pode defini-la.

## Turmas

O modelo de turma agora aceita, de forma opcional para compatibilidade com registros e clientes antigos:

- `periodo`: `Manhã` ou `Tarde`.
- `mascote`: `papagaio`, `lagarto`, `cobra` ou `sarue`.

Os campos podem ser enviados no `POST /api/turmas` e atualizados por `PUT /api/turmas/:id`. O código permanente continua sendo gerado pelo servidor.

## Compatibilidade do MongoDB

Os campos novos são opcionais ou possuem defaults no schema. Documentos existentes continuam consultáveis sem migração: questões antigas recebem tipo `multipla_escolha` e zero pontos; missão e BNCC aparecem vazias; período e mascote permanecem não informados até serem definidos pelo professor. Nenhuma escrita em banco de produção foi executada durante os testes.
