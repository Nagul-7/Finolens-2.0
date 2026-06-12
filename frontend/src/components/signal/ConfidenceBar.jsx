import { num } from '../../lib/formatters'

export function ConfidenceBar({ value, type }) {
  const n = num(value) ?? 0
  const color = type === 'BUY' ? 'bg-positive' : type === 'SELL' ? 'bg-negative' : 'bg-text-dim'
  return (
    <div>
      <div className="flex justify-between text-label text-text-dim mb-1">
        <span>CONFIDENCE</span>
        <span className="text-text">{n.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-border rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${n}%` }} />
      </div>
    </div>
  )
}
