// Thin fetch wrapper. Every backend response is { success, data, error };
// this unwraps `data` on success and throws `error` otherwise.
const BASE = import.meta.env.VITE_API_URL ?? ''

async function request(path, options = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  let body
  try {
    body = await res.json()
  } catch {
    throw new Error(`Bad response from server (${res.status})`)
  }
  if (!res.ok || !body.success) {
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  return body.data
}

export const api = {
  // Stocks
  searchStocks: (q) => request(`/stocks?search=${encodeURIComponent(q)}`),
  getStock: (symbol) => request(`/stocks/${symbol}`),
  getCandles: (symbol, days = 260) => request(`/stocks/${symbol}/candles?days=${days}`),

  // Watchlist
  getWatchlist: () => request('/watchlist'),
  addToWatchlist: (symbol, notes) =>
    request('/watchlist', { method: 'POST', body: JSON.stringify({ symbol, notes }) }),
  removeFromWatchlist: (id) => request(`/watchlist/${id}`, { method: 'DELETE' }),

  // Signals
  getSignals: (limit = 10, symbol) =>
    request(`/signals?limit=${limit}${symbol ? `&symbol=${encodeURIComponent(symbol)}` : ''}`),
  getSignal: (id) => request(`/signals/${id}`),
  generateSignal: (symbol) =>
    request('/signals/generate', { method: 'POST', body: JSON.stringify({ symbol }) }),

  // Outcomes
  getOutcomeStats: (days = 30) => request(`/outcomes/stats?days=${days}`),
  getOutcomes: (limit = 20) => request(`/outcomes?limit=${limit}`),

  // Paper trades
  getTrades: (status) => request(`/trades${status ? `?status=${status}` : ''}`),
  getTradeStats: () => request('/trades/stats'),
  createTrade: (signalId, quantity) =>
    request('/trades', { method: 'POST', body: JSON.stringify({ signalId, quantity }) }),
  closeTrade: (id) => request(`/trades/${id}/close`, { method: 'POST' }),
  evaluateTrades: () => request('/trades/evaluate', { method: 'POST' }),

  // Auth
  getAuthStatus: () => request('/auth/status'),
}
