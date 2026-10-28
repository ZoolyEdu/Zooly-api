# Painel dos Pais: dados e dependências

## Situação atual

A API não possui model de responsável, perfil de responsável, login de familiares nem relação persistida entre responsável e criança. Os perfis aceitos pelos middlewares são administrador, professor e aluno. Por isso, não há uma identidade que possa autorizar um familiar a ler dados de uma criança. Não foi criado endpoint que aceite um ID de aluno fornecido pelo cliente.

## Dados já existentes

- Nome da criança: `Aluno.nomeCompleto`.
- Saldo: derivado do ledger por `calcularSaldoMoedas`; não existe saldo armazenado no aluno.
- Estado e horários de atividades: `ProgressoAtividade.status`, `iniciadaEm` e `concluidaEm`, associados a `Atividade.titulo`.
- Desempenho: respostas por questão e respostas corretas permitem calcular acertos para atividades que guardam essas respostas.

## Definições ainda necessárias

- Qual sistema autentica o responsável e como o vínculo com a criança é verificado, revogado e protegido contra consulta de outra criança.
- Qual é a meta semanal (por exemplo, quantidade de atividades ou minutos) e qual período/fuso ela usa. O projeto não guarda uma meta configurada.
- Como as questões são classificadas em leitura de palavras, sons iniciais e rimas/sons. Não há taxonomia/campo que permita separar esses indicadores de modo correto.

Sem essas definições, a API não deve retornar percentuais fictícios nem expor dados de crianças a uma identidade não vinculada. Os módulos existentes de progresso, desempenho e moedas podem ser reutilizados quando o mecanismo de associação e as regras de cálculo forem definidos.
