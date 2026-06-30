#!/usr/bin/env python3
"""
MT5 Python Bridge — production adapter for FinexFX AI Trading System.

REQUIREMENTS:
  - Windows OS (MetaTrader5 package is Windows-only)
  - MetaTrader 5 terminal installed + logged in to your FINEX Indonesia account
  - Python 3.10+
  - Packages: pip install MetaTrader5 flask flask-cors

USAGE:
  python mt5_bridge.py --port 5050
  python mt5_bridge.py --port 5050 --host 0.0.0.0  # allow remote connections

ENVIRONMENT:
  MT5_PATH  — path to terminal64.exe (optional, auto-detected if not set)
              e.g. "C:\\Program Files\\MetaTrader 5\\terminal64.exe"

ENDPOINTS (HTTP JSON):
  GET  /health                    → { status, mt5_installed, terminal_connected }
  POST /connect                   → { account }     body: { login, server, password }
  POST /disconnect/<login>        → { ok }
  GET  /account/<login>           → { account }
  GET  /tick/<symbol>             → { tick }
  GET  /bars/<symbol>?tf=M5&count=100 → { bars }
  GET  /positions/<login>         → { positions }
  POST /order/market              → { order }       body: { login, symbol, side, volume, sl?, tp?, comment? }
  POST /position/<ticket>/close   → { result }
  POST /position/<ticket>/modify  → { result }      body: { sl, tp }

SECURITY NOTE:
  This bridge is intended to run on a trusted internal network. It does NOT
  implement authentication. If exposing it externally, put it behind a VPN
  or add an API key header check.
"""

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Optional

try:
    import MetaTrader5 as mt5
except ImportError:
    print("ERROR: MetaTrader5 package not installed. Run: pip install MetaTrader5")
    print("Note: This package only works on Windows with MT5 terminal installed.")
    sys.exit(1)

try:
    from flask import Flask, request, jsonify
    from flask_cors import CORS
except ImportError:
    print("ERROR: Flask not installed. Run: pip install flask flask-cors")
    sys.exit(1)

app = Flask(__name__)
CORS(app)

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
log = logging.getLogger('mt5-bridge')

# ─── MT5 connection state ─────────────────────────────────────────────────────
_connected_logins: dict[int, dict] = {}


def _ensure_initialized():
    """Initialize MT5 terminal connection if not already done."""
    if not mt5.initialize(path=os.environ.get('MT5_PATH')):
        raise RuntimeError(f"MT5 initialize() failed: {mt5.last_error()}")


def _fmt_dt(dt) -> str:
    if dt is None:
        return None
    if hasattr(dt, 'isoformat'):
        return dt.isoformat()
    return datetime.fromtimestamp(dt, tz=timezone.utc).isoformat()


# ─── Routes ────────────────────────────────────────────────────────────────────

@app.route('/health')
def health():
    installed = True
    try:
        _ensure_initialized()
        info = mt5.terminal_info()
        terminal_connected = info is not None and info.connected
    except Exception as e:
        installed = False
        terminal_connected = False
    return jsonify({
        'status': 'ok',
        'mt5_installed': installed,
        'terminal_connected': terminal_connected,
        'connected_logins': list(_connected_logins.keys()),
    })


@app.route('/connect', methods=['POST'])
def connect():
    body = request.get_json() or {}
    login = body.get('login')
    server = body.get('server')
    password = body.get('password')
    if not login or not server or not password:
        return jsonify({'error': 'login, server, password are required'}), 400

    _ensure_initialized()
    # MT5 authorize is global — we authorize with the last-requested credentials.
    # For multi-account, you'd need to shutdown + re-initialize per login.
    if not mt5.login(login=int(login), password=password, server=server):
        err = mt5.last_error()
        return jsonify({'error': f'Login failed: {err}'}), 401

    info = mt5.account_info()
    if info is None:
        return jsonify({'error': 'account_info() returned None'}), 500

    account = {
        'login': info.login,
        'server': server,
        'currency': info.currency,
        'leverage': info.leverage,
        'balance': info.balance,
        'equity': info.equity,
        'margin': info.margin,
        'freeMargin': info.margin_free,
        'marginLevel': info.margin_level,
        'name': info.name,
        'company': info.company,
        'connectedAt': datetime.now(timezone.utc).isoformat(),
    }
    _connected_logins[login] = account
    log.info(f"Connected: login={login} server={server} balance={info.balance} {info.currency}")
    return jsonify({'account': account})


@app.route('/disconnect/<int:login>', methods=['POST'])
def disconnect(login):
    _connected_logins.pop(login, None)
    log.info(f"Disconnected: login={login}")
    return jsonify({'ok': True})


@app.route('/account/<int:login>')
def account_info(login):
    if login not in _connected_logins:
        return jsonify({'error': 'Account not connected'}), 404
    info = mt5.account_info()
    if info is None:
        return jsonify({'error': 'account_info() returned None'}), 500
    return jsonify({
        'account': {
            'login': info.login,
            'server': _connected_logins[login]['server'],
            'currency': info.currency,
            'leverage': info.leverage,
            'balance': info.balance,
            'equity': info.equity,
            'margin': info.margin,
            'freeMargin': info.margin_free,
            'marginLevel': info.margin_level,
            'name': info.name,
            'company': info.company,
            'connectedAt': _connected_logins[login]['connectedAt'],
        }
    })


@app.route('/tick/<symbol>')
def tick(symbol):
    info = mt5.symbol_info_tick(symbol)
    if info is None:
        return jsonify({'error': f'Unknown symbol: {symbol}'}), 404
    sym = mt5.symbol_info(symbol)
    spread = (info.ask - info.bid) if sym else 0
    return jsonify({
        'tick': {
            'symbol': symbol,
            'bid': info.bid,
            'ask': info.ask,
            'spread': spread,
            'time': _fmt_dt(info.time),
        }
    })


@app.route('/bars/<symbol>')
def bars(symbol):
    tf_name = request.args.get('tf', 'M5')
    count = int(request.args.get('count', '100'))
    tf_map = {
        'M1': mt5.TIMEFRAME_M1, 'M5': mt5.TIMEFRAME_M5,
        'M15': mt5.TIMEFRAME_M15, 'H1': mt5.TIMEFRAME_H1,
        'H4': mt5.TIMEFRAME_H4, 'D1': mt5.TIMEFRAME_D1,
    }
    tf = tf_map.get(tf_name, mt5.TIMEFRAME_M5)
    rates = mt5.copy_rates_from_pos(symbol, tf, 0, min(max(count, 1), 1000))
    if rates is None:
        return jsonify({'error': 'copy_rates_from_pos failed'}), 500
    out = []
    for r in rates:
        out.append({
            'time': datetime.fromtimestamp(r['time'], tz=timezone.utc).isoformat(),
            'open': float(r['open']),
            'high': float(r['high']),
            'low': float(r['low']),
            'close': float(r['close']),
            'volume': int(r['tick_volume']),
        })
    return jsonify({'bars': out})


@app.route('/positions/<int:login>')
def positions(login):
    if login not in _connected_logins:
        return jsonify({'error': 'Account not connected'}), 404
    pos = mt5.positions_get()
    if pos is None:
        return jsonify({'positions': []})
    out = []
    for p in pos:
        out.append({
            'ticket': p.ticket,
            'symbol': p.symbol,
            'type': 'buy' if p.type == mt5.POSITION_TYPE_BUY else 'sell',
            'volume': p.volume,
            'priceOpen': p.price_open,
            'priceCurrent': p.price_current,
            'sl': p.sl if p.sl != 0 else None,
            'tp': p.tp if p.tp != 0 else None,
            'profit': p.profit,
            'swap': p.swap,
            'commission': 0,  # MT5 doesn't expose this in positions_get
            'time': _fmt_dt(p.time),
            'comment': p.comment,
        })
    return jsonify({'positions': out})


@app.route('/order/market', methods=['POST'])
def market_order():
    body = request.get_json() or {}
    symbol = body.get('symbol')
    side = body.get('side', 'buy')
    volume = float(body.get('volume', 0.01))
    sl = body.get('sl')
    tp = body.get('tp')
    comment = body.get('comment', '')

    if not symbol or side not in ('buy', 'sell'):
        return jsonify({'error': 'symbol and side (buy/sell) are required'}), 400

    # Ensure symbol is selected (visible in Market Watch)
    sym_info = mt5.symbol_info(symbol)
    if sym_info is None:
        return jsonify({'error': f'Unknown symbol: {symbol}'}), 404
    if not sym_info.visible:
        if not mt5.symbol_select(symbol, True):
            return jsonify({'error': f'symbol_select({symbol}) failed'}), 500

    order_type = mt5.ORDER_TYPE_BUY if side == 'buy' else mt5.ORDER_TYPE_SELL
    price = mt5.symbol_info_tick(symbol).ask if side == 'buy' else mt5.symbol_info_tick(symbol).bid

    request_data = {
        'action': mt5.TRADE_ACTION_DEAL,
        'symbol': symbol,
        'volume': volume,
        'type': order_type,
        'price': price,
        'sl': float(sl) if sl else 0.0,
        'tp': float(tp) if tp else 0.0,
        'deviation': 20,
        'magic': 234000,
        'comment': comment,
        'type_time': mt5.ORDER_TIME_GTC,
        'type_filling': mt5.ORDER_FILLING_IOC,
    }
    result = mt5.order_send(request_data)
    if result is None:
        return jsonify({'error': 'order_send returned None'}), 500
    if result.retcode != mt5.TRADE_RETCODE_DONE:
        return jsonify({
            'error': f'order failed: retcode={result.retcode} {result.comment}',
            'retcode': result.retcode,
        }), 400

    return jsonify({
        'order': {
            'ticket': result.order,
            'symbol': symbol,
            'type': side,
            'volume': volume,
            'price': result.price,
            'sl': sl or None,
            'tp': tp or None,
            'comment': comment,
            'retcode': result.retcode,
            'retcodeExternal': result.comment,
        }
    })


@app.route('/position/<int:ticket>/close', methods=['POST'])
def close_position(ticket):
    pos_list = mt5.positions_get(ticket=ticket)
    if not pos_list:
        return jsonify({'error': f'Position {ticket} not found'}), 404
    p = pos_list[0]
    sym_info = mt5.symbol_info(p.symbol)
    if sym_info is None:
        return jsonify({'error': f'Unknown symbol: {p.symbol}'}), 404
    tick = mt5.symbol_info_tick(p.symbol)
    close_price = tick.bid if p.type == mt5.POSITION_TYPE_BUY else tick.ask
    opposite_type = mt5.ORDER_TYPE_SELL if p.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY

    request_data = {
        'action': mt5.TRADE_ACTION_DEAL,
        'symbol': p.symbol,
        'volume': p.volume,
        'type': opposite_type,
        'position': ticket,
        'price': close_price,
        'deviation': 20,
        'magic': 234000,
        'comment': 'close via FinexFX',
        'type_time': mt5.ORDER_TIME_GTC,
        'type_filling': mt5.ORDER_FILLING_IOC,
    }
    result = mt5.order_send(request_data)
    if result is None:
        return jsonify({'error': 'order_send returned None'}), 500
    return jsonify({
        'result': {
            'ticket': ticket,
            'price': result.price,
            'profit': p.profit,
            'retcode': result.retcode,
        }
    })


@app.route('/position/<int:ticket>/modify', methods=['POST'])
def modify_position(ticket):
    body = request.get_json() or {}
    sl = body.get('sl')
    tp = body.get('tp')
    pos_list = mt5.positions_get(ticket=ticket)
    if not pos_list:
        return jsonify({'error': f'Position {ticket} not found'}), 404
    p = pos_list[0]
    request_data = {
        'action': mt5.TRADE_ACTION_SLTP,
        'symbol': p.symbol,
        'position': ticket,
        'sl': float(sl) if sl else 0.0,
        'tp': float(tp) if tp else 0.0,
    }
    result = mt5.order_send(request_data)
    if result is None:
        return jsonify({'error': 'order_send returned None'}), 500
    return jsonify({
        'result': {
            'ticket': ticket,
            'sl': sl,
            'tp': tp,
            'retcode': result.retcode,
        }
    })


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='FinexFX MT5 Python Bridge')
    parser.add_argument('--port', type=int, default=5050, help='Port to listen on')
    parser.add_argument('--host', default='127.0.0.1', help='Host to bind (use 0.0.0.0 for remote)')
    args = parser.parse_args()

    print(f"╔══════════════════════════════════════════════════════════════╗")
    print(f"║  FinexFX MT5 Python Bridge                                   ║")
    print(f"║  Listening: http://{args.host}:{args.port:<28}             ║")
    print(f"║  MT5 Path:  {os.environ.get('MT5_PATH', 'auto-detect'):<44} ║")
    print(f"╚══════════════════════════════════════════════════════════════╝")

    app.run(host=args.host, port=args.port, debug=False, threaded=True)
