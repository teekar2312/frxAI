# MT5 Bridge Service

Production-ready bridge between the FinexFX AI Trading System (Next.js) and MetaTrader 5.

## Architecture

```
┌─────────────────────┐         ┌─────────────────────┐         ┌─────────────────────┐
│  Next.js App (3000) │  HTTP   │  MT5 Bridge (3050)  │  HTTP   │  Python Bridge      │
│  - src/lib/         │ ──────► │  - Node.js/TS       │ ──────► │  - mt5_bridge.py    │
│    mt5-client.ts    │         │  - Adapter pattern  │         │  - MetaTrader5 pkg  │
│  - /api/trades/*    │         │  - Mock | Real      │         │  - Windows + MT5    │
└─────────────────────┘         └─────────────────────┘         └─────────────────────┘
                                        │
                                        └─► Mock adapter (default): runs anywhere, no MT5 needed
                                            Real adapter: calls Python bridge on Windows machine
```

## Two Adapters

### 1. Mock Adapter (default) — for dev/sandbox
- Runs anywhere (no Windows/MT5 needed)
- Simulates realistic prices using deterministic formula (matches `src/lib/market.ts`)
- Maintains in-memory positions per login
- All trade operations work (open, close, modify) but no real money moves

### 2. Real Python Adapter — for production
- Requires a **Windows machine** with:
  - MetaTrader 5 terminal installed + logged in to FINEX Indonesia account
  - Python 3.10+
  - `pip install MetaTrader5 flask flask-cors`
- The Python script (`python/mt5_bridge.py`) runs as an HTTP service
- The Node.js bridge calls it via HTTP
- **Real money trades** — use with caution

## Running the Bridge (Mock mode — sandbox)

```bash
cd mini-services/mt5-bridge
bun run dev   # starts on port 3050
```

Verify it's running:
```bash
curl http://localhost:3050/health
# → { "status": "ok", "adapter": "mock", "isLive": false, ... }
```

## Deploying with Real MT5 (Production)

### Step 1: Set up the Windows machine

1. Install MetaTrader 5 from your broker (FINEX Indonesia)
2. Log in to your trading account in the MT5 terminal
3. Install Python 3.10+ from python.org
4. Open Command Prompt:
   ```cmd
   pip install MetaTrader5 flask flask-cors
   ```

### Step 2: Copy the Python bridge

Copy `mini-services/mt5-bridge/python/mt5_bridge.py` to your Windows machine (e.g., `C:\finexfx\mt5_bridge.py`).

### Step 3: Run the Python bridge

```cmd
python C:\finexfx\mt5_bridge.py --port 5050 --host 0.0.0.0
```

This exposes the bridge on all network interfaces. Note the Windows machine's IP (e.g., `192.168.1.50`).

### Step 4: Configure the Node.js bridge

On the machine running the Next.js app + Node.js bridge:

```bash
# Set environment variables before starting the bridge
export MT5_ADAPTER=real-python
export MT5_PYTHON_BRIDGE_URL=http://192.168.1.50:5050

cd mini-services/mt5-bridge
bun run dev
```

### Step 5: Connect via the Settings panel

Open the app → Settings → "MT5 Connection" tab → enter your MT5 login, server, and password → click "Connect to MT5".

## API Reference

### Health
```http
GET /health
→ { "status": "ok", "adapter": "mock", "isLive": false, "uptime": 12.3, "timestamp": "..." }
```

### Connect / Disconnect
```http
POST /connect
Body: { "login": 12345678, "server": "FINEX-Live", "password": "xxx" }
→ { "account": { "login": 12345678, "balance": 10000, "equity": 10000, ... } }

POST /disconnect/12345678
→ { "ok": true }
```

### Account Info
```http
GET /account/12345678
→ { "account": { "login": 12345678, "balance": 10050.25, "equity": 10062.50, "margin": 100, ... } }
```

### Tick (current price)
```http
GET /tick/EURUSD
→ { "tick": { "symbol": "EURUSD", "bid": 1.08512, "ask": 1.08516, "spread": 0.00004, "time": "..." } }
```

### Historical Bars
```http
GET /bars/EURUSD?tf=M5&count=100
→ { "bars": [ { "time": "...", "open": 1.0850, "high": 1.0855, "low": 1.0848, "close": 1.0852, "volume": 245 }, ... ] }
```

### Open Positions
```http
GET /positions/12345678
→ { "positions": [ { "ticket": 500000001, "symbol": "EURUSD", "type": "buy", "volume": 0.10, ... } ] }
```

### Market Order (open trade)
```http
POST /order/market
Body: { "login": 12345678, "symbol": "EURUSD", "side": "buy", "volume": 0.10, "sl": 1.0840, "tp": 1.0870, "comment": "scalp-m5" }
→ { "order": { "ticket": 500000002, "symbol": "EURUSD", "price": 1.08516, "retcode": 10009, ... } }
```

### Close Position
```http
POST /position/500000002/close
→ { "result": { "ticket": 500000002, "price": 1.08555, "profit": 3.90, "retcode": 10009 } }
```

### Modify SL/TP
```http
POST /position/500000002/modify
Body: { "sl": 1.0845, "tp": 1.0880 }
→ { "result": { "ticket": 500000002, "sl": 1.0845, "tp": 1.0880, "retcode": 10009 } }
```

## Security Notes

1. **The Python bridge has NO authentication.** Only run it on a trusted internal network, or put it behind a VPN.
2. **MT5 credentials are passed through the bridge.** The bridge does not store them — they're forwarded to `mt5.login()` and discarded.
3. **For production internet-facing deployments**, add an API key header check to both the Python bridge and the Node.js bridge.
4. **The mock adapter** is safe to expose — it cannot move real money.

## Fallback Behavior

The Next.js app (`src/lib/mt5-client.ts`) is designed with graceful fallback:
- If the MT5 bridge is **offline** → the app falls back to the existing synthetic `priceAt()` prices and local-only trades (no `mt5Ticket`).
- If the bridge is **online but adapter is `mock`** → trades execute in the bridge's in-memory state, no real broker.
- If the bridge is **online and adapter is `real-python`** → real MT5 orders are sent. The `mt5Ticket` field on the Trade record links to the broker's position ticket.

This means the app **never breaks** if the bridge is down — it degrades gracefully to simulation mode.
