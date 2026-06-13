import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardLabel } from '../components/ui/Card.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Input } from '../components/ui/Input.jsx'
import { Skeleton } from '../components/ui/Skeleton.jsx'
import { PriceChart } from '../components/charts/PriceChart.jsx'
import { SignalCard } from '../components/signal/SignalCard.jsx'
import { PaperTradePanel } from '../components/signal/PaperTradePanel.jsx'
import { api } from '../lib/api'
import { num } from '../lib/formatters'

// Normalise the two signal shapes (generate = nested, by-id = flat columns)
// into one structure the page renders from.
function normalize(s) {
  if (!s) return null
  if (s.indicators) {
    return {
      id: s.id,
      signal_type: s.signal_type,
      confidence: s.confidence,
      entry_price: s.entry_price,
      suggested_stop_loss: s.stop_loss,
      suggested_target: s.target,
      reasoning: s.reasoning,
      ind: s.indicators,
    }
  }
  return {
    id: s.id,
    signal_type: s.signal_type,
    confidence: s.confidence,
    entry_price: s.entry_price,
    suggested_stop_loss: s.suggested_stop_loss,
    suggested_target: s.suggested_target,
    reasoning: s.reasoning,
    ind: {
      rsi: s.rsi_value,
      macd: s.macd_value,
      ema_20: s.ema_20,
      ema_50: s.ema_50,
      adx: s.adx_value,
      bb_position: s.bb_position,
      supertrend: s.supertrend_signal,
    },
  }
}

export default function Intelligence() {
  const { symbol } = useParams()
  const navigate = useNavigate()
  const [candles, setCandles] = useState(null)
  const [signal, setSignal] = useState(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [traded, setTraded] = useState(false)
  const searchTimer = useRef(null)

  // Is there already an OPEN position for this symbol + direction?
  async function refreshTraded(sig) {
    if (!sig || (sig.signal_type !== 'BUY' && sig.signal_type !== 'SELL')) {
      setTraded(false)
      return
    }
    try {
      const trades = await api.getTrades('open')
      setTraded(trades.some((t) => t.symbol === symbol && t.trade_type === sig.signal_type))
    } catch {
      setTraded(false)
    }
  }

  // Load candles + latest existing signal when the symbol changes.
  useEffect(() => {
    if (!symbol) return
    setLoading(true)
    setError(null)
    setSignal(null)
    setCandles(null)
    setTraded(false)
    Promise.all([api.getCandles(symbol), api.getSignals(1, symbol).catch(() => [])])
      .then(async ([c, sigs]) => {
        setCandles(c)
        const latest = Array.isArray(sigs) ? sigs.find((x) => x.symbol === symbol) : null
        if (latest) {
          const full = await api.getSignal(latest.id).catch(() => null)
          const norm = normalize(full)
          setSignal(norm)
          await refreshTraded(norm)
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [symbol])

  // Symbol search (when no symbol selected)
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

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      const s = await api.generateSignal(symbol)
      setSignal(normalize(s))
      setTraded(false) // a freshly generated signal has no trade yet
    } catch (e) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  if (!symbol) {
    return (
      <div className="max-w-screen-xl mx-auto px-5 sm:px-6 py-8">
        <h1 className="text-head font-semibold mb-4">Intelligence</h1>
        <p className="text-text-dim text-body mb-4">Search for a stock to analyse.</p>
        <div className="relative w-80">
          <Input
            className="w-full"
            placeholder="Search symbol or name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {results.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-surface border border-border rounded-md max-h-64 overflow-auto">
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => navigate(`/intelligence/${r.symbol}`)}
                  className="w-full text-left px-3 py-2 hover:bg-bg flex justify-between"
                >
                  <span className="text-body">{r.symbol}</span>
                  <span className="text-label text-text-dim truncate ml-2">{r.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-screen-xl mx-auto px-5 sm:px-6 py-5 sm:py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-head font-semibold">{symbol}</h1>
        <Button onClick={generate} disabled={generating || loading}>
          {generating ? 'Generating…' : 'Generate Signal'}
        </Button>
      </div>

      {error && <div className="text-negative text-body mb-4">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-4">
        {/* Left 70% on desktop — chart (stacks on top on mobile) */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="p-2 h-[320px] sm:h-[420px] lg:h-[460px]">
            {loading || !candles ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <PriceChart candles={candles} />
            )}
          </Card>
          <Card className="p-4 sm:p-5">
            <CardLabel>Reasoning</CardLabel>
            <p className="text-body text-text-dim mt-2 leading-relaxed">
              {signal ? signal.reasoning : 'Generate a signal to see the engine’s reasoning.'}
            </p>
          </Card>
        </div>

        {/* Right 30% on desktop — signal + indicators (below chart on mobile) */}
        <div className="lg:col-span-3 space-y-4">
          <SignalCard signal={signal}>
            {signal && (
              <PaperTradePanel
                signal={signal}
                traded={traded}
                onTraded={() => refreshTraded(signal)}
              />
            )}
          </SignalCard>
          <IndicatorsPanel ind={signal?.ind} />
        </div>
      </div>
    </div>
  )
}

function IndicatorsPanel({ ind }) {
  return (
    <Card className="p-4">
      <CardLabel>Indicators</CardLabel>
      {!ind ? (
        <div className="text-text-dim text-body mt-2">—</div>
      ) : (
        <div className="mt-3 space-y-2">
          <Row label="RSI (14)" value={fmt(ind.rsi)} />
          <Row label="ADX (14)" value={fmt(ind.adx)} />
          <Row label="MACD" value={fmt(ind.macd, 4)} />
          <Row label="EMA 20" value={fmt(ind.ema_20)} />
          <Row label="EMA 50" value={fmt(ind.ema_50)} />
          <Row label="SuperTrend" value={ind.supertrend ?? '—'} />
          <Row label="Bollinger" value={ind.bb_position ?? '—'} />
        </div>
      )}
    </Card>
  )
}

function fmt(v, dp = 2) {
  const n = num(v)
  return n === null ? '—' : n.toFixed(dp)
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-center text-body">
      <span className="text-text-dim">{label}</span>
      <span className="text-text font-medium">{value}</span>
    </div>
  )
}
