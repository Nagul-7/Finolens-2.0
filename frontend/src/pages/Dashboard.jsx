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

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Active Signals (OPEN)" value={stats ? stats.open : null} />
        <StatCard
          label="Win Rate (30d)"
          value={stats ? (stats.win_rate_pct === null ? '—' : `${stats.win_rate_pct}%`) : null}
        />
        <StatCard
          label="Trades Closed (30d)"
          value={stats ? stats.trades : null}
        />
      </div>

      <Card className="p-4">
        <CardLabel>Recent Signals</CardLabel>
        <div className="mt-3">
          {!signals ? (
            <SkeletonRows rows={6} />
          ) : signals.length === 0 ? (
            <div className="text-text-dim text-body py-6 text-center">
              No signals yet. Generate one from the Intelligence page.
            </div>
          ) : (
            <table className="w-full text-body">
              <thead>
                <tr className="text-label text-text-dim text-left border-b border-border">
                  <th className="font-normal py-2">SYMBOL</th>
                  <th className="font-normal">SIGNAL</th>
                  <th className="font-normal text-right">CONFIDENCE</th>
                  <th className="font-normal text-right">OUTCOME</th>
                  <th className="font-normal text-right">GENERATED</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/intelligence/${s.symbol}`)}
                    className="border-b border-border/50 hover:bg-bg cursor-pointer"
                  >
                    <td className="py-2.5 font-medium">{s.symbol}</td>
                    <td className={signalColor(s.signal_type)}>{s.signal_type}</td>
                    <td className="text-right">{Number(s.confidence).toFixed(0)}%</td>
                    <td className={`text-right ${outcomeColor(s.outcome)}`}>{s.outcome ?? '—'}</td>
                    <td className="text-right text-text-dim">{dateTime(s.generated_at)}</td>
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

function StatCard({ label, value }) {
  return (
    <Card className="p-4">
      <CardLabel>{label}</CardLabel>
      <div className="text-head font-semibold mt-2 h-7 flex items-end">
        {value === null || value === undefined ? (
          <Skeleton className="h-6 w-16" />
        ) : (
          <span>{value}</span>
        )}
      </div>
    </Card>
  )
}
