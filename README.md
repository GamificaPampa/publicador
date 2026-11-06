# Publicador de jogos

Página que coloca na internet o jogo que o professor criou com a IA. O professor entra com a conta do GitHub, envia o arquivo HTML e recebe o link e o QR Code do jogo, publicado pelo GitHub Pages na conta dele.

Endereço: [gamificapampa.github.io/publicador](https://gamificapampa.github.io/publicador/)

| Arquivo                              | O que faz                                                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| [index.html](index.html)             | A página, com o login, o envio do jogo e o resultado. Cria o repositório, envia o `index.html` e liga o GitHub Pages pela API do GitHub |
| [worker/worker.js](worker/worker.js) | Cloudflare Worker que troca o código do login pelo token. Guarda o Client secret do OAuth App, que não pode ficar na página             |
| [worker-jogos/](worker-jogos/)       | Cloudflare Worker que guarda e serve os jogos publicados sem conta (pronto e desligado, veja abaixo), com os testes                      |

A tela de entrar avisa que quem já publicou encontra os jogos ali. Depois de entrar, o botão **Meus jogos** do topo leva à lista de qualquer tela, e o professor vê em **Meus jogos** os jogos que já publicou (os repositórios com a descrição `Jogo "...", publicado com o GamificaPampa`). Em **Versão nova** ele copia ou baixa o código que está no ar para pedir mudanças no Gemini e envia a versão nova no mesmo repositório, com o mesmo link e o mesmo QR Code. Se não gostar, **Voltar para a versão anterior** reenvia o arquivo da versão de antes, e nada se perde, porque cada envio fica no histórico do repositório. O botão **Sair**, também no topo, apaga o login da aba e avisa que o navegador continua conectado ao GitHub, com um botão para sair de lá também, o que importa nos computadores da escola. Publicar um jogo novo com o nome de um jogo que já existe não substitui nada: a página manda usar a Versão nova ou escolher outro nome.

O OAuth App "Publicador GamificaPampa" fica nas configurações da org. O Worker roda em `publicador-gamificapampa.gamificapampa.workers.dev`, com as variáveis `GITHUB_CLIENT_ID` e `GITHUB_CLIENT_SECRET`. Para mudar o Worker, cole o `worker.js` novo no editor do Cloudflare e faça Deploy.

Para testar no computador, sirva a pasta-mãe com o `identidade-visual` ao lado, como manda o `AGENTS.md` do `recursos-pedagogicos`. O login só funciona no endereço publicado, que é o único cadastrado no OAuth App.

## Publicar sem conta (pronto e desligado)

Na escola, criar conta no GitHub, confirmar o e-mail e autorizar o app é o que mais trava. Por isso, a página tem um segundo caminho, **Publicar sem conta**, que vem do item 2.3 da spec da retrospectiva de 06/11/2026 (`equipe/notas/spec-retrospectiva-2026-11-06.md`). **Ligar é decisão do Paulo** (D4 da spec). Enquanto `const JOGOS_SEM_CONTA = { url: '' }` estiver vazio no `index.html`, a página fica igual: só o caminho pelo GitHub.

Ligado, ele é o primeiro caminho da página:

- O professor dá um nome, envia o arquivo (ou cola o código), marca o aviso e recebe na hora o link e o QR Code. O jogo fica no Worker da pasta [worker-jogos](worker-jogos/), num endereço próprio (`jogos.gamificapampa.workers.dev/<id>`), separado do site da org.
- Junto vem um **código de edição**, como `k7mp-2qxr-9tbd`. Ele aparece uma vez, para anotar, e fica guardado no aparelho.
- **Meus jogos** mostra os jogos publicados neste aparelho, com **Versão nova** (mesmo link e QR Code) e **Voltar para a versão anterior**. As últimas 5 versões ficam guardadas. Em **Publicou em outro aparelho?**, o link e o código trazem o jogo para a lista.
- O jogo publicado é anotado no aparelho para a Galeria, como no caminho pelo GitHub.
- Quem prefere a própria conta toca em **Publicar pelo GitHub**, e a tela de entrar tem o botão de volta, **Publicar sem conta**.

O que o Worker faz, como ligar e como cuidar das denúncias está no [README do worker-jogos](worker-jogos/README.md).

## Jogo vindo da máquina de prompts

A máquina de prompts manda o jogo que gerou para cá: ela grava `sessionStorage.setItem('gp-publicador:jogo', JSON.stringify({ nome, html }))` e abre `/publicador/?origem=maquina`. O publicador limpa o endereço e põe o nome e o código no formulário do caminho que estiver valendo:

- sem conta, se estiver ligado;
- pelo GitHub, se não estiver. Sem login, o jogo espera guardado na aba durante a ida ao GitHub e entra no formulário na volta.

Depois de usada, a chave é apagada.
