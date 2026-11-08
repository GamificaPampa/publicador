// Jogos sem conta: o Cloudflare Worker que guarda e serve os jogos que o professor publica sem entrar no GitHub.
// Cada jogo fica no bucket R2 (binding JOGOS) e abre num endereço deste Worker, separado de gamificapampa.github.io,
// para o código de um jogo não alcançar o site da org nem o que ele guarda no aparelho. Como ligar está no README.md.
//
// O que fica guardado, por jogo:
//   jogos/<id>/info.json      nome, datas, as últimas versões, o resumo (hash) do código de edição e as denúncias
//   jogos/<id>/v<n>.html      cada uma das últimas 5 versões
//   denuncias/<id>            marca os jogos denunciados, para a equipe achar
// Nada de dado pessoal: sem login, sem e-mail. O endereço de internet serve só para o limite de envios.

const ORIGEM = 'https://gamificapampa.github.io'
const MAXIMO_DO_JOGO = 2 * 1024 * 1024
const VERSOES_GUARDADAS = 5
const MAXIMO_DO_NOME = 60
// Sem letras e números que se confundem ao anotar (l, 1, o, 0)
const ALFABETO = 'abcdefghijkmnpqrstuvwxyz23456789'
const MOTIVOS = {
  improprio: 'Conteúdo impróprio para a turma',
  golpe: 'Pede senha ou parece golpe',
  dados: 'Mostra nome ou dado de aluno',
  outro: 'Outro motivo',
}

// O que o jogo pode fazer ao abrir: rodar o próprio código, desenhar, tocar som e usar a fonte do Google.
// Não pode mandar nada para fora (connect-src e form-action), o que protege dado de aluno e barra página de senha falsa
const CSP_DO_JOGO = [
  "default-src 'self' data: blob:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ')

const origensPermitidas = (env) => [ORIGEM, ...String(env.ORIGENS_EXTRA || '').split(',').map((o) => o.trim()).filter(Boolean)]

const cabecalhosCors = (origem) => ({
  'Access-Control-Allow-Origin': origem,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
})

const json = (dados, status = 200, cabecalhos = {}) =>
  new Response(JSON.stringify(dados), { status, headers: { ...cabecalhos, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })

// As páginas do próprio Worker (início, denúncia, jogo que não existe) não carregam nada de fora
const pagina = (titulo, corpo, status = 200, formulario = false) => new Response(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${titulo} · GamificaPampa</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: linear-gradient(#4fadf2, #bfe6ff); font: 500 18px/1.45 "Fredoka", "Trebuchet MS", system-ui, sans-serif; color: #2f2a4a; }
  main { width: min(520px, 100%); padding: 28px; background: #fff; border: 4px solid #2f2a4a; border-radius: 26px; box-shadow: 0 8px 0 #2f2a4a; }
  h1 { margin: 0 0 12px; font-size: 28px; line-height: 1.1; }
  label { display: flex; gap: 10px; align-items: flex-start; margin: 10px 0; cursor: pointer; }
  input { width: 22px; height: 22px; margin-top: 3px; accent-color: #ff5f8f; }
  button, .botao { display: inline-block; margin-top: 16px; padding: 10px 22px; font: inherit; font-weight: 700; color: #2f2a4a; background: #ff8fb0; border: 4px solid #2f2a4a; border-radius: 999px; box-shadow: 0 5px 0 #2f2a4a; cursor: pointer; text-decoration: none; }
  a { color: inherit; }
</style></head><body><main>${corpo}</main></body></html>`, {
  status,
  headers: {
    'Content-Type': 'text/html; charset=utf-8',
    // frame-ancestors: outro site não põe a página da denúncia numa moldura invisível para o clique cair no botão
    'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; form-action ${formulario ? "'self'" : "'none'"}; base-uri 'none'; frame-ancestors 'none'`,
    'X-Content-Type-Options': 'nosniff',
    // same-origin, e não no-referrer: com no-referrer o navegador manda Origin: null no formulário da denúncia
    'Referrer-Policy': 'same-origin',
    'Cache-Control': 'no-store',
  },
})

const sortear = (tamanho) => {
  const bytes = crypto.getRandomValues(new Uint8Array(tamanho))
  return Array.from(bytes, (byte) => ALFABETO[byte % ALFABETO.length]).join('')
}
// O código de edição tem 3 grupos de 4 letras e números, fácil de anotar no caderno
const novoCodigo = () => [sortear(4), sortear(4), sortear(4)].join('-')
const resumo = async (texto) => {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(texto).trim().toLowerCase()))
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
const idValido = (id) => typeof id === 'string' && /^[a-z2-9]{8}$/.test(id)
const limparNome = (nome) => String(nome || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAXIMO_DO_NOME)
const escapar = (texto) => String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const dataCurta = () => new Date().toISOString()

const lerInfo = async (env, id) => {
  const objeto = await env.JOGOS.get(`jogos/${id}/info.json`)
  return objeto ? objeto.json() : null
}
const gravarInfo = (env, id, info) => env.JOGOS.put(`jogos/${id}/info.json`, JSON.stringify(info), { httpMetadata: { contentType: 'application/json' } })

// Guardando uma versão nova e apagando as que passam das últimas 5
async function guardarVersao(env, id, info, html) {
  const numero = (info.versoes.at(-1)?.n || 0) + 1
  await env.JOGOS.put(`jogos/${id}/v${numero}.html`, html, { httpMetadata: { contentType: 'text/html; charset=utf-8' } })
  info.versoes.push({ n: numero, data: dataCurta() })
  const sobrando = info.versoes.splice(0, Math.max(0, info.versoes.length - VERSOES_GUARDADAS))
  if (sobrando.length) await env.JOGOS.delete(sobrando.map((versao) => `jogos/${id}/v${versao.n}.html`))
  info.atualizado = dataCurta()
  await gravarInfo(env, id, info)
  return numero
}

// O que o professor recebe de volta: nada além do que ele mesmo mandou e das datas
const resumoDoJogo = (base, id, info) => ({
  id,
  nome: info.nome,
  link: `${base}/${id}`,
  versoes: info.versoes.map((versao) => versao.data),
})

// Conferindo o HTML que chegou: tem que parecer uma página e caber no limite
function conferirHtml(html) {
  if (typeof html !== 'string' || !/<(html|body|script)/i.test(html)) return 'Mande o arquivo HTML do jogo ou cole o código dele.'
  if (new TextEncoder().encode(html).length > MAXIMO_DO_JOGO) return 'O jogo passa de 2 MB. Peça à IA uma versão mais leve, sem imagens dentro do arquivo.'
  return ''
}

// Abrindo o jogo com um Denunciar discreto no canto, que leva a uma página do próprio Worker
function servirJogo(id, html) {
  const botao = `<a href="/${id}/denunciar" target="_blank" rel="noopener nofollow" style="position:fixed;right:6px;bottom:6px;z-index:2147483647;padding:3px 9px;border-radius:999px;background:rgba(255,255,255,.82);color:#2f2a4a;font:12px/1.3 system-ui,sans-serif;text-decoration:none;opacity:.7">Denunciar</a>`
  // O último </body>, numa passada só: a busca com lookahead relia o resto do arquivo a cada </body>
  // e passava de um minuto num jogo de 2 MB cheio deles
  let fim = -1
  for (const achado of html.matchAll(/<\/body>/gi)) fim = achado.index
  const comBotao = fim >= 0 ? html.slice(0, fim) + botao + html.slice(fim) : html + botao
  return new Response(comBotao, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': CSP_DO_JOGO,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      // Sem guardar cópia: a versão nova aparece no mesmo link quando a página recarrega
      'Cache-Control': 'no-cache',
    },
  })
}

const naoAchou = () => pagina('Jogo não encontrado', '<h1>Jogo não encontrado</h1><p>Confira o link ou o QR Code com quem mandou o jogo.</p>', 404)
const saiuDoAr = () => pagina('Jogo fora do ar', '<h1>Este jogo saiu do ar</h1><p>A equipe do GamificaPampa tirou este jogo do ar.</p>', 410)

async function limite(env, request) {
  if (!env.LIMITE) return true
  const ip = request.headers.get('CF-Connecting-IP') || 'sem-ip'
  const { success } = await env.LIMITE.limit({ key: ip })
  return success
}

// A API da página do publicador: publicar, versão nova, voltar, ver o jogo
async function api(request, env, acao, base) {
  const origem = request.headers.get('Origin') || ''
  const permitida = origensPermitidas(env).includes(origem)
  const cors = cabecalhosCors(permitida ? origem : ORIGEM)
  if (request.method === 'OPTIONS') return new Response(null, { status: permitida ? 204 : 403, headers: cors })
  if (request.method !== 'POST') return json({ erro: 'Use POST' }, 405, cors)
  if (!permitida) return json({ erro: 'Origem não permitida' }, 403, cors)
  if (!env.JOGOS) return json({ erro: 'A publicação sem conta ainda não foi ligada.' }, 503, cors)

  let corpo
  try {
    corpo = await request.json()
  } catch {
    return json({ erro: 'Corpo inválido' }, 400, cors)
  }
  if (!corpo || typeof corpo !== 'object') return json({ erro: 'Corpo inválido' }, 400, cors)

  // Ver o jogo só lê: não gasta o limite
  if (acao !== 'jogo' && !(await limite(env, request))) return json({ erro: 'Muitos envios seguidos. Espere um minuto e tente de novo.' }, 429, cors)

  if (acao === 'publicar') {
    const nome = limparNome(corpo.nome)
    if (!nome) return json({ erro: 'Dê um nome ao jogo.' }, 400, cors)
    const problema = conferirHtml(corpo.html)
    if (problema) return json({ erro: problema }, problema.includes('2 MB') ? 413 : 400, cors)
    let id = sortear(8)
    for (let tentativa = 0; tentativa < 5 && (await env.JOGOS.head(`jogos/${id}/info.json`)); tentativa++) id = sortear(8)
    const codigo = novoCodigo()
    const info = { nome, criado: dataCurta(), atualizado: dataCurta(), codigo: await resumo(codigo), versoes: [], denuncias: null }
    await guardarVersao(env, id, info, corpo.html)
    return json({ ...resumoDoJogo(base, id, info), codigo }, 201, cors)
  }

  // As outras ações pedem o jogo e o código de edição dele
  const id = String(corpo.id || '').trim().toLowerCase()
  if (!idValido(id)) return json({ erro: 'Confira o link do jogo.' }, 400, cors)
  const info = await lerInfo(env, id)
  if (!info || info.removido) return json({ erro: 'Não achei esse jogo. Confira o link.' }, 404, cors)
  if (!corpo.codigo || (await resumo(corpo.codigo)) !== info.codigo) return json({ erro: 'O código de edição não confere.' }, 403, cors)

  if (acao === 'jogo') {
    const atual = await env.JOGOS.get(`jogos/${id}/v${info.versoes.at(-1).n}.html`)
    return json({ ...resumoDoJogo(base, id, info), html: atual ? await atual.text() : '' }, 200, cors)
  }
  if (acao === 'versao') {
    const problema = conferirHtml(corpo.html)
    if (problema) return json({ erro: problema }, problema.includes('2 MB') ? 413 : 400, cors)
    await guardarVersao(env, id, info, corpo.html)
    return json(resumoDoJogo(base, id, info), 200, cors)
  }
  if (acao === 'voltar') {
    // Como no GitHub: a versão anterior volta como uma versão a mais, e a de agora continua guardada
    if (info.versoes.length < 2) return json({ erro: 'Este jogo ainda não tem versão anterior.' }, 409, cors)
    const anterior = await env.JOGOS.get(`jogos/${id}/v${info.versoes.at(-2).n}.html`)
    if (!anterior) return json({ erro: 'Não achei a versão anterior.' }, 404, cors)
    await guardarVersao(env, id, info, await anterior.text())
    return json(resumoDoJogo(base, id, info), 200, cors)
  }
  return json({ erro: 'Ação desconhecida' }, 404, cors)
}

// Denúncia: a página explica e o formulário marca o jogo para a equipe olhar. Não tira do ar sozinho,
// para ninguém derrubar o jogo de um professor só denunciando
async function denunciar(request, env, id, base) {
  const info = await lerInfo(env, id)
  if (!info) return naoAchou()
  if (info.removido) return saiuDoAr()
  if (request.method === 'GET') {
    const opcoes = Object.entries(MOTIVOS).map(([valor, texto], indice) =>
      `<label><input type="radio" name="motivo" value="${valor}"${indice === 0 ? ' checked' : ''}>${texto}</label>`).join('')
    return pagina('Denunciar', `<h1>Denunciar este jogo</h1><p>O jogo <b>${escapar(info.nome)}</b> tem algum problema? A equipe do GamificaPampa vai olhar. Não escreva nomes.</p><form method="post" action="/${id}/denunciar">${opcoes}<button type="submit">Mandar a denúncia</button></form>`, 200, true)
  }
  if (request.method !== 'POST') return pagina('Denunciar', '<h1>Use o botão Denunciar do jogo.</h1>', 405)
  // O formulário sai da própria página de denúncia, no endereço do Worker
  const mesmaOrigem = request.headers.get('Origin') === base || request.headers.get('Sec-Fetch-Site') === 'same-origin'
  if (!mesmaOrigem) return pagina('Denunciar', '<h1>Denúncia não aceita</h1><p>Use o botão Denunciar no canto do jogo.</p>', 403)
  if (!(await limite(env, request))) return pagina('Denunciar', '<h1>Muitas denúncias seguidas</h1><p>Espere um minuto e tente de novo.</p>', 429)
  let motivo = 'outro'
  try {
    const recebido = String((await request.formData()).get('motivo') || '')
    if (MOTIVOS[recebido]) motivo = recebido
  } catch {}
  const denuncias = info.denuncias || { total: 0, motivos: {} }
  denuncias.total += 1
  denuncias.motivos[motivo] = (denuncias.motivos[motivo] || 0) + 1
  denuncias.ultima = dataCurta()
  info.denuncias = denuncias
  await gravarInfo(env, id, info)
  await env.JOGOS.put(`denuncias/${id}`, String(denuncias.total))
  return pagina('Denúncia recebida', `<h1>Obrigado!</h1><p>A equipe do GamificaPampa vai olhar o jogo.</p><a class="botao" href="/${id}">Voltar ao jogo</a>`)
}

// A equipe: lista os jogos denunciados e tira um jogo do ar, com o segredo ADMIN_CHAVE
async function equipe(request, env, partes, base) {
  if (!env.ADMIN_CHAVE) return json({ erro: 'Falta o segredo ADMIN_CHAVE.' }, 503)
  if (request.headers.get('Authorization') !== `Bearer ${env.ADMIN_CHAVE}`) return json({ erro: 'Sem permissão' }, 401)
  if (request.method === 'GET' && partes[1] === 'denuncias') {
    const lista = await env.JOGOS.list({ prefix: 'denuncias/' })
    const jogos = []
    for (const objeto of lista.objects) {
      const id = objeto.key.slice('denuncias/'.length)
      const info = await lerInfo(env, id)
      if (info && !info.removido) jogos.push({ id, nome: info.nome, link: `${base}/${id}`, denuncias: info.denuncias })
    }
    return json({ jogos })
  }
  if (request.method === 'DELETE' && idValido(partes[1])) {
    const id = partes[1]
    const info = await lerInfo(env, id)
    if (!info) return json({ erro: 'Não achei esse jogo.' }, 404)
    await env.JOGOS.delete(info.versoes.map((versao) => `jogos/${id}/v${versao.n}.html`))
    await env.JOGOS.delete(`denuncias/${id}`)
    // O info fica, sem o código e sem as versões, para o link avisar que o jogo saiu do ar e o id não ser reusado
    await gravarInfo(env, id, { nome: info.nome, removido: dataCurta(), versoes: [] })
    return json({ removido: id })
  }
  return json({ erro: 'Ação desconhecida' }, 404)
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const base = url.origin
    const partes = url.pathname.split('/').filter(Boolean)

    if (['publicar', 'versao', 'voltar', 'jogo'].includes(partes[0]) && partes.length === 1) return api(request, env, partes[0], base)
    if (partes[0] === 'equipe') return equipe(request, env, partes, base)
    if (!env.JOGOS) return pagina('Jogos', '<h1>Ainda não ligado</h1><p>A publicação sem conta ainda não foi ligada.</p>', 503)

    if (partes.length === 0) {
      return pagina('Jogos', '<h1>Jogos dos professores</h1><p>Aqui ficam os jogos que professores publicaram com o GamificaPampa. Para publicar o seu, use o <a href="https://gamificapampa.github.io/publicador/">Publicador</a>.</p>')
    }
    if (!idValido(partes[0])) return naoAchou()
    const id = partes[0]
    if (partes[1] === 'denunciar' && partes.length === 2) return denunciar(request, env, id, base)
    if (partes.length > 1) return naoAchou()
    if (!['GET', 'HEAD'].includes(request.method)) return pagina('Jogos', '<h1>Use o link do jogo.</h1>', 405)

    const info = await lerInfo(env, id)
    if (!info) return naoAchou()
    if (info.removido) return saiuDoAr()
    const atual = await env.JOGOS.get(`jogos/${id}/v${info.versoes.at(-1).n}.html`)
    if (!atual) return naoAchou()
    return servirJogo(id, await atual.text())
  },
}
