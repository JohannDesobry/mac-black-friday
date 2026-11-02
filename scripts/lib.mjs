import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export const root = new URL('..', import.meta.url).pathname
export const YEAR = 2026
export const PLATFORMS = ['macOS', 'iOS', 'iPadOS', 'visionOS', 'watchOS']
// Black Friday deals only: nothing that starts before November or runs past mid-December.
export const LATEST_END = `${YEAR}-12-15`
const SHORTENERS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at', 'is.gd']
const FIELDS = ['name', 'url', 'platforms', 'category', 'description', 'discount', 'code', 'prices', 'terms', 'starts', 'ends', 'maker', 'makerUrl', 'icon', 'featured']

export function readCategories() {
  return JSON.parse(readFileSync(join(root, 'categories.json'), 'utf8'))
}

export function readDeals() {
  const dir = join(root, 'deals')
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ file, deal: JSON.parse(readFileSync(join(dir, file), 'utf8')) }))
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
}

function checkUrl(value, label, errors) {
  let url
  try {
    url = new URL(value)
  } catch {
    errors.push(`${label} is not a valid URL`)
    return
  }
  if (url.protocol !== 'https:') errors.push(`${label} must use https`)
  if (SHORTENERS.includes(url.hostname.replace(/^www\./, ''))) errors.push(`${label} must not be a shortened link`)
}

/** Every problem with one deal file, as plain sentences. */
export function validateDeal(file, deal, categoryIds) {
  const errors = []
  const slug = file.replace(/\.json$/, '')
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) errors.push('file name must be lowercase-with-dashes.json')

  for (const key of Object.keys(deal)) if (!FIELDS.includes(key)) errors.push(`unknown field "${key}"`)
  for (const key of ['name', 'url', 'platforms', 'category', 'discount', 'ends'])
    if (deal[key] === undefined || deal[key] === '') errors.push(`"${key}" is required`)

  if (deal.url) checkUrl(deal.url, '"url"', errors)
  if (deal.makerUrl) checkUrl(deal.makerUrl, '"makerUrl"', errors)
  if (deal.icon) checkUrl(deal.icon, '"icon"', errors)

  if (deal.platforms !== undefined) {
    if (!Array.isArray(deal.platforms) || deal.platforms.length === 0) errors.push('"platforms" must list at least one platform')
    else for (const p of deal.platforms) if (!PLATFORMS.includes(p)) errors.push(`platform "${p}" is not one of ${PLATFORMS.join(', ')}`)
  }
  if (deal.category && !categoryIds.includes(deal.category)) errors.push(`category "${deal.category}" is not in categories.json`)
  if (typeof deal.description === 'string' && deal.description.length > 160) errors.push('"description" is longer than 160 characters')
  if (typeof deal.discount === 'string' && deal.discount.length > 30) errors.push('"discount" is longer than 30 characters')
  if (typeof deal.terms === 'string' && deal.terms.length > 160) errors.push('"terms" is longer than 160 characters')
  if (deal.featured !== undefined && typeof deal.featured !== 'boolean') errors.push('"featured" must be true or false')

  if (deal.prices !== undefined) {
    if (!Array.isArray(deal.prices) || deal.prices.length === 0) errors.push('"prices" must be a non-empty list')
    else
      for (const price of deal.prices) {
        if (!price.plan || typeof price.after !== 'number') errors.push('each price needs "plan" and a number "after"')
        if (price.before !== undefined && (typeof price.before !== 'number' || price.before <= price.after))
          errors.push(`price "${price.plan}": "before" must be a number above "after"`)
      }
  }

  for (const key of ['starts', 'ends']) if (deal[key] !== undefined && !isDate(deal[key])) errors.push(`"${key}" must be a date like ${YEAR}-11-27`)
  if (isDate(deal.ends || '')) {
    if (deal.ends < `${YEAR}-11-20` || deal.ends > LATEST_END) errors.push(`"ends" must be between ${YEAR}-11-20 and ${LATEST_END}`)
    if (deal.starts && isDate(deal.starts) && deal.starts > deal.ends) errors.push('"starts" is after "ends"')
  }
  if (deal.starts && isDate(deal.starts) && deal.starts < `${YEAR}-11-01`) errors.push(`"starts" must be ${YEAR}-11-01 or later`)
  return errors
}
