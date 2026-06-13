// Backend returns NUMERIC/BIGINT columns as strings (pg default). These helpers
// coerce + format consistently for display.

export function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

export function inr(v) {
  const n = num(v)
  if (n === null) return '—'
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function pct(v, withSign = true) {
  const n = num(v)
  if (n === null) return '—'
  const sign = withSign && n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

export function signalColor(type) {
  if (type === 'BUY') return 'text-positive'
  if (type === 'SELL') return 'text-negative'
  return 'text-text-dim'
}

export function outcomeColor(outcome) {
  if (outcome === 'WIN') return 'text-positive'
  if (outcome === 'LOSS') return 'text-negative'
  return 'text-text-dim'
}

// All timestamps from the API are UTC (timestamptz). Display in IST consistently
// regardless of the viewer's browser timezone.
const IST = 'Asia/Kolkata'

export function shortDate(v) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('en-IN', {
    timeZone: IST,
    day: '2-digit',
    month: 'short',
  })
}

export function dateTime(v) {
  if (!v) return '—'
  return new Date(v).toLocaleString('en-IN', {
    timeZone: IST,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
