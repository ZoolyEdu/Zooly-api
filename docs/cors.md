# CORS

Configure `CORS_ORIGINS` como uma lista separada por vírgulas de origens exatas dos front-ends, sem caminho ou barra final. Exemplo local: `http://localhost:5173,http://127.0.0.1:5173`. O arquivo `.env.example` não presume um domínio de produção; preencha a variável com os domínios confirmados antes de publicar.

Origens ausentes da lista não recebem `Access-Control-Allow-Origin`; requisições sem `Origin` continuam utilizáveis por clientes não navegador e chamadas same-origin. O preflight permite somente `GET`, `POST`, `PUT`, `PATCH`, `DELETE` e `OPTIONS`, com os headers `Authorization` e `Content-Type`. CORS credentials ficam desabilitados.
