# Publicador de jogos

Página que coloca na internet o jogo que o professor criou com a IA. O professor lê as regras, preenche nome, e-mail e escola, aceita o termo de compromisso e envia o arquivo HTML. O jogo vai para a galeria [Jogos dos professores](https://gamificapampa.github.io/jogos/), e o professor recebe o link e o QR Code. Não há login nem conta no GitHub.

Endereço: [gamificapampa.github.io/publicador](https://gamificapampa.github.io/publicador/)

| Arquivo                              | O que faz                                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| [index.html](index.html)             | A página, com as regras, o formulário, o resultado, a vitrine dos jogos mais novos e o formulário de denúncia  |
| [worker/worker.js](worker/worker.js) | Cloudflare Worker com as rotas `/publicar` e `/denunciar`. Guarda o token da org, que não pode ficar na página |

## Como funciona

1. A página manda os dados ao Worker, que confere tudo de novo (campos, termo aceito, HTML, limite de 2 MB e um campo isca contra robôs).
2. O Worker grava `<pasta>/index.html` e `<pasta>/jogo.json` em [GamificaPampa/jogos](https://github.com/GamificaPampa/jogos) num único commit. Se o nome já existe, a pasta ganha `-2`, `-3` e assim por diante.
3. O Worker abre uma issue no repositório privado `GamificaPampa/jogos-registro` com o nome, o e-mail e a escola do professor. As denúncias também viram issues ali, e quem acompanha o repositório recebe aviso por e-mail.
4. O workflow do repositório `jogos` monta o `jogos.json` e publica a galeria no GitHub Pages. A página testa o link do jogo até ele abrir.

Cada envio gera um link novo, porque sem login não há como saber quem pode alterar um jogo.

## Implantação

1. Crie o repositório público `GamificaPampa/jogos`, ligue o Pages pelo GitHub Actions com `gh api -X POST repos/GamificaPampa/jogos/pages -f build_type=workflow` e só depois envie o conteúdo da pasta `jogos`. Se o primeiro workflow falhar, rode de novo com `gh workflow run pages.yml -R GamificaPampa/jogos`.
2. Crie o repositório privado `GamificaPampa/jogos-registro`, vazio, com os rótulos `publicação` e `denúncia`. Cada pessoa da equipe que vai cuidar das denúncias clica em **Watch** nele. O GitHub não avisa o autor das próprias issues, e o autor é o dono do token, então essa pessoa precisa de outra forma de acompanhar, ou o token sai de uma conta só para isso.
3. Crie um token fine-grained em github.com, Settings, Developer settings, Fine-grained tokens. Resource owner: GamificaPampa. Repositórios: só `jogos` e `jogos-registro`. Permissões: Contents (leitura e escrita) e Issues (leitura e escrita). Se a org pedir aprovação, aprove em Settings da org, Personal access tokens.
4. No Cloudflare, cole o `worker.js` novo no editor do Worker `publicador-gamificapampa`, faça Deploy e crie o segredo `GITHUB_TOKEN_PUBLICADOR` com o token. As variáveis `GITHUB_CLIENT_ID` e `GITHUB_CLIENT_SECRET` deixam de ser usadas.
5. Publique esta pasta no repositório `publicador`.

## Remover um jogo

Apague a pasta do jogo no repositório `jogos`, pelo site do GitHub mesmo, e feche a issue da denúncia. O workflow refaz a galeria em um ou dois minutos.

## Limites

O token da org é um só para todos os professores. O GitHub aceita até 80 operações de escrita por minuto e 500 por hora, e cada publicação usa 4. Ao chegar no limite, a página pede para esperar um minuto.

A checagem de origem e o campo isca barram robôs simples. Para frear abuso de uma pessoa, o próximo passo é o Cloudflare Turnstile ou uma regra de limite no WAF. Dois professores que enviam jogos de mesmo nome no mesmo segundo ficam com a mesma pasta, e o segundo jogo substitui o primeiro.

Para testar no computador, sirva a pasta-mãe com o `identidade-visual` ao lado, como manda o `AGENTS.md` do `recursos-pedagogicos`. A publicação só funciona no endereço publicado, que é a única origem que o Worker aceita.
