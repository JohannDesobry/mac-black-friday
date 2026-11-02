// Writes dist/deals.json (read by boltai.com/blackfriday) and the deal tables in README.md.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readCategories, readDeals, root } from './lib.mjs'

const categories = readCategories()
const deals = readDeals().map(({ file, deal }) => ({ id: file.replace(/\.json$/, ''), ...deal }))

mkdirSync(join(root, 'dist'), { recursive: true })
writeFileSync(join(root, 'dist/deals.json'), JSON.stringify({ updatedAt: new Date().toISOString(), categories, deals }, null, 2) + '\n')

const money = (n) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`
const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ')
function offer(deal) {
  const parts = [`**${deal.discount}**`]
  if (deal.code) parts.push(`code **${deal.code}**`)
  for (const p of deal.prices || []) parts.push(p.before ? `${p.plan} ~~${money(p.before)}~~ ${money(p.after)}` : `${p.plan} ${money(p.after)}`)
  if (deal.terms) parts.push(deal.terms)
  parts.push(`until ${new Date(deal.ends + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`)
  return parts.join(', ')
}

const sections = []
for (const category of categories) {
  const rows = deals.filter((d) => d.category === category.id).sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name))
  if (!rows.length) continue
  sections.push(`### ${category.name}\n\n| App | Platforms | What it does | Deal |\n| --- | --- | --- | --- |\n` +
    rows.map((d) => `| [${cell(d.name)}](${d.url}) | ${d.platforms.join(', ')} | ${cell(d.description || '')} | ${cell(offer(d))} |`).join('\n'))
}

const readmePath = join(root, 'README.md')
const readme = readFileSync(readmePath, 'utf8')
const start = '<!-- deals:start -->'
const end = '<!-- deals:end -->'
const body = `${start}\n\n${sections.join('\n\n') || '_No deals yet. Be the first: see [CONTRIBUTING.md](CONTRIBUTING.md)._'}\n\n${end}`
writeFileSync(readmePath, readme.replace(new RegExp(`${start}[\\s\\S]*${end}`), body))
console.log(`${deals.length} deals in ${sections.length} categories`)
