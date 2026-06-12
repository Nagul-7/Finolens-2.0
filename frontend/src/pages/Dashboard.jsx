import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Container } from '../components/layout/Container.jsx'
import { Card, CardLabel } from '../components/ui/Card.jsx'
import { Skeleton, SkeletonRows } from '../components/ui/Skeleton.jsx'
import { api } from '../lib/api'
import { pct, signalColor, outcomeColor, dateTime } from '../lib/formatters'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [signals, setSignals] = useState(null)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    Promise.all([api.getOutcomeStats(30), api.getSignals(10)])
      .then(([s, sig]) => {
        if (!active) return
        setStats(s)
        setSignals(sig)
      })
      .catch((e) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [])

  return (
    <Container>
      {error && (
        <div className="text-negative text-body mb-4">Failed to load: {error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Active Signals (OPEN)" value={stats ? stats.open : null} />
        <StatCard
          label="Win Rate (30d)"
          value={stats ? (stats.win_rate_pct === null ? '—' : `${stats.win_rate_pct}%`) : null}
          accent
        />
        <StatCard
          label="Trades Closed (30d)"
          value={stats ? stats.trades : null}
        />
      </div>

      <Card className="p-4 sm:p-5">
        <CardLabel>Recent Signals</CardLabel>
        <div className="mt-3 -mx-2 overflow-x-auto">
          {!signals ? (
            <SkeletonRows rows={6} className="px-2" />
          ) : signals.length === 0 ? (
            <div className="text-text-dim text-body py-8 text-center">
              No signals yet. Generate one from the Intelligence page.
            </div>
          ) : (
            <table className="w-full text-body min-w-[520px]">
              <thead>
                <tr className="text-label text-muted text-left border-b border-border">
                  <th className="font-medium py-2 px-2">SYMBOL</th>
                  <th className="font-medium px-2">SIGNAL</th>
                  <th className="font-medium text-right px-2">CONFIDENCE</th>
                  <th className="font-medium text-right px-2">OUTCOME</th>
                  <th className="font-medium text-right px-2">GENERATED</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/intelligence/${s.symbol}`)}
                    className="border-b border-border last:border-0 hover:bg-elevated cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-2 font-semibold">{s.symbol}</td>
                    <td className={`px-2 font-medium ${signalColor(s.signal_type)}`}>
                      {s.signal_type}
                    </td>
                    <td className="text-right px-2 tabular-nums">
                      {Number(s.confidence).toFixed(0)}%
                    </td>
                    <td className={`text-right px-2 ${outcomeColor(s.outcome)}`}>
                      {s.outcome ?? '—'}
                    </td>
                    <td className="text-right px-2 text-text-dim tabular-nums">
                      {dateTime(s.generated_at)}
                    </td>
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

function StatCard({ label, value, accent = false }) {
  return (
    <Card className="p-5">
      <CardLabel>{label}</CardLabel>
      <div
        className={`text-head font-semibold mt-3 h-8 flex items-end tabular-nums ${
          accent ? 'text-accent' : 'text-text'
        }`}
      >
        {value === null || value === undefined ? (
          <Skeleton className="h-6 w-16" />
        ) : (
          <span>{value}</span>
        )}
      </div>
    </Card>
  )
}
