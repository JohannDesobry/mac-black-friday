// Reviews one pull request (up to 5 deal files) and leaves one comment on it, plus a "ready" or "needs changes" label.
// Runs from the base branch (pull_request_target), so it never runs code from the pull request: the deal file is
// fetched through the GitHub API and only parsed as JSON.
import { readCategories, readDeals, validateDeal } from './lib.mjs'

const { GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, HEAD_SHA, PR_AUTHOR } = process.env
const MARKER = '<!-- deal-review -->'

// The maintainer's own pull requests (seeding deals, house apps) aren't reviewed.
if (PR_AUTHOR && PR_AUTHOR === process.env.GITHUB_REPOSITORY_OWNER) {
  console.log(`Pull request by the maintainer @${PR_AUTHOR}: no review.`)
  process.exit(0)
}
const LABELS = { ready: { name: 'ready', color: '2da44e' }, changes: { name: 'needs changes', color: 'd93f0b' } }

async function gh(path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!response.ok && response.status !== 404 && response.status !== 422)
    throw new Error(`${options.method || 'GET'} ${path}: ${response.status} ${await response.text()}`)
  return response.status === 204 ? null : response.json().catch(() => null)
}

/** What the deal's own page shows, as far as a plain fetch can tell. Many pages render with JavaScript, so a miss is
 *  a note for the reviewer, not a failure. */
async function checkPage(deal) {
  try {
    const response = await fetch(deal.url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) mac-black-friday-review' },
    })
    if (!response.ok) return { reachable: false, note: `the page answered ${response.status}` }
    const text = (await response.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase()
    const sale = /black ?friday|cyber ?monday|bfcm|holiday sale/.test(text)
    const prices = (deal.prices || []).map((p) => p.after)
    const priceShown = prices.some((price) => {
      const fixed = Number.isInteger(price) ? String(price) : price.toFixed(2)
      return text.includes(`$${fixed}`) || text.includes(`$ ${fixed}`) || text.includes(`${fixed} usd`)
    })
    const codeShown = deal.code ? text.includes(deal.code.toLowerCase()) : null
    return { reachable: true, sale, priceShown, codeShown }
  } catch (error) {
    return { reachable: false, note: error.name === 'TimeoutError' ? 'the page took too long' : 'the page could not be opened' }
  }
}

const MAX_DEALS = 5

/** How many deal files this GitHub account already has in merged pull requests. */
async function mergedDealCount(author) {
  const query = encodeURIComponent(`repo:${GITHUB_REPOSITORY} is:pr is:merged author:${author}`)
  const response = await fetch(`https://api.github.com/search/issues?q=${query}&per_page=50`, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
  })
  if (!response.ok) return 0
  let count = 0
  for (const pr of (await response.json()).items || []) {
    const prFiles = await gh(`/pulls/${pr.number}/files?per_page=100`)
    count += (prFiles || []).filter((f) => /^deals\/[^/]+\.json$/.test(f.filename) && f.status === 'added').length
  }
  return count
}

/** Checks one deal file. Returns its name, its problems and notes about its page. */
async function reviewDeal(file, existing, categoryIds) {
  const problems = []
  const notes = []
  const content = await gh(`/contents/${encodeURIComponent('deals/' + file).replace(/%2F/g, '/')}?ref=${HEAD_SHA}`)
  let deal
  try {
    deal = JSON.parse(Buffer.from(content.content, 'base64').toString('utf8'))
  } catch {
    return { name: file, problems: ['not valid JSON'], notes }
  }
  for (const error of validateDeal(file, deal, categoryIds)) problems.push(error)
  try {
    const key = (url) => new URL(url).hostname.replace(/^www\./, '') + new URL(url).pathname.replace(/\/$/, '')
    const same = existing.find((d) => d.file !== file && key(d.deal.url) === key(deal.url))
    if (same) problems.push(`already listed in \`deals/${same.file}\` (one entry per app)`)
  } catch {}
  if (deal.featured) problems.push('`featured` is set by the maintainers, please remove it')

  if (deal.url) {
    const page = await checkPage(deal)
    const startsLater = deal.starts && deal.starts > new Date().toISOString().slice(0, 10)
    if (!page.reachable) notes.push(`couldn't check the page: ${page.note}`)
    else if (startsLater) notes.push(`starts ${deal.starts}; the page can show the sale price from then`)
    else {
      if (!page.sale) notes.push("the page doesn't mention Black Friday yet")
      if (deal.prices?.length && !page.priceShown) notes.push("the sale price isn't on the page yet, or it's drawn by JavaScript")
      if (page.codeShown === false) notes.push(`the code \`${deal.code}\` isn't on the page (fine if it's applied at checkout)`)
    }
  }
  return { name: deal.name || file, problems, notes }
}

async function main() {
  const files = await gh(`/pulls/${PR_NUMBER}/files?per_page=100`)
  const problems = []

  const dealFiles = files.filter((f) => /^deals\/[^/]+\.json$/.test(f.filename) && f.status !== 'removed')
  const others = files.filter((f) => !dealFiles.includes(f))
  if (dealFiles.length === 0) problems.push('Add your deal as a file in `deals/`, like `deals/your-app.json`.')
  if (dealFiles.length > MAX_DEALS) problems.push(`Up to ${MAX_DEALS} deals per developer: this pull request has ${dealFiles.length}.`)
  if (others.length) problems.push(`Only your deal files should change. Please remove: ${others.map((f) => '`' + f.filename + '`').join(', ')}.`)

  // The 5-apps-per-developer limit counts deals already merged from this account plus the new ones here.
  if (PR_AUTHOR && dealFiles.length && dealFiles.length <= MAX_DEALS) {
    const merged = await mergedDealCount(PR_AUTHOR)
    if (merged + dealFiles.filter((f) => f.status === 'added').length > MAX_DEALS)
      problems.push(`@${PR_AUTHOR} already has ${merged} deal${merged === 1 ? '' : 's'} listed. The limit is ${MAX_DEALS} per developer.`)
  }

  const results = []
  if (dealFiles.length && dealFiles.length <= MAX_DEALS) {
    const categoryIds = readCategories().map((c) => c.id)
    const existing = readDeals()
    for (const f of dealFiles) results.push(await reviewDeal(f.filename.replace(/^deals\//, ''), existing, categoryIds))
  }

  const ready = problems.length === 0 && results.every((r) => r.problems.length === 0)
  const lines = [MARKER]
  lines.push(ready ? `Thanks${PR_AUTHOR ? ', @' + PR_AUTHOR : ''}! Everything passes the checks.` : 'Thanks for adding your deal! A few things to fix first:')
  if (problems.length) lines.push('', ...problems.map((p) => `- ${p}`))
  if (results.length) {
    lines.push('')
    for (const r of results) {
      lines.push(`- ${r.problems.length ? '❌' : '✅'} **${r.name}**${r.problems.length ? ': ' + r.problems.join('; ') : ''}`)
      for (const n of r.notes) lines.push(`  - ${n}`)
    }
  }
  lines.push('', ready ? 'A maintainer will merge it soon.' : `Push a fix to this branch and I'll check again. Here are the [rules](https://github.com/${GITHUB_REPOSITORY}/blob/main/RULES.md).`)
  const body = lines.join('\n')

  const comments = await gh(`/issues/${PR_NUMBER}/comments?per_page=100`)
  const mine = comments.find((c) => c.body?.startsWith(MARKER))
  if (mine) await gh(`/issues/comments/${mine.id}`, { method: 'PATCH', body: JSON.stringify({ body }) })
  else await gh(`/issues/${PR_NUMBER}/comments`, { method: 'POST', body: JSON.stringify({ body }) })

  for (const label of Object.values(LABELS)) await gh('/labels', { method: 'POST', body: JSON.stringify(label) })
  const add = ready ? LABELS.ready.name : LABELS.changes.name
  const remove = ready ? LABELS.changes.name : LABELS.ready.name
  await gh(`/issues/${PR_NUMBER}/labels/${encodeURIComponent(remove)}`, { method: 'DELETE' })
  await gh(`/issues/${PR_NUMBER}/labels`, { method: 'POST', body: JSON.stringify({ labels: [add] }) })

  console.log(body)
  if (!ready) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
