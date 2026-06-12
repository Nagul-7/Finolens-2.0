// Minimal inline SVG sparkline — no chart library, no axes, just the line.
export function Sparkline({ data, width = 96, height = 32, up }) {
  if (!data || data.length < 2) {
    return <div style={{ width, height }} className="opacity-30" />
  }
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const stepX = width / (data.length - 1)
  const points = data
    .map((v, i) => {
      const x = i * stepX
      const y = height - ((v - min) / range) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const rising = up ?? data[data.length - 1] >= data[0]
  const color = rising ? '#10b981' : '#ef4444'

  return (
    <svg width={width} height={height} className="block" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
