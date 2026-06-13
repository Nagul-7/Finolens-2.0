import { useState } from 'react'
import { Button } from '../ui/Button.jsx'
import { Input } from '../ui/Input.jsx'
import { api } from '../../lib/api'
import { useToast } from '../ui/Toast.jsx'
import { inr, num } from '../../lib/formatters'

// Mirror of backend constants — default and max notional per paper trade.
const POSITION_SIZE_INR = 10000
const MAX_POSITION_SIZE_INR = 100000

export function PaperTradePanel({ signal, traded, onTraded }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const entry = num(signal.entry_price) ?? 0
  const maxQty = Math.max(1, Math.floor(MAX_POSITION_SIZE_INR / (entry || 1)))
  const defaultQty = Math.max(1, Math.floor(POSITION_SIZE_INR / (entry || 1)))
  const [qty, setQty] = useState(String(defaultQty))

  // Only BUY / SELL are tradeable.
  if (signal.signal_type !== 'BUY' && signal.signal_type !== 'SELL') return null

  if (traded) {
    return (
      <div className="text-label text-text-dim flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
        You hold an open {signal.signal_type} position — see Portfolio
      </div>
    )
  }

  // Keep only digits, drop leading zeros — rejects "000", "1e5", "-5", "10.5".
  function onQtyChange(raw) {
    const digits = raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '')
    setQty(digits)
  }

  const qtyNum = qty === '' ? 0 : Number(qty)
  let qtyError = null
  if (qtyNum < 1) qtyError = 'Enter a positive whole number of shares'
  else if (qtyNum > maxQty)
    qtyError = `Max ${maxQty} shares (₹${MAX_POSITION_SIZE_INR.toLocaleString('en-IN')} cap)`
  const valid = qtyError === null

  async function confirm() {
    if (!valid) return
    setSubmitting(true)
    try {
      await api.createTrade(signal.id, qtyNum)
      toast(`Paper ${signal.signal_type} placed — ${qtyNum} share${qtyNum > 1 ? 's' : ''}`)
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

  const notional = inr(qtyNum * entry)

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
          type="text"
          inputMode="numeric"
          value={qty}
          onChange={(e) => onQtyChange(e.target.value)}
          className={`w-full tabular-nums ${qtyError ? 'border-negative' : ''}`}
        />
        {qtyError ? (
          <div className="text-label text-negative mt-1">{qtyError}</div>
        ) : (
          <div className="text-label text-text-dim mt-1">≈ {notional} notional</div>
        )}
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={confirm} disabled={submitting || !valid}>
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
