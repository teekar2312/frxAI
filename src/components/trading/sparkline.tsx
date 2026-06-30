'use client'

import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts'

interface SparklineProps {
  data: number[]
  color?: string
  height?: number
  width?: number
  strokeWidth?: number
}

export function Sparkline({ data, color = 'currentColor', height = 32, width = 80, strokeWidth = 1.5 }: SparklineProps) {
  if (!data || data.length === 0) {
    return <div style={{ height, width }} className="opacity-30" />
  }
  const chartData = data.map((v, i) => ({ i, v }))
  const up = data[data.length - 1] >= data[0]
  const stroke = color === 'currentColor' ? (up ? 'var(--bull)' : 'var(--bear)') : color
  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={chartData} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
        <YAxis domain={['dataMin', 'dataMax']} hide />
        <Line type="monotone" dataKey="v" stroke={stroke} strokeWidth={strokeWidth} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
