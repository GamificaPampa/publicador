// Um bucket R2 de mentira, guardado na memória, com o que o Worker usa: get, head, put, delete e list
export function r2Falso() {
  const dados = new Map()
  const objeto = (chave, valor) => ({ key: chave, text: async () => valor, json: async () => JSON.parse(valor) })
  return {
    dados,
    async get(chave) { return dados.has(chave) ? objeto(chave, dados.get(chave)) : null },
    async head(chave) { return dados.has(chave) ? { key: chave } : null },
    async put(chave, valor) { dados.set(chave, typeof valor === 'string' ? valor : String(valor)) },
    async delete(chaves) { for (const chave of [].concat(chaves)) dados.delete(chave) },
    async list({ prefix = '' } = {}) { return { objects: [...dados.keys()].filter((c) => c.startsWith(prefix)).map((key) => ({ key })), truncated: false } },
  }
}
