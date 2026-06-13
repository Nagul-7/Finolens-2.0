import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Container } from '../components/layout/Container.jsx'
import { Card, CardLabel } from '../components/ui/Card.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Skeleton, SkeletonRows } from '../components/ui/Skeleton.jsx'
import { useToast } from '../components/ui/Toast.jsx'
import { api } from '../lib/api'
import { inr, pct, num, shortDate } from '../lib/formatters'

function signedInr(v) {
  const n = num(v)
  if (n === null) return '—'
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}${inr(Math.abs(n))}`
}

function pnlClass(v) {
  const n = num(v)
  if (n === null || n === 0) return 'text-text-dim'
  return n > 0 ? 'text-positive' : 'text-negative'
}

export default function Portfolio() {
  const [open, setOpen] = useState(null)
  const [closed, setClosed] = useState(null)
  const [stats, setStats] = useState(null)
  const [evaluating, setEvaluating] = useState(false)
  const [error, setError] = useState(null)
  const toast = useToast()
  const navigate = useNavigate()

  const load = useCallback(() => {
    Promise.all([api.getTrades('open'), api.getTrades('closed'), api.getTradeStats()])
      .then(([o, c, s]) => {
        setOpen(o)
        setClosed(c)
        setStats(s)
      })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(load, [load])

  async function evaluate() {
    setEvaluating(true)
    try {
      const r = await api.evaluateTrades()
      toast(`Evaluated — ${r.closed} closed, ${r.stillOpen} still open`)
      load()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setEvaluating(false)
    }
  }

  async function close(id, e) {
    e.stopPropagation()
    try {
      const r = await api.closeTrade(id)
      toast(`Position closed — P&L ${signedInr(r.pnl)}`)
      load()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <Container>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-head font-semibold">Portfolio</h1>
        <Button variant="ghost" onClick={evaluate} disabled={evaluating}>
          {evaluating ? 'Evaluating…' : 'Run Evaluation'}
        </Button>
      </div>

      {error && <div className="text-negative text-body mb-4">{error}</div>}

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Stat label="Open Positions" value={stats ? stats.open_count : null} />
        <Stat
          label="Realized P&L"
          value={stats ? signedInr(stats.realized_pnl) : null}
          cls={stats ? pnlClass(stats.realized_pnl) : ''}
        />
        <Stat
          label="Win Rate"
          value={stats ? (stats.win_rate_pct === null ? '—' : `${stats.win_rate_pct}%`) : null}
        />
        <Stat label="Avg Win" value={stats ? signedInr(stats.avg_win) : null} cls="text-positive" />
        <Stat label="Avg Loss" value={stats ? signedInr(stats.avg_loss) : null} cls="text-negative" />
      </div>

      {/* Open positions */}
      <Card className="p-4 sm:p-5 mb-6">
        <CardLabel>Open Positions</CardLabel>
        <div className="mt-3 -mx-2 overflow-x-auto">
          {!open ? (
            <SkeletonRows rows={3} className="px-2" />
          ) : open.length === 0 ? (
            <Empty>No open positions. Paper-trade a signal from the Intelligence page.</Empty>
          ) : (
            <table className="w-full text-body min-w-[760px]">
              <Head cols={['SYMBOL', 'QTY', 'ENTRY', 'CURRENT', 'UNREALIZED P&L', 'STOP / TARGET', '']} />
              <tbody>
                {open.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => navigate(`/intelligence/${t.symbol}`)}
                    className="border-b border-border last:border-0 hover:bg-elevated cursor-pointer"
                  >
                    <Td>
                      <div className="font-semibold">{t.symbol}</div>
                      <div className={`text-label ${t.trade_type === 'BUY' ? 'text-positive' : 'text-negative'}`}>
                        {t.trade_type}
                      </div>
                    </Td>
                    <Td className="tabular-nums">{t.quantity}</Td>
                    <Td className="tabular-nums">{inr(t.entry_price)}</Td>
                    <Td className="tabular-nums">{inr(t.current_price)}</Td>
                    <Td className={`tabular-nums ${pnlClass(t.unrealized_pnl)}`}>
                      {signedInr(t.unrealized_pnl)}
                      <span className="text-label ml-1">({pct(t.unrealized_pnl_pct)})</span>
                    </Td>
                    <Td>
                      <DistanceBar
                        stopPct={num(t.dist_to_stop_pct)}
                        targetPct={num(t.dist_to_target_pct)}
                      />
                    </Td>
                    <Td className="text-right">
                      <button
                        onClick={(e) => close(t.id, e)}
                        className="text-label text-text-dim hover:text-negative px-2 py-1"
                      >
                        Close
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Closed trades */}
      <Card className="p-4 sm:p-5">
        <CardLabel>Closed Trades</CardLabel>
        <div className="mt-3 -mx-2 overflow-x-auto">
          {!closed ? (
            <SkeletonRows rows={3} className="px-2" />
          ) : closed.length === 0 ? (
            <Empty>No closed trades yet.</Empty>
          ) : (
            <table className="w-full text-body min-w-[720px]">
              <Head cols={['SYMBOL', 'QTY', 'ENTRY', 'EXIT', 'REALIZED P&L', 'REASON', 'CLOSED']} />
              <tbody>
                {closed.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <Td>
                      <div className="font-semibold">{t.symbol}</div>
                      <div className={`text-label ${t.trade_type === 'BUY' ? 'text-positive' : 'text-negative'}`}>
                        {t.trade_type}
                      </div>
                    </Td>
                    <Td className="tabular-nums">{t.quantity}</Td>
                    <Td className="tabular-nums">{inr(t.entry_price)}</Td>
                    <Td className="tabular-nums">{inr(t.exit_price)}</Td>
                    <Td className={`tabular-nums ${pnlClass(t.pnl)}`}>
                      {signedInr(t.pnl)}
                      <span className="text-label ml-1">({pct(t.pnl_pct)})</span>
                    </Td>
                    <Td>
                      <span className="text-label px-2 py-0.5 rounded border border-border text-text-dim">
                        {t.exit_reason}
                      </span>
                    </Td>
                    <Td className="text-text-dim tabular-nums">{shortDate(t.exit_time)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </Container>
  )
}

function Stat({ label, value, cls = '' }) {
  return (
    <Card className="p-4">
      <CardLabel>{label}</CardLabel>
      <div className={`text-head font-semibold mt-2 h-7 flex items-end tabular-nums ${cls}`}>
        {value === null || value === undefined ? <Skeleton className="h-5 w-14" /> : value}
      </div>
    </Card>
  )
}

function DistanceBar({ stopPct, targetPct }) {
  // stopPct: how far current price is ABOVE the stop (for BUY); targetPct: how
  // far BELOW the target. Smaller = closer. Show as compact labels.
  return (
    <div className="flex items-center gap-3 text-label tabular-nums">
      <span className="text-negative">SL {stopPct === null ? '—' : `${stopPct}%`}</span>
      <span className="text-positive">TGT {targetPct === null ? '—' : `${targetPct}%`}</span>
    </div>
  )
}

function Head({ cols }) {
  return (
    <thead>
      <tr className="text-label text-muted text-left border-b border-border">
        {cols.map((c, i) => (
          <th key={i} className={`font-medium py-2 px-2 ${i >= 4 ? '' : ''}`}>
            {c}
          </th>
        ))}
      </tr>
    </thead>
  )
}

function Td({ children, className = '' }) {
  return <td className={`py-3 px-2 align-top ${className}`}>{children}</td>
}

function Empty({ children }) {
  return <div className="text-text-dim text-body py-8 text-center px-2">{children}</div>
}
