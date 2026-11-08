# Jogos sem conta (pronto e desligado)

Cloudflare Worker que guarda e serve os jogos que o professor publica **sem entrar no GitHub**. Ele faz parte do item 2.3 da spec da retrospectiva de 06/11/2026 (`equipe/notas/spec-retrospectiva-2026-11-06.md`).

**A decisão de ligar é do Paulo** (D4 da spec). Enquanto `JOGOS_SEM_CONTA.url` estiver vazio no `index.html` do publicador, a página fica igual: só o caminho pelo GitHub.

## O que ele faz

- **Publicar:** recebe o nome e o HTML do jogo e devolve o link (`https://jogos.gamificapampa.workers.dev/<id>`) e um código de edição, como `k7mp-2qxr-9tbd`.
- **Versão nova e Voltar para a versão anterior:** com o código de edição, no mesmo link. Ficam guardadas as últimas 5 versões.
- **Abrir o jogo:** num endereço próprio, separado de `gamificapampa.github.io`, para o código de um jogo não alcançar o site da org nem o que ele guarda no aparelho.
- **Proteções ao abrir:** o jogo não consegue mandar nada para fora (`connect-src 'none'` e `form-action 'none'`), o que protege dado de aluno e barra página de senha falsa. Só a fonte do Google (fonts.googleapis.com e fonts.gstatic.com) pode vir de fora.
- **Denunciar:** um link discreto no canto do jogo abre uma página do Worker com os motivos. A denúncia só marca o jogo; quem tira do ar é a equipe.
- **Limites:** só HTML, até 2 MB, e até 10 envios por minuto por endereço de internet.
- **Nada de dado pessoal:** sem login e sem e-mail. O código de edição fica guardado só como resumo (hash), e o endereço de internet serve só para o limite.

| Caminho | O que faz |
| --- | --- |
| `POST /publicar` | `{ nome, html }` → `{ id, nome, link, codigo, versoes }` |
| `POST /jogo` | `{ id, codigo }` → o jogo, com o HTML que está no ar e as datas das versões |
| `POST /versao` | `{ id, codigo, html }` → versão nova no mesmo link |
| `POST /voltar` | `{ id, codigo }` → a versão anterior volta como uma versão a mais |
| `GET /<id>` | Abre o jogo |
| `GET` e `POST /<id>/denunciar` | A página e o formulário da denúncia |
| `GET /equipe/denuncias` | Lista os jogos denunciados (cabeçalho `Authorization: Bearer <ADMIN_CHAVE>`) |
| `DELETE /equipe/<id>` | Tira o jogo do ar. O link passa a avisar que ele saiu do ar |

Só a página da org chama a API pelo navegador. Para testar no computador, ponha os endereços em `ORIGENS_EXTRA`.

## Como ligar

Na conta da Cloudflare que já tem o Worker do publicador, nesta pasta:

```bash
npx wrangler r2 bucket create gamificapampa-jogos
```

```bash
npx wrangler deploy
```

```bash
npx wrangler secret put ADMIN_CHAVE
```

O último comando pede uma senha longa, só da equipe, para listar denúncias e tirar jogos do ar. Ela fica só na Cloudflare.

Depois, em `publicador/index.html`, ponha o endereço que o deploy mostrou em `const JOGOS_SEM_CONTA = { url: '' }`, com a barra no fim, por exemplo `'https://jogos.gamificapampa.workers.dev/'`. Publique um jogo de teste, abra no celular, faça uma versão nova e volte para a anterior.

Para desligar, volte o `url` para vazio: os jogos já publicados continuam abrindo.

## Cuidar das denúncias

```bash
curl -H "Authorization: Bearer SUA_CHAVE" https://jogos.gamificapampa.workers.dev/equipe/denuncias
```

```bash
curl -X DELETE -H "Authorization: Bearer SUA_CHAVE" https://jogos.gamificapampa.workers.dev/equipe/ID_DO_JOGO
```

## Testes

Sem rede e sem Cloudflare, com o R2 e o limite simulados:

```bash
node teste/testar-worker.mjs
```

Os casos cobrem origem, formato, tamanho, publicar, abrir (também com maiúsculas no link), cabeçalhos de segurança, código de edição (também sem os tracinhos), as 5 versões, voltar, denúncia, equipe e limite (por endereço e por bloco IPv6). No fim, o teste mostra quantos casos passaram.

Para ver a página do publicador funcionando com o Worker:

1. Rode `node teste/servir.mjs`, que sobe o Worker na porta 8803 com o R2 na memória.
2. Sirva a pasta-mãe com o servidor da org (`python equipe/ferramentas/servidor_org.py 8802`) e abra `http://127.0.0.1:8802/publicador/`.
3. No console do navegador, rode `JOGOS_SEM_CONTA.url = 'http://127.0.0.1:8803/'; iniciar()`.
