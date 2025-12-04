import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encode } from 'gpt-tokenizer'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outputDir = resolve(__dirname, 'output')

const reporters = ['default', 'json', 'toon']

// Collect token counts
const tokens: Record<string, number> = {}
for (const name of reporters) {
  const content = readFileSync(resolve(outputDir, `${name}.txt`), 'utf-8')
  tokens[name] = encode(content).length
}

console.log('\n=== Reporter Token Comparison ===\n')

// Header row
console.log('| tokens   |' + reporters.map(r => r.padStart(10)).join(' |') + ' |')
console.log('|----------|' + reporters.map(() => '----------').join('|') + '|')

// Absolute tokens row
console.log('| absolute |' + reporters.map(r => tokens[r].toString().padStart(10)).join(' |') + ' |')

// Comparison rows
for (const base of reporters) {
  const row = reporters.map(compare => {
    if (base === compare) return '-'.padStart(10)
    const diff = tokens[compare] - tokens[base]
    const pct = (diff / tokens[base] * 100).toFixed(0)
    const sign = diff > 0 ? '+' : ''
    return `${sign}${pct}%`.padStart(10)
  })
  console.log(`| vs ${base.padEnd(5)}|${row.join(' |')} |`)
}

console.log()
