// Testes do Worker dos jogos sem conta, sem rede e sem Cloudflare: o R2 e o limite são simulados
import worker from '../worker.js'
import { r2Falso } from './r2-falso.mjs'
const BASE = 'https://jogos.teste'
const ORG = 'https://gamificapampa.github.io'
let usados = 0
const env = { JOGOS: r2Falso(), ADMIN_CHAVE: 'segredo', ORIGENS_EXTRA: 'http://127.0.0.1:8802', LIMITE: { limit: async () => ({ success: ++usados <= 1000 }) } }
const JOGO = '<!doctype html><html lang="pt-BR"><head><title>Teste</title></head><body><h1>Fase 1</h1><script>console.log(1)</script></body></html>'
const chamar = async (caminho, opcoes = {}, e = env) => {
  const cabecalhos = { ...(opcoes.origem === null ? {} : { Origin: opcoes.origem ?? ORG }), ...(opcoes.cabecalhos || {}) }
  if (opcoes.corpo !== undefined && !cabecalhos['Content-Type']) cabecalhos['Content-Type'] = 'application/json'
  const corpo = opcoes.corpo === undefined ? undefined : (typeof opcoes.corpo === 'string' ? opcoes.corpo : JSON.stringify(opcoes.corpo))
  const r = await worker.fetch(new Request(BASE + caminho, { method: opcoes.method || 'POST', headers: cabecalhos, body: corpo }), e)
  const texto = await r.text()
  let dados = null
  try { dados = JSON.parse(texto) } catch {}
  return { status: r.status, h: r.headers, texto, dados }
}
const casos = []
const ver = (nome, ok, extra) => casos.push(`${ok ? 'ok   ' : 'FALHA'} ${nome}${ok ? '' : ' ' + JSON.stringify(extra?.dados ?? extra?.status ?? extra).slice(0, 300)}`)
let r

// Origem e formato
r = await chamar('/publicar', { method: 'OPTIONS' }); ver('preflight da org', r.status === 204 && r.h.get('Access-Control-Allow-Origin') === ORG, r)
r = await chamar('/publicar', { method: 'OPTIONS', origem: 'https://outro.site' }); ver('preflight de fora recusado', r.status === 403, r)
r = await chamar('/publicar', { origem: 'https://outro.site', corpo: { nome: 'X', html: JOGO } }); ver('origem de fora recusada', r.status === 403, r)
r = await chamar('/publicar', { origem: null, corpo: { nome: 'X', html: JOGO } }); ver('sem origem recusado', r.status === 403, r)
r = await chamar('/publicar', { origem: 'http://127.0.0.1:8802', corpo: { nome: 'Local', html: JOGO } }); ver('origem local liberada', r.status === 201 && r.h.get('Access-Control-Allow-Origin') === 'http://127.0.0.1:8802', r)
r = await chamar('/publicar', { method: 'GET' }); ver('GET na API recusado', r.status === 405, r)
r = await chamar('/publicar', { corpo: '{quebrado' }); ver('corpo inválido', r.status === 400, r)
r = await chamar('/publicar', { corpo: { nome: '   ', html: JOGO } }); ver('sem nome', r.status === 400 && /nome/.test(r.dados.erro), r)
r = await chamar('/publicar', { corpo: { nome: 'Texto', html: 'só um texto' } }); ver('não é HTML', r.status === 400, r)
r = await chamar('/publicar', { corpo: { nome: 'Grande', html: '<html>' + 'x'.repeat(2 * 1024 * 1024) } }); ver('maior que 2 MB recusado', r.status === 413, r)
r = await chamar('/publicar', { corpo: { nome: 'No limite', html: '<html>' + 'x'.repeat(2 * 1024 * 1024 - 6) } }); ver('2 MB exatos passam', r.status === 201, r)
r = await chamar('/publicar', { corpo: { nome: 'X', html: JOGO } }, { ...env, JOGOS: undefined }); ver('sem bucket: ainda não ligado', r.status === 503, r)

// Publicar e abrir
r = await chamar('/publicar', { corpo: { nome: '  Pizzaria <das> Frações\n', html: JOGO } })
const pub = r.dados
ver('publica e devolve id, link e código', r.status === 201 && /^[a-z2-9]{8}$/.test(pub.id) && pub.link === `${BASE}/${pub.id}` && /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/.test(pub.codigo), r)
ver('nome limpo', pub.nome === 'Pizzaria das Frações', pub)
const info = JSON.parse(env.JOGOS.dados.get(`jogos/${pub.id}/info.json`))
ver('o código não fica guardado, só o resumo', !JSON.stringify(info).includes(pub.codigo) && /^[0-9a-f]{64}$/.test(info.codigo), info)
r = await chamar('/' + pub.id, { method: 'GET', origem: null })
const csp = r.h.get('Content-Security-Policy') || ''
ver('abre o jogo', r.status === 200 && r.texto.includes('<h1>Fase 1</h1>') && /text\/html/.test(r.h.get('Content-Type')), r.status)
ver('jogo não manda nada para fora', csp.includes("connect-src 'none'") && csp.includes("form-action 'none'") && csp.includes('https://fonts.googleapis.com') && csp.includes('https://fonts.gstatic.com'), csp)
ver('nosniff e sem cache', r.h.get('X-Content-Type-Options') === 'nosniff' && r.h.get('Cache-Control') === 'no-cache', [...r.h])
ver('Denunciar antes do fim do body', /<a href="\/[a-z2-9]{8}\/denunciar"[^>]*>Denunciar<\/a><\/body>/.test(r.texto), r.texto.slice(-300))
r = await chamar('/abcdefgh', { method: 'GET', origem: null }); ver('jogo que não existe', r.status === 404, r.status)
r = await chamar('/nao-e-id', { method: 'GET', origem: null }); ver('endereço estranho', r.status === 404, r.status)
r = await chamar('/', { method: 'GET', origem: null }); ver('página inicial do Worker', r.status === 200 && /Publicador/.test(r.texto), r.status)
r = await chamar('/' + pub.id, { method: 'POST', origem: null }); ver('POST no jogo recusado', r.status === 405, r.status)

// Ver o jogo, versão nova e voltar, com o código
r = await chamar('/jogo', { corpo: { id: pub.id, codigo: 'errado-errado' } }); ver('código errado', r.status === 403, r)
r = await chamar('/jogo', { corpo: { id: 'zzzzzzzz', codigo: pub.codigo } }); ver('jogo inexistente na API', r.status === 404, r)
r = await chamar('/jogo', { corpo: { id: pub.id, codigo: ' ' + pub.codigo.toUpperCase() + ' ' } }); ver('ver o jogo com o código (maiúsculas e espaços)', r.status === 200 && r.dados.html === JOGO && r.dados.versoes.length === 1, r)
r = await chamar('/voltar', { corpo: { id: pub.id, codigo: pub.codigo } }); ver('voltar sem versão anterior', r.status === 409, r)
const v = (n) => JOGO.replace('Fase 1', 'Versão ' + n)
for (let n = 2; n <= 7; n++) r = await chamar('/versao', { corpo: { id: pub.id, codigo: pub.codigo, html: v(n) } })
ver('versão nova no mesmo link', r.status === 200 && r.dados.link === pub.link, r)
const guardadas = [...env.JOGOS.dados.keys()].filter((c) => c.startsWith(`jogos/${pub.id}/v`))
ver('guarda só as últimas 5 versões', guardadas.length === 5 && !guardadas.includes(`jogos/${pub.id}/v1.html`) && guardadas.includes(`jogos/${pub.id}/v7.html`), guardadas)
r = await chamar('/' + pub.id, { method: 'GET', origem: null }); ver('abre a versão mais nova', r.texto.includes('Versão 7'), r.texto.slice(0, 200))
r = await chamar('/versao', { corpo: { id: pub.id, codigo: pub.codigo, html: 'nada' } }); ver('versão que não é HTML', r.status === 400, r)
r = await chamar('/voltar', { corpo: { id: pub.id, codigo: pub.codigo } }); ver('voltar para a anterior', r.status === 200 && r.dados.versoes.length === 5, r)
r = await chamar('/' + pub.id, { method: 'GET', origem: null }); ver('a anterior voltou', r.texto.includes('Versão 6') && !r.texto.includes('Versão 7'), r.texto.slice(0, 200))
r = await chamar('/versao', { corpo: { id: 'curto', codigo: pub.codigo, html: JOGO } }); ver('id inválido', r.status === 400, r)

// Denúncia e equipe
const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' }
r = await chamar(`/${pub.id}/denunciar`, { method: 'GET', origem: null }); ver('página de denúncia', r.status === 200 && /Pizzaria das Frações/.test(r.texto) && /form-action 'self'/.test(r.h.get('Content-Security-Policy')), r.status)
ver('denúncia não abre em moldura de outro site', /frame-ancestors 'none'/.test(r.h.get('Content-Security-Policy')), r.h.get('Content-Security-Policy'))
r = await chamar(`/${pub.id}/denunciar`, { origem: ORG, corpo: 'motivo=golpe', cabecalhos: FORM }); ver('denúncia de outra origem recusada', r.status === 403, r.status)
r = await chamar(`/${pub.id}/denunciar`, { origem: BASE, corpo: 'motivo=golpe', cabecalhos: FORM }); ver('denúncia recebida', r.status === 200 && /Obrigado/.test(r.texto), r.status)
r = await chamar(`/${pub.id}/denunciar`, { origem: 'null', corpo: 'motivo=golpe', cabecalhos: { ...FORM, 'Sec-Fetch-Site': 'cross-site' } }); ver('denúncia com Origin null de fora recusada', r.status === 403, r.status)
r = await chamar(`/${pub.id}/denunciar`, { origem: 'null', corpo: 'motivo=%3Cscript%3E', cabecalhos: { ...FORM, 'Sec-Fetch-Site': 'same-origin' } }); ver('denúncia do próprio formulário com Origin null', r.status === 200, r.status)
const marcado = JSON.parse(env.JOGOS.dados.get(`jogos/${pub.id}/info.json`)).denuncias
ver('denúncia marca o jogo e o motivo estranho vira outro', marcado.total === 2 && marcado.motivos.golpe === 1 && marcado.motivos.outro === 1 && env.JOGOS.dados.has(`denuncias/${pub.id}`), marcado)
r = await chamar('/' + pub.id, { method: 'GET', origem: null }); ver('denúncia não tira do ar sozinha', r.status === 200, r.status)
r = await chamar('/equipe/denuncias', { method: 'GET', origem: null }); ver('equipe sem chave recusada', r.status === 401, r)
r = await chamar('/equipe/denuncias', { method: 'GET', origem: null }, { ...env, ADMIN_CHAVE: '' }); ver('sem ADMIN_CHAVE configurada', r.status === 503, r)
r = await chamar('/equipe/denuncias', { method: 'GET', origem: null, cabecalhos: { Authorization: 'Bearer segredo' } }); ver('equipe lista as denúncias', r.status === 200 && r.dados.jogos.length === 1 && r.dados.jogos[0].id === pub.id, r)
r = await chamar('/equipe/' + pub.id, { method: 'DELETE', origem: null, cabecalhos: { Authorization: 'Bearer segredo' } }); ver('equipe tira do ar', r.status === 200, r)
ver('versões apagadas', ![...env.JOGOS.dados.keys()].some((c) => c.startsWith(`jogos/${pub.id}/v`) || c === `denuncias/${pub.id}`), [...env.JOGOS.dados.keys()])
r = await chamar('/' + pub.id, { method: 'GET', origem: null }); ver('link avisa que saiu do ar', r.status === 410, r.status)
r = await chamar('/versao', { corpo: { id: pub.id, codigo: pub.codigo, html: JOGO } }); ver('jogo removido não aceita versão', r.status === 404, r)

// Limite por endereço
usados = 1000
r = await chamar('/publicar', { corpo: { nome: 'X', html: JOGO } }); ver('limite por endereço', r.status === 429 && /Espere um minuto/.test(r.dados.erro), r)
r = await chamar('/jogo', { corpo: { id: 'abcdefgh', codigo: 'x' } }); ver('ver o jogo não gasta o limite', r.status === 404, r)
r = await chamar('/publicar', { corpo: { nome: 'Sem limite', html: JOGO } }, { ...env, LIMITE: undefined }); ver('sem limite configurado', r.status === 201, r)

console.log(casos.join('\n'))
console.log(`\n${casos.filter((c) => c.startsWith('ok')).length} de ${casos.length} casos ok`)
process.exit(casos.some((c) => c.startsWith('FALHA')) ? 1 : 0)
