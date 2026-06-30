// Seed upcoming + recent economic calendar events.
import { db } from '../src/lib/db'

const now = new Date()
const at = (daysFromNow: number, hourUtc: number, minute = 0) => {
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() + daysFromNow)
  d.setUTCHours(hourUtc, minute, 0, 0)
  return d
}

const EVENTS = [
  // ===== PAST (released) =====
  { title: 'US Non-Farm Payrolls', country: 'US', currency: 'USD', category: 'nfp', impact: 'high', eventTime: at(-3, 12, 30), actual: '256K', forecast: '164K', previous: '165K', surprise: 'Beat (+92K vs forecast)', symbols: 'EURUSD,USDJPY,GBPUSD,XAUUSD', status: 'released' },
  { title: 'US CPI (YoY)', country: 'US', currency: 'USD', category: 'cpi', impact: 'high', eventTime: at(-2, 12, 30), actual: '2.4%', forecast: '2.5%', previous: '2.6%', surprise: 'Below forecast (dovish)', symbols: 'EURUSD,USDJPY,XAUUSD', status: 'released' },
  { title: 'ECB Interest Rate Decision', country: 'EU', currency: 'EUR', category: 'interest_rate', impact: 'high', eventTime: at(-2, 11, 45), actual: '3.65%', forecast: '3.65%', previous: '3.90%', surprise: 'As expected (25bp cut)', symbols: 'EURUSD,GBPUSD', status: 'released' },
  { title: 'US Unemployment Rate', country: 'US', currency: 'USD', category: 'unemployment', impact: 'high', eventTime: at(-3, 12, 30), actual: '4.1%', forecast: '4.2%', previous: '4.2%', surprise: 'Below forecast', symbols: 'EURUSD,USDJPY,XAUUSD', status: 'released' },
  { title: 'UK GDP (MoM)', country: 'GB', currency: 'GBP', category: 'gdp', impact: 'medium', eventTime: at(-1, 6, 0), actual: '0.2%', forecast: '0.1%', previous: '0.0%', surprise: 'Beat', symbols: 'GBPUSD', status: 'released' },
  { title: 'BoJ Policy Rate', country: 'JP', currency: 'JPY', category: 'interest_rate', impact: 'high', eventTime: at(-1, 3, 0), actual: '0.25%', forecast: '0.25%', previous: '0.10%', surprise: 'As expected', symbols: 'USDJPY', status: 'released' },
  { title: 'US Retail Sales (MoM)', country: 'US', currency: 'USD', category: 'retail', impact: 'medium', eventTime: at(-1, 12, 30), actual: '0.6%', forecast: '0.4%', previous: '0.3%', surprise: 'Beat', symbols: 'EURUSD,GBPUSD', status: 'released' },
  { title: 'US ISM Manufacturing PMI', country: 'US', currency: 'USD', category: 'pmi', impact: 'medium', eventTime: at(-1, 14, 0), actual: '50.9', forecast: '49.5', previous: '48.7', surprise: 'Back to expansion', symbols: 'EURUSD,USDJPY', status: 'released' },

  // ===== UPCOMING =====
  { title: 'US PPI (MoM)', country: 'US', currency: 'USD', category: 'ppi', impact: 'medium', eventTime: at(0, 12, 30), forecast: '0.2%', previous: '0.1%', symbols: 'EURUSD,USDJPY,XAUUSD', status: 'upcoming' },
  { title: 'Fed Chair Powell Speech', country: 'US', currency: 'USD', category: 'speech', impact: 'high', eventTime: at(0, 16, 0), symbols: 'EURUSD,USDJPY,GBPUSD,XAUUSD', status: 'upcoming' },
  { title: 'US Core CPI (MoM)', country: 'US', currency: 'USD', category: 'cpi', impact: 'high', eventTime: at(1, 12, 30), forecast: '0.3%', previous: '0.3%', symbols: 'EURUSD,USDJPY,GBPUSD,XAUUSD', status: 'upcoming' },
  { title: 'Eurozone CPI (YoY, Flash)', country: 'EU', currency: 'EUR', category: 'cpi', impact: 'high', eventTime: at(1, 9, 0), forecast: '2.2%', previous: '2.4%', symbols: 'EURUSD,GBPUSD', status: 'upcoming' },
  { title: 'FOMC Interest Rate Decision', country: 'US', currency: 'USD', category: 'interest_rate', impact: 'high', eventTime: at(2, 18, 0), forecast: '4.50-4.75%', previous: '4.75-5.00%', symbols: 'EURUSD,USDJPY,GBPUSD,XAUUSD', status: 'upcoming' },
  { title: 'FOMC Press Conference', country: 'US', currency: 'USD', category: 'speech', impact: 'high', eventTime: at(2, 18, 30), symbols: 'EURUSD,USDJPY,GBPUSD,XAUUSD', status: 'upcoming' },
  { title: 'UK CPI (YoY)', country: 'GB', currency: 'GBP', category: 'cpi', impact: 'high', eventTime: at(3, 6, 0), forecast: '2.1%', previous: '2.2%', symbols: 'GBPUSD', status: 'upcoming' },
  { title: 'US Unemployment Claims', country: 'US', currency: 'USD', category: 'unemployment', impact: 'medium', eventTime: at(3, 12, 30), forecast: '220K', previous: '219K', symbols: 'EURUSD,USDJPY', status: 'upcoming' },
  { title: 'BoE Interest Rate Decision', country: 'GB', currency: 'GBP', category: 'interest_rate', impact: 'high', eventTime: at(4, 11, 0), forecast: '5.00%', previous: '5.00%', symbols: 'GBPUSD,EURUSD', status: 'upcoming' },
  { title: 'US Retail Sales (MoM)', country: 'US', currency: 'USD', category: 'retail', impact: 'medium', eventTime: at(4, 12, 30), forecast: '0.3%', previous: '0.6%', symbols: 'EURUSD,USDJPY', status: 'upcoming' },
  { title: 'Japan CPI (YoY)', country: 'JP', currency: 'JPY', category: 'cpi', impact: 'medium', eventTime: at(4, 23, 30), forecast: '2.6%', previous: '2.8%', symbols: 'USDJPY', status: 'upcoming' },
  { title: 'US Non-Farm Payrolls', country: 'US', currency: 'USD', category: 'nfp', impact: 'high', eventTime: at(7, 12, 30), forecast: '180K', previous: '256K', symbols: 'EURUSD,USDJPY,GBPUSD,XAUUSD', status: 'upcoming' },
  { title: 'US ISM Services PMI', country: 'US', currency: 'USD', category: 'pmi', impact: 'medium', eventTime: at(7, 14, 0), forecast: '52.0', previous: '52.1', symbols: 'EURUSD,USDJPY', status: 'upcoming' },
  { title: 'ECB President Lagarde Speech', country: 'EU', currency: 'EUR', category: 'speech', impact: 'medium', eventTime: at(5, 13, 0), symbols: 'EURUSD,GBPUSD', status: 'upcoming' },
  { title: 'US GDP (QoQ, Adv)', country: 'US', currency: 'USD', category: 'gdp', impact: 'high', eventTime: at(8, 12, 30), forecast: '2.8%', previous: '3.1%', symbols: 'EURUSD,USDJPY,XAUUSD', status: 'upcoming' },
  { title: 'UK Retail Sales (MoM)', country: 'GB', currency: 'GBP', category: 'retail', impact: 'low', eventTime: at(5, 6, 0), forecast: '0.2%', previous: '-0.1%', symbols: 'GBPUSD', status: 'upcoming' },
]

async function main() {
  const count = await db.economicEvent.count()
  if (count > 0) {
    console.log(`Economic events already seeded (${count}). Skipping.`)
    return
  }
  await db.economicEvent.createMany({
    data: EVENTS.map((e) => ({ ...e, source: 'marketaux' })),
  })
  console.log(`✓ Seeded ${EVENTS.length} economic events`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await db.$disconnect() })
