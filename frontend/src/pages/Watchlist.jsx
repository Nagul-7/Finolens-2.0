import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Container } from '../components/layout/Container.jsx'
import { Card } from '../components/ui/Card.jsx'
import { Input } from '../components/ui/Input.jsx'
import { SkeletonRows } from '../components/ui/Skeleton.jsx'
import { Sparkline } from '../components/charts/Sparkline.jsx'
import { api } from '../lib/api'
import { inr, pct, num } from '../lib/formatters'

function SignalDot({ type }) {
  const color = type === 'BUY' ? 'bg-positive' : type === 'SELL' ? 'bg-negative' : 'bg-muted'
  const label = type ?? 'No signal'
  return (
    <span className="inline-flex items-center gap-2" title={label}>
      <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
    </span>
  )
}

export default function Watchlist() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [adding, setAdding] = useState(false)
  const navigate = useNavigate()
  const searchTimer = useRef(null)

  function load() {
    api
      .getWatchlist()
      .then(setItems)
      .catch((e) => setError(e.message))
  }

  useEffect(load, [])

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!query.trim()) {
      setResults([])
      return
    }
    searchTimer.current = setTimeout(() => {
      api.searchStocks(query).then(setResults).catch(() => setResults([]))
    }, 200)
    return () => clearTimeout(searchTimer.current)
  }, [query])

  async function add(symbol) {
    setAdding(true)
    try {
      await api.addToWatchlist(symbol)
      setQuery('')
      setResults([])
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setAdding(false)
    }
  }

  async function remove(id, e) {
    e.stopPropagation()
    try {
      await api.removeFromWatchlist(id)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Container>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <h1 className="text-head font-semibold">Watchlist</h1>
        <div className="relative w-full sm:w-80">
          <Input
            className="w-full"
            placeholder="Add stock — search symbol or name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={adding}
          />
          {results.length > 0 && (
            <div className="absolute z-30 mt-1 w-full bg-elevated border border-border rounded-md shadow-elevated max-h-64 overflow-auto">
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => add(r.symbol)}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-surface flex justify-between items-center"
                >
                  <span className="text-body font-medium">{r.symbol}</span>
                  <span className="text-label text-text-dim truncate ml-2">{r.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <div className="text-negative text-body mb-4">{error}</div>}

      <Card className="overflow-hidden">
        {!items ? (
          <SkeletonRows rows={6} className="p-4" />
        ) : items.length === 0 ? (
          <div className="text-text-dim text-body py-14 text-center">
            Watchlist is empty. Search above to add a stock.
          </div>
        ) : (
          <div>
            {items.map((it) => {
              const q = it.quote
              const changePct = q ? num(q.change_pct) : null
              const up = changePct !== null && changePct >= 0
              return (
                <div
                  key={it.id}
                  onClick={() => navigate(`/intelligence/${it.symbol}`)}
                  className="group flex items-center gap-4 px-4 sm:px-5 py-4 border-b border-border last:border-0 hover:bg-elevated cursor-pointer transition-colors"
                >
                  {/* Symbol + name */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <SignalDot type={it.latest_signal} />
                    <div className="min-w-0">
                      <div className="text-body font-semibold text-text truncate">{it.symbol}</div>
                      <div className="text-label text-text-dim truncate">{it.name}</div>
                    </div>
                  </div>

                  {/* Price + change */}
                  <div className="text-right shrink-0 w-24 sm:w-28">
                    <div className="text-body text-text tabular-nums">
                      {q ? inr(q.ltp) : '—'}
                    </div>
                    <div
                      className={`text-label tabular-nums ${
                        changePct === null ? 'text-text-dim' : up ? 'text-positive' : 'text-negative'
                      }`}
                    >
                      {changePct === null ? '—' : pct(changePct)}
                    </div>
                  </div>

                  {/* Sparkline — hidden on the narrowest screens */}
                  <div className="hidden sm:block shrink-0">
                    <Sparkline data={q?.sparkline?.map(Number)} up={up} />
                  </div>

                  {/* Remove (reveals on hover, always tappable on mobile) */}
                  <button
                    onClick={(e) => remove(it.id, e)}
                    className="shrink-0 text-label text-muted hover:text-negative transition-colors px-2 py-1"
                    aria-label={`Remove ${it.symbol}`}
                  >
                    Remove
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </Container>
  )
}
