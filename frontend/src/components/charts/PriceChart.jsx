import { useEffect, useRef } from 'react'
import { createChart, ColorType } from 'lightweight-charts'

// Compute an EMA series from candle closes for an overlay line.
function emaSeries(candles, period) {
  if (candles.length < period) return []
  const k = 2 / (period + 1)
  let ema = candles[0].close
  return candles.map((c, i) => {
    ema = i === 0 ? c.close : c.close * k + ema * (1 - k)
    return { time: c.date, value: ema }
  })
}

export function PriceChart({ candles }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || !candles || candles.length === 0) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#131826' },
        textColor: '#94a3b8',
        fontFamily: 'Inter, sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1e2538' },
        horzLines: { color: '#1e2538' },
      },
      rightPriceScale: { borderColor: '#1e2538' },
      timeScale: { borderColor: '#1e2538', timeVisible: false },
      crosshair: { mode: 0 },
      autoSize: true,
    })

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    })
    candleSeries.setData(
      candles.map((c) => ({
        time: c.date,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
      })),
    )

    const ema20 = chart.addLineSeries({ color: '#00d4aa', lineWidth: 1, priceLineVisible: false })
    ema20.setData(emaSeries(candles, 20))

    const ema50 = chart.addLineSeries({ color: '#6b7280', lineWidth: 1, priceLineVisible: false })
    ema50.setData(emaSeries(candles, 50))

    chart.timeScale().fitContent()

    return () => chart.remove()
  }, [candles])

  return <div ref={containerRef} className="w-full h-full" />
}
