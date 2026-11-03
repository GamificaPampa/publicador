# Publicador de jogos

Página que coloca na internet o jogo que o professor criou com a IA. O professor entra com a conta do GitHub, envia o arquivo HTML e recebe o link e o QR Code do jogo, publicado pelo GitHub Pages na conta dele.

Endereço: [gamificapampa.github.io/publicador](https://gamificapampa.github.io/publicador/)

| Arquivo                              | O que faz                                                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| [index.html](index.html)             | A página, com o login, o envio do jogo e o resultado. Cria o repositório, envia o `index.html` e liga o GitHub Pages pela API do GitHub |
| [worker/worker.js](worker/worker.js) | Cloudflare Worker que troca o código do login pelo token. Guarda o Client secret do OAuth App, que não pode ficar na página             |

A tela de entrar avisa que quem já publicou encontra os jogos ali. Depois de entrar, o botão **Meus jogos** do topo leva à lista de qualquer tela, e o professor vê em **Meus jogos** os jogos que já publicou (os repositórios com a descrição `Jogo "...", publicado com o GamificaPampa`). Em **Versão nova** ele copia ou baixa o código que está no ar para pedir mudanças no Gemini e envia a versão nova no mesmo repositório, com o mesmo link e o mesmo QR Code. Se não gostar, **Voltar para a versão anterior** reenvia o arquivo da versão de antes, e nada se perde, porque cada envio fica no histórico do repositório. O botão **Sair**, também no topo, apaga o login da aba e avisa que o navegador continua conectado ao GitHub, com um botão para sair de lá também, o que importa nos computadores da escola. Publicar um jogo novo com o nome de um jogo que já existe não substitui nada: a página manda usar a Versão nova ou escolher outro nome.

O OAuth App "Publicador GamificaPampa" fica nas configurações da org. O Worker roda em `publicador-gamificapampa.gamificapampa.workers.dev`, com as variáveis `GITHUB_CLIENT_ID` e `GITHUB_CLIENT_SECRET`. Para mudar o Worker, cole o `worker.js` novo no editor do Cloudflare e faça Deploy.

Para testar no computador, sirva a pasta-mãe com o `identidade-visual` ao lado, como manda o `AGENTS.md` do `recursos-pedagogicos`. O login só funciona no endereço publicado, que é o único cadastrado no OAuth App.
