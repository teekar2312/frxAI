/**
 * Generate a 40-point synthetic equity sparkline.
 * Anchored at `balance - todayPnl * 0.5`, drifting toward `balance + todayPnl`.
 */
export function buildEquitySpark(balance: number, todayPnl: number): number[] {
  const out: number[] = []
  const start = balance - todayPnl * 0.5
  const end = balance + todayPnl
  for (let i = 0; i < 40; i++) {
    const frac = i / 39
    const lin = start + (end - start) * frac
    const wobble = Math.sin(i / 3.1) * (balance * 0.0008)
    out.push(Number((lin + wobble).toFixed(2)))
  }
  return out
}