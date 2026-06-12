import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Container } from '../components/layout/Container.jsx'
import { Card } from '../components/ui/Card.jsx'
import { Input } from '../components/ui/Input.jsx'
import { Button } from '../components/ui/Button.jsx'
import { SkeletonRows } from '../components/ui/Skeleton.jsx'
import { api } from '../lib/api'
import { signalColor } from '../lib/formatters'

function SignalDot({ type }) {
  const color =
    type === 'BUY' ? 'bg-positive' : type === 'SELL' ? 'bg-negative' : 'bg-text-dim'
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
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
      api
        .searchStocks(query)
        .then(setResults)
        .catch(() => setResults([]))
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
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-head font-semibold">Watchlist</h1>
        <div className="relative w-72">
          <Input
            className="w-full"
            placeholder="Add stock — search symbol or name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={adding}
          />
          {results.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-surface border border-border rounded-md max-h-64 overflow-auto">
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => add(r.symbol)}
                  className="w-full text-left px-3 py-2 hover:bg-bg flex justify-between items-center"
                >
                  <span className="text-body">{r.symbol}</span>
                  <span className="text-label text-text-dim truncate ml-2">{r.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <div className="text-negative text-body mb-4">{error}</div>}

      <Card className="p-2">
        {!items ? (
          <SkeletonRows rows={6} className="p-2" />
        ) : items.length === 0 ? (
          <div className="text-text-dim text-body py-10 text-center">
            Watchlist is empty. Search above to add a stock.
          </div>
        ) : (
          <div>
            {items.map((it) => (
              <div
                key={it.id}
                onClick={() => navigate(`/intelligence/${it.symbol}`)}
                className="flex items-center justify-between px-3 py-3 border-b border-border/50 last:border-0 hover:bg-bg cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <SignalDot type={it.latest_signal} />
                  <div>
                    <div className="text-body font-medium">{it.symbol}</div>
                    <div className="text-label text-text-dim">{it.name}</div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className={`text-body ${signalColor(it.latest_signal)}`}>
                      {it.latest_signal ?? 'No signal'}
                    </div>
                    {it.latest_confidence != null && (
                      <div className="text-label text-text-dim">
                        {Number(it.latest_confidence).toFixed(0)}% confidence
                      </div>
                    )}
                  </div>
                  <Button variant="ghost" onClick={(e) => remove(it.id, e)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Container>
  )
}
