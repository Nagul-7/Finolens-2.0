import { Card, CardLabel } from '../ui/Card'
import { ConfidenceBar } from './ConfidenceBar'
import { inr, signalColor } from '../../lib/formatters'

export function SignalCard({ signal }) {
  if (!signal) {
    return (
      <Card className="p-4">
        <CardLabel>Signal</CardLabel>
        <div className="text-text-dim text-body mt-2">No signal generated yet.</div>
      </Card>
    )
  }

  const { signal_type, confidence, entry_price, suggested_stop_loss, suggested_target } = signal

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-baseline justify-between">
        <span className={`text-head font-semibold ${signalColor(signal_type)}`}>
          {signal_type}
        </span>
        <CardLabel>Signal</CardLabel>
      </div>

      <ConfidenceBar value={confidence} type={signal_type} />

      <div className="grid grid-cols-3 gap-2 pt-1">
        <Metric label="ENTRY" value={inr(entry_price)} />
        <Metric label="STOP" value={inr(suggested_stop_loss)} />
        <Metric label="TARGET" value={inr(suggested_target)} />
      </div>
    </Card>
  )
}

function Metric({ label, value }) {
  return (
    <div>
      <div className="text-label text-text-dim">{label}</div>
      <div className="text-body text-text mt-0.5">{value}</div>
    </div>
  )
}
