// Robô testador: joga o jogo sozinho, numa moldura isolada e sem som, e conta se ele travou,
// se deu erro durante a partida ou se o Jogar de novo não volta ao começo.
// Nasceu do teste de 10/11 no ChatGPT, em que três de quatro jogos travaram na passagem de fase.
// O jogo nunca alcança esta página: a moldura não tem allow-same-origin, e o relatório volta por postMessage.
(function () {
  'use strict'

  // Roda dentro da moldura, antes do jogo. Vira texto e vai junto do HTML, então não pode usar nada de fora
  function preparar() {
    // Na moldura isolada não há localStorage: sem isto, o jogo que guarda o recorde quebra na prévia e funciona depois de publicado
    const memoria = () => {
      const dados = new Map()
      return {
        getItem: (k) => (dados.has(String(k)) ? dados.get(String(k)) : null),
        setItem: (k, v) => { dados.set(String(k), String(v)) },
        removeItem: (k) => { dados.delete(String(k)) },
        clear: () => { dados.clear() },
        key: (i) => [...dados.keys()][i] ?? null,
        get length() { return dados.size }
      }
    }
    for (const nome of ['localStorage', 'sessionStorage']) {
      try { window[nome].length } catch { try { Object.defineProperty(window, nome, { value: memoria(), configurable: true }) } catch {} }
    }
  }

  function jogar(TEMPO_MAX) {
    const erros = []
    const janelas = []
    const avisar = (dados) => parent.postMessage(Object.assign({ roboTestador: true }, dados), '*')
    addEventListener('error', (e) => { if (e.message) erros.push({ msg: e.message, linha: e.lineno || 0 }) })
    addEventListener('unhandledrejection', (e) => erros.push({ msg: String((e.reason && e.reason.message) || e.reason), linha: 0 }))

    // Silêncio: o robô joga escondido, e o som não pode tocar na sala
    const fantasma = new Proxy(function () {}, {
      get: (alvo, chave) => (chave === Symbol.toPrimitive ? () => 0 : chave === 'then' ? undefined : fantasma),
      set: () => true,
      apply: () => fantasma,
      construct: () => fantasma
    })
    window.AudioContext = window.webkitAudioContext = function () { return fantasma }
    try { HTMLMediaElement.prototype.play = function () { return Promise.resolve() } } catch {}
    try { Object.defineProperty(window, 'speechSynthesis', { value: { speak() {}, cancel() {}, pause() {}, resume() {}, getVoices: () => [], speaking: false, addEventListener() {} } }) } catch {}
    window.alert = (m) => { janelas.push(String(m)) }
    window.confirm = (m) => { janelas.push(String(m)); return true }
    window.prompt = (m) => { janelas.push(String(m)); return '' }

    const espera = (ms) => new Promise((r) => setTimeout(r, ms))
    const visivel = (el) => {
      if (!el.getClientRects().length) return false
      const estilo = getComputedStyle(el)
      return estilo.visibility !== 'hidden' && estilo.display !== 'none' && Number(estilo.opacity) > 0.05
    }
    const texto = (el) => (el.innerText || el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()
    const clicaveis = () => [...document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"], [onclick]')]
      .filter((el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true' && visivel(el))
    // O que o robô enxerga da tela: o texto e quais botões estão ligados
    const retrato = () => document.body.innerText.replace(/\s+/g, ' ') + '|' + clicaveis().length + '|' +
      [...document.querySelectorAll('button')].map((b) => (b.disabled ? 0 : 1) + b.className).join('')

    const RECOMECAR = /jogar de novo|jogar novamente|recome[cç]ar|reiniciar|nova partida|come[cç]ar de novo/i
    const TREINAR = /treinar|revisar os erros|refazer os erros/i
    const AVANCAR = /^(jogar|come[cç]ar|iniciar|pr[óo]xim|continuar|avan[cç]ar|seguir|ok\b|vamos|entendi|pronto|abrir|enfrentar|ir para|ver resultado|terminar|finalizar|desafio)/i
    const CONTROLE = /\b(som|m[uú]sica|ouvir|ler sozinho|tela cheia|tel[ãa]o|professor|dica|voltar|menu|pausar|ajuda|instru[cç])/i
    // Estes nunca, nem como último recurso: só ligam e desligam coisas da tela
    const NUNCA = /\b(som|m[uú]sica|ouvir|ler sozinho|tela cheia|tel[ãa]o|professor)/i

    async function partida() {
      const inicio = Date.now()
      let jogadas = 0, paradas = 0, chegouAoFim = false, treinou = false, recomecou = false
      await espera(600)
      while (Date.now() - inicio < TEMPO_MAX) {
        const botoes = clicaveis()
        const nomes = botoes.map(texto)
        let alvo = null, acao = 'responder'
        const recomecar = botoes.find((b) => RECOMECAR.test(texto(b)))
        if (recomecar && (/fim|parab[ée]ns|conclu|estrela|acertou|resultado|pontos|venceu|terminou/i.test(document.body.innerText) || !botoes.some((b) => !RECOMECAR.test(texto(b)) && !TREINAR.test(texto(b)) && !CONTROLE.test(texto(b))))) {
          chegouAoFim = true
          const treinar = botoes.find((b) => TREINAR.test(texto(b)))
          if (treinar && !treinou) { alvo = treinar; acao = 'treinar'; treinou = true }
          else if (recomecou) return { chegouAoFim, recomecou: true, jogadas, treinou }
          else { alvo = recomecar; acao = 'recomecar' }
        }
        if (!alvo) alvo = botoes.find((b) => AVANCAR.test(texto(b)) && !RECOMECAR.test(texto(b)))
        if (!alvo) {
          const opcoes = botoes.filter((b) => !CONTROLE.test(texto(b)) && !RECOMECAR.test(texto(b)) && !TREINAR.test(texto(b)))
          alvo = opcoes[Math.floor(Math.random() * opcoes.length)]
        }
        // Último recurso: um botão como Dica ou Sair do laboratório pode ser o caminho que o jogo quer
        if (!alvo) alvo = botoes.find((b) => !NUNCA.test(texto(b)) && !RECOMECAR.test(texto(b)))
        if (!alvo) {
          paradas++
          if (paradas >= 5) return { travou: true, jogadas, tela: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 160), botoes: nomes.slice(0, 6), chegouAoFim }
          await espera(800)
          continue
        }
        const antes = retrato()
        trilha.push(acao[0] + ':' + texto(alvo).slice(0, 24))
        if (trilha.length > 12) trilha.shift()
        // Desenho SVG com onclick não tem .click(): aí vai um clique de verdade, como o do dedo
        if (typeof alvo.click === 'function') alvo.click()
        else alvo.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
        jogadas++
        if (acao === 'recomecar') {
          // Depois do Jogar de novo, o jogo precisa voltar a ter o que tocar e não pode continuar na tela final
          await espera(900)
          const depois = clicaveis().filter((b) => !CONTROLE.test(texto(b)))
          if (retrato() === antes || !depois.length || depois.every((b) => RECOMECAR.test(texto(b)))) return { chegouAoFim, recomecou: false, jogadas, treinou, tela: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 160) }
          recomecou = true
          // Uma jogada a mais na partida nova, para ver que ela anda
          continue
        }
        let mudou = false
        for (let t = 0; t < 15 && !mudou; t++) { await espera(100); mudou = retrato() !== antes }
        if (mudou) paradas = 0
        else if (++paradas >= 6) return { travou: true, jogadas, tela: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 160), botoes: nomes.slice(0, 6), chegouAoFim }
        if (recomecou) return { chegouAoFim, recomecou: true, jogadas, treinou }
      }
      return { semFim: true, jogadas, chegouAoFim, treinou }
    }

    // As últimas jogadas, para entender um relatório estranho
    const trilha = []
    const comecar = () => partida()
      .then((r) => avisar(Object.assign(r, { erros: erros.slice(0, 3), janelas: janelas.length, trilha })))
      // Um erro do próprio robô não é culpa do jogo: vai à parte, e a página só diz que ele não conseguiu jogar
      .catch((e) => avisar({ erros: erros.slice(0, 3), janelas: janelas.length, quebrou: true, erroDoRobo: String(e && e.message), trilha }))
    if (document.readyState === 'complete') comecar()
    else addEventListener('load', comecar)
  }

  // Põe um script logo depois do <head>, na mesma linha, para o erro do jogo continuar apontando a linha certa do código
  function injetar(html, codigo) {
    const tag = `<script>${codigo}<\/script>`
    const lugar = html.match(/<head\b[^>]*>/i) || html.match(/<html\b[^>]*>/i)
    if (lugar) return html.slice(0, lugar.index + lugar[0].length) + tag + html.slice(lugar.index + lugar[0].length)
    const doctype = html.match(/^\s*<!doctype[^>]*>/i)
    return doctype ? doctype[0] + tag + html.slice(doctype[0].length) : tag + html
  }

  const PREPARO = '(' + preparar.toString() + ')();'

  // A prévia que o professor joga também ganha a memória de mentira
  function paraPrevia(html) { return injetar(html, PREPARO) }

  // Só uma partida por vez: um código novo cancela a anterior e tira a moldura dela
  let parar = null
  function testar(html, tempoMax = 40000) {
    if (parar) parar()
    return new Promise((resolver) => {
      const moldura = document.createElement('iframe')
      moldura.setAttribute('sandbox', 'allow-scripts')
      moldura.setAttribute('aria-hidden', 'true')
      moldura.tabIndex = -1
      // Na tela, mas invisível: moldura fora da tela tem a animação congelada pelo navegador
      moldura.style.cssText = 'position:fixed;right:0;bottom:0;width:390px;height:720px;opacity:0;pointer-events:none;border:0;z-index:-1'
      const fim = (relatorio) => {
        clearTimeout(limite)
        removeEventListener('message', ouvir)
        moldura.remove()
        parar = null
        resolver(relatorio)
      }
      parar = () => fim({ cancelado: true })
      const codigo = PREPARO + '(' + jogar.toString() + ')(' + Number(tempoMax) + ');'
      // O script injetado ocupa várias linhas: o erro de uma linha do jogo volta para o número do código original
      const injetado = injetar(html, codigo)
      const linhaDoScript = injetado.slice(0, injetado.indexOf(codigo)).split('\n').length
      const linhasAMais = codigo.split('\n').length - 1
      // O relatório chega da moldura onde o jogo roda, e o jogo pode forjar a mensagem: só passa o que tem o tipo certo
      const limpo = (d) => ({
        chegouAoFim: d.chegouAoFim === true,
        recomecou: d.recomecou === true ? true : d.recomecou === false ? false : undefined,
        treinou: d.treinou === true,
        travou: d.travou === true,
        semFim: d.semFim === true,
        quebrou: d.quebrou === true,
        erroDoRobo: String(d.erroDoRobo || '').slice(0, 200),
        jogadas: Math.max(0, Math.floor(Number(d.jogadas) || 0)),
        tela: String(d.tela || '').slice(0, 160),
        botoes: (Array.isArray(d.botoes) ? d.botoes : []).slice(0, 6).map((b) => String(b).slice(0, 40)),
        trilha: (Array.isArray(d.trilha) ? d.trilha : []).slice(0, 12).map((b) => String(b).slice(0, 30)),
        erros: (Array.isArray(d.erros) ? d.erros : []).slice(0, 3).map((e) => {
          let linha = Math.floor(Number(e && e.linha) || 0)
          if (linha > linhaDoScript) linha -= linhasAMais
          else if (linha === linhaDoScript) linha = 0
          return { msg: String((e && e.msg) || '').slice(0, 200), linha }
        })
      })
      const ouvir = (e) => { if (e.source === moldura.contentWindow && e.data && e.data.roboTestador) fim(limpo(e.data)) }
      const limite = setTimeout(() => fim({ semResposta: true }), tempoMax + 8000)
      addEventListener('message', ouvir)
      moldura.srcdoc = injetado
      document.body.append(moldura)
    })
  }

  window.RoboTestador = { testar, paraPrevia, cancelar: () => { if (parar) parar() } }
})()
