import { useState } from 'react'
import { Button } from '../ui/Button.jsx'
import { Input } from '../ui/Input.jsx'
import { api } from '../../lib/api'
import { useToast } from '../ui/Toast.jsx'
import { inr, num } from '../../lib/formatters'

// Mirror of backend POSITION_SIZE_INR — default notional per paper trade.
const POSITION_SIZE_INR = 10000

export function PaperTradePanel({ signal, traded, onTraded }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const entry = num(signal.entry_price) ?? 0
  const defaultQty = Math.max(1, Math.floor(POSITION_SIZE_INR / (entry || 1)))
  const [qty, setQty] = useState(defaultQty)

  // Only BUY / SELL are tradeable.
  if (signal.signal_type !== 'BUY' && signal.signal_type !== 'SELL') return null

  if (traded) {
    return (
      <div className="text-label text-text-dim flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
        Paper trade placed for this signal
      </div>
    )
  }

  async function confirm() {
    setSubmitting(true)
    try {
      await api.createTrade(signal.id, Number(qty))
      toast(`Paper ${signal.signal_type} placed — ${qty} share${qty > 1 ? 's' : ''}`)
      setOpen(false)
      onTraded?.()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <Button className="w-full" onClick={() => setOpen(true)}>
        Paper Trade This Signal
      </Button>
    )
  }

  const notional = inr((num(qty) ?? 0) * entry)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Field label="ENTRY" value={inr(signal.entry_price)} />
        <Field label="STOP" value={inr(signal.suggested_stop_loss)} />
        <Field label="TARGET" value={inr(signal.suggested_target)} />
      </div>
      <div>
        <div className="text-label text-muted mb-1">QUANTITY</div>
        <Input
          type="number"
          min="1"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="w-full tabular-nums"
        />
        <div className="text-label text-text-dim mt-1">≈ {notional} notional</div>
      </div>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={confirm}
          disabled={submitting || !qty || Number(qty) < 1}
        >
          {submitting ? 'Placing…' : `Confirm ${signal.signal_type}`}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-label text-muted">{label}</div>
      <div className="text-body text-text mt-0.5 tabular-nums">{value}</div>
    </div>
  )
}
