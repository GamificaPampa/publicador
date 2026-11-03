# Publicador de jogos

Página que coloca na internet o jogo que o professor criou com a IA. O professor entra com a conta do GitHub, envia o arquivo HTML e recebe o link e o QR Code do jogo, publicado pelo GitHub Pages na conta dele.

Endereço: [gamificapampa.github.io/publicador](https://gamificapampa.github.io/publicador/)

| Arquivo                              | O que faz                                                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| [index.html](index.html)             | A página, com o login, o envio do jogo e o resultado. Cria o repositório, envia o `index.html` e liga o GitHub Pages pela API do GitHub |
| [worker/worker.js](worker/worker.js) | Cloudflare Worker que troca o código do login pelo token. Guarda o Client secret do OAuth App, que não pode ficar na página             |

O OAuth App "Publicador GamificaPampa" fica nas configurações da org. O Worker roda em `publicador-gamificapampa.gamificapampa.workers.dev`, com as variáveis `GITHUB_CLIENT_ID` e `GITHUB_CLIENT_SECRET`. Para mudar o Worker, cole o `worker.js` novo no editor do Cloudflare e faça Deploy.

Para testar no computador, sirva a pasta-mãe com o `identidade-visual` ao lado, como manda o `AGENTS.md` do `recursos-pedagogicos`. O login só funciona no endereço publicado, que é o único cadastrado no OAuth App.
