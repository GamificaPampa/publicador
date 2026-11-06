// Serve o Worker de verdade na porta 8803, com o R2 na memória, para testar a página do publicador no computador.
// Os jogos somem quando o servidor para
import http from 'node:http'
import worker from '../worker.js'
import { r2Falso } from './r2-falso.mjs'
const PORTA = 8803
const env = {
  JOGOS: r2Falso(),
  ADMIN_CHAVE: 'teste',
  ORIGENS_EXTRA: 'http://127.0.0.1:8797,http://localhost:8797,http://127.0.0.1:8802,http://localhost:8802',
}
http.createServer(async (req, res) => {
  const partes = []
  for await (const p of req) partes.push(p)
  const corpo = Buffer.concat(partes)
  const r = await worker.fetch(new Request(`http://127.0.0.1:${PORTA}` + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : corpo }), env)
  res.writeHead(r.status, Object.fromEntries(r.headers))
  res.end(Buffer.from(await r.arrayBuffer()))
}).listen(PORTA, '127.0.0.1', () => console.log(`Worker dos jogos em http://127.0.0.1:${PORTA}/`))
