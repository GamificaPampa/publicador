// Trocando o código do login do GitHub por um token. É a única parte que precisa de servidor,
// porque usa o Client secret e o GitHub não aceita essa chamada vinda do navegador.
const ORIGEM = 'https://gamificapampa.github.io'

const cors = {
  'Access-Control-Allow-Origin': ORIGEM,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const responder = (dados, status = 200) =>
  new Response(JSON.stringify(dados), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } })

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

    // Escolhendo entre renovar um token vencido (refresh_token) e trocar o código do login
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
  },
}
