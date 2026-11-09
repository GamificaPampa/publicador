// Publicando os jogos dos professores na Galeria de jogos do GamificaPampa e recebendo denúncias.
// O Worker guarda um token da org (GITHUB_TOKEN_PUBLICADOR) com acesso só aos repositórios
// GamificaPampa/jogos (Contents) e GamificaPampa/jogos-registro (Issues). Os dados do professor vão
// para uma issue no repositório privado. No repositório público ficam só o jogo, o nome dele e a escola.
const ORIGEM = 'https://gamificapampa.github.io'
const ORG = 'GamificaPampa'
const GALERIA = 'jogos'
const REGISTRO = 'jogos-registro'
const RAMO = 'main'
const TAMANHO_MAXIMO = 2 * 1024 * 1024

const cors = {
  'Access-Control-Allow-Origin': ORIGEM,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const responder = (dados, status = 200) =>
  new Response(JSON.stringify(dados), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } })

// Erro com a mensagem que o professor vai ler e o status HTTP da resposta
class Recusa extends Error {
  constructor(mensagem, status = 400) {
    super(mensagem)
    this.status = status
  }
}

// Chamando a API do GitHub com o token da org. O GitHub recusa chamadas sem User-Agent.
// Os limites de uso (403 ou 429 com aviso de limite) viram um pedido para tentar de novo em um minuto
async function github(env, caminho, opcoes = {}) {
  const resposta = await fetch('https://api.github.com' + caminho, {
    ...opcoes,
    headers: {
      Authorization: 'Bearer ' + env.GITHUB_TOKEN_PUBLICADOR,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'publicador-gamificapampa',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  if (resposta.status === 429 || (resposta.status === 403 && (resposta.headers.get('retry-after') || resposta.headers.get('x-ratelimit-remaining') === '0'))) {
    throw new Recusa('Muita gente publicando ao mesmo tempo. Espere um minuto e tente de novo.', 429)
  }
  return resposta
}

const texto = (valor, maximo) => String(valor ?? '').trim().slice(0, maximo)
const emailValido = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

// Transformando o nome do jogo no nome da pasta, sem acentos nem espaços
const nomeDaPasta = nome => nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)

// Achando uma pasta livre: pizzaria, pizzaria-2, pizzaria-3...
async function pastaLivre(env, base) {
  for (let numero = 1; numero <= 30; numero++) {
    const pasta = numero === 1 ? base : `${base}-${numero}`
    const resposta = await github(env, `/repos/${ORG}/${GALERIA}/contents/${pasta}?ref=${RAMO}`)
    if (resposta.status === 404) return pasta
    if (!resposta.ok) throw new Recusa('Não consegui falar com o GitHub. Tente de novo.', 502)
  }
  throw new Recusa('Já existem muitos jogos com esse nome. Escolha outro nome.')
}

// Gravando o jogo e a ficha dele num único commit. Se outro professor publicar no mesmo instante,
// o ramo anda e a atualização é recusada, então busca o ramo de novo e repete
async function gravar(env, pasta, html, ficha) {
  const base = `/repos/${ORG}/${GALERIA}/git`
  for (let tentativa = 1; tentativa <= 5; tentativa++) {
    const ref = await (await github(env, `${base}/ref/heads/${RAMO}`)).json()
    const pai = ref.object.sha
    const commitPai = await (await github(env, `${base}/commits/${pai}`)).json()
    const arvore = await github(env, `${base}/trees`, {
      method: 'POST',
      body: JSON.stringify({
        base_tree: commitPai.tree.sha,
        tree: [
          { path: `${pasta}/index.html`, mode: '100644', type: 'blob', content: html },
          { path: `${pasta}/jogo.json`, mode: '100644', type: 'blob', content: JSON.stringify(ficha, null, 2) + '\n' },
        ],
      }),
    })
    if (!arvore.ok) throw new Recusa('Não consegui enviar o jogo. Tente de novo.', 502)
    const commit = await github(env, `${base}/commits`, {
      method: 'POST',
      body: JSON.stringify({ message: `Publica o jogo ${ficha.nome}`, tree: (await arvore.json()).sha, parents: [pai] }),
    })
    if (!commit.ok) throw new Recusa('Não consegui enviar o jogo. Tente de novo.', 502)
    const avanco = await github(env, `${base}/refs/heads/${RAMO}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: (await commit.json()).sha }),
    })
    if (avanco.ok) return
    if (avanco.status !== 422) throw new Recusa('Não consegui enviar o jogo. Tente de novo.', 502)
    await new Promise(resolver => setTimeout(resolver, 300 * tentativa))
  }
  throw new Recusa('Muita gente publicando ao mesmo tempo. Espere um minuto e tente de novo.', 429)
}

// Abrindo uma issue no repositório privado. A equipe recebe o aviso por e-mail
async function registrar(env, titulo, corpo, rotulo) {
  const resposta = await github(env, `/repos/${ORG}/${REGISTRO}/issues`, {
    method: 'POST',
    body: JSON.stringify({ title: titulo, body: corpo, labels: [rotulo] }),
  })
  return resposta.ok
}

async function publicar(env, corpo) {
  if (corpo.site) throw new Recusa('Envio recusado.')
  const nome = texto(corpo.nome, 60)
  const professor = texto(corpo.professor, 120)
  const email = texto(corpo.email, 120)
  const escola = texto(corpo.escola, 120)
  const html = String(corpo.html ?? '')
  if (!nome || !professor || !escola) throw new Recusa('Preencha todos os campos.')
  if (!emailValido(email)) throw new Recusa('Confira o seu e-mail.')
  if (corpo.aceite !== true) throw new Recusa('Confirme o termo de compromisso.')
  if (!/<(html|body|script)/i.test(html)) throw new Recusa('Escolha o arquivo HTML do jogo ou cole o código dele.')
  if (new TextEncoder().encode(html).length > TAMANHO_MAXIMO) throw new Recusa('O jogo passa de 2 MB. Peça para a IA uma versão mais leve.')
  const base = nomeDaPasta(nome)
  if (!base) throw new Recusa('Dê ao jogo um nome com letras ou números.')

  // Registrando quem publica antes de gravar o jogo. Sem registro, o jogo não vai ao ar
  const pasta = await pastaLivre(env, base)
  const publicado = new Date().toISOString()
  const link = `${ORIGEM}/${GALERIA}/${pasta}/`
  const registrado = await registrar(env, `Publicação: ${nome}`, [
    `**Jogo:** ${nome}`,
    `**Link:** ${link}`,
    `**Pasta:** \`${pasta}\``,
    `**Professor(a):** ${professor}`,
    `**E-mail:** ${email}`,
    `**Escola:** ${escola}`,
    `**Data:** ${publicado}`,
    '',
    'Aceitou o termo de compromisso do Publicador.',
  ].join('\n'), 'publicação')
  if (!registrado) throw new Recusa('Não consegui registrar a publicação. Tente de novo.', 502)
  await gravar(env, pasta, html, { nome, escola, publicado })
  return { link, pasta }
}

async function denunciar(env, corpo) {
  if (corpo.site) throw new Recusa('Envio recusado.')
  const jogo = texto(corpo.jogo, 300)
  const motivo = texto(corpo.motivo, 2000)
  const email = texto(corpo.email, 120)
  if (!jogo || !motivo) throw new Recusa('Diga qual é o jogo e o que há de errado com ele.')
  if (email && !emailValido(email)) throw new Recusa('Confira o seu e-mail.')
  const registrado = await registrar(env, `Denúncia: ${jogo.slice(0, 80)}`, [
    `**Jogo:** ${jogo}`,
    `**Contato:** ${email || 'não informado'}`,
    `**Data:** ${new Date().toISOString()}`,
    '',
    '**Motivo:**',
    motivo,
  ].join('\n'), 'denúncia')
  if (!registrado) throw new Recusa('Não consegui registrar a denúncia. Tente de novo.', 502)
  return { ok: true }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
    if (request.method !== 'POST') return responder({ erro: 'Use POST' }, 405)
    if (request.headers.get('Origin') !== ORIGEM) return responder({ erro: 'Origem não permitida' }, 403)

    let corpo
    try {
      corpo = await request.json()
    } catch {
      return responder({ erro: 'Corpo inválido' }, 400)
    }

    const rota = new URL(request.url).pathname

    // Trocando o código do login do GitHub pelo token, para a página que publica na conta do professor
    if (rota === '/') {
      const campos = corpo.refresh_token
        ? { grant_type: 'refresh_token', refresh_token: corpo.refresh_token }
        : { code: corpo.code, redirect_uri: corpo.redirect_uri }
      if (!campos.code && !campos.refresh_token) return responder({ erro: 'Falta o código' }, 400)
      const resposta = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, ...campos }),
      })
      const dados = await resposta.json()
      if (dados.error) return responder({ erro: dados.error_description || dados.error }, 400)
      return responder(dados)
    }

    try {
      if (rota === '/publicar') return responder(await publicar(env, corpo))
      if (rota === '/denunciar') return responder(await denunciar(env, corpo))
      return responder({ erro: 'Rota desconhecida' }, 404)
    } catch (erro) {
      if (erro instanceof Recusa) return responder({ erro: erro.message }, erro.status)
      console.log(erro)
      return responder({ erro: 'Algo deu errado. Tente de novo.' }, 500)
    }
  },
}
