// Reviews one pull request and leaves one comment on it, plus a "ready" or "needs changes" label.
// Runs from the base branch (pull_request_target), so it never runs code from the pull request: the deal file is
// fetched through the GitHub API and only parsed as JSON.
import { readCategories, readDeals, validateDeal } from './lib.mjs'

const { GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, HEAD_SHA } = process.env
const MARKER = '<!-- deal-review -->'
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

async function main() {
  const files = await gh(`/pulls/${PR_NUMBER}/files?per_page=100`)
  const problems = []
  const notes = []

  const dealFiles = files.filter((f) => /^deals\/[^/]+\.json$/.test(f.filename) && f.status !== 'removed')
  const others = files.filter((f) => !dealFiles.includes(f))
  if (dealFiles.length === 0) problems.push('Add your deal as one file in `deals/`, like `deals/your-app.json`.')
  if (dealFiles.length > 1) problems.push('One deal per pull request, please: this one changes more than one file in `deals/`.')
  if (others.length) problems.push(`Only your deal file should change. Please remove: ${others.map((f) => '`' + f.filename + '`').join(', ')}.`)

  let deal
  let page
  if (dealFiles.length === 1) {
    const file = dealFiles[0].filename.replace(/^deals\//, '')
    const content = await gh(`/contents/${encodeURIComponent('deals/' + file).replace(/%2F/g, '/')}?ref=${HEAD_SHA}`)
    try {
      deal = JSON.parse(Buffer.from(content.content, 'base64').toString('utf8'))
    } catch {
      problems.push('`deals/' + file + '` is not valid JSON.')
    }
    if (deal) {
      const categoryIds = readCategories().map((c) => c.id)
      for (const error of validateDeal(file, deal, categoryIds)) problems.push(`\`${file}\`: ${error}.`)

      const others = readDeals().filter((d) => d.file !== file)
      try {
        const key = (url) => new URL(url).hostname.replace(/^www\./, '') + new URL(url).pathname.replace(/\/$/, '')
        const same = others.find((d) => key(d.deal.url) === key(deal.url))
        if (same) problems.push(`This app is already listed in \`deals/${same.file}\`. One entry per app.`)
      } catch {}
      const sameMaker = others.filter((d) => d.deal.maker === deal.maker).length
      if (sameMaker >= 3) problems.push(`${deal.maker} already has ${sameMaker} apps listed. The limit is 3 per maker.`)
      if (deal.featured) problems.push('`featured` is set by the maintainers for paid spots. Please remove it.')

      if (deal.url) {
        page = await checkPage(deal)
        if (!page.reachable) notes.push(`Couldn't check ${deal.url}: ${page.note}.`)
        else {
          if (!page.sale) notes.push("The linked page doesn't mention Black Friday or Cyber Monday yet. It needs to before we merge.")
          if (deal.prices?.length && !page.priceShown) notes.push("The sale price isn't on the linked page yet, or it is drawn by JavaScript. A maintainer will check.")
          if (page.codeShown === false) notes.push(`The code \`${deal.code}\` isn't on the linked page. That's fine if it's applied at checkout.`)
        }
      }
    }
  }

  const ready = problems.length === 0
  const lines = [MARKER]
  if (ready) {
    lines.push(`Thanks${deal?.maker ? ', ' + deal.maker : ''}! **${deal.name}** passes the checks.`)
    if (page?.reachable && page.sale && (page.priceShown || !deal.prices?.length)) lines.push('', 'Its page shows the Black Friday offer. A maintainer will merge it soon.')
    else lines.push('', 'A maintainer will look at the linked page and merge it once the Black Friday price and dates are shown there.')
  } else {
    lines.push('Thanks for adding your deal! A few things to fix first:', '', ...problems.map((p) => `- ${p}`), '', `Push a fix to this branch and I'll check again. The rules are in [CONTRIBUTING.md](https://github.com/${GITHUB_REPOSITORY}/blob/main/CONTRIBUTING.md).`)
  }
  if (notes.length) lines.push('', '**About the linked page**', '', ...notes.map((n) => `- ${n}`))
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
