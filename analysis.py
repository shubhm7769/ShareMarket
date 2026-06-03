"""
Institutional flow analysis — uses OHLCV from Node (Yahoo Finance) when available.
Proxies FII/DII/Retail/HNI splits from volume-weighted money flow.
Generates an advanced multi-panel technical and institutional analysis chart.
"""
import sys
import json
import hashlib
import os

CATEGORIES = [
    "FII (Foreign Institutional)",
    "DII (Domestic Institutional)",
    "Retail",
    "HNI (High Net Worth)",
]
# Base Indian-market participant weights (adjusted by signals)
BASE_WEIGHTS = [0.32, 0.28, 0.28, 0.12]


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _money_flow_bar(day):
    o, h, l, c, v = day.get("open"), day.get("high"), day.get("low"), day.get("close"), day.get("volume") or 0
    if None in (o, h, l, c) or v <= 0:
        return 0.0
    rng = h - l
    if rng > 0:
        mfm = ((c - l) - (h - c)) / rng
    else:
        mfm = 0.0
    return mfm * v * c / 1e7  # scale to crores-like units


def _deterministic_seed(symbol):
    h = hashlib.md5(symbol.encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


def _generate_chart(symbol, history, weights, signal, ai_score):
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        import pandas as pd
        import numpy as np
        
        # 1. Prepare data
        if not history:
            # Generate mock history for plotting if empty
            base_date = __import__("datetime").datetime.now()
            mock_hist = []
            seed_val = _deterministic_seed(symbol)
            price = 100.0 + seed_val * 400.0
            for i in range(30):
                d = (base_date - __import__("datetime").timedelta(days=29 - i)).strftime("%Y-%m-%d")
                s = _deterministic_seed(symbol + d)
                change = (s - 0.48) * 0.05
                close_p = price * (1 + change)
                open_p = price
                high_p = max(open_p, close_p) * (1 + abs(s - 0.5) * 0.02)
                low_p = min(open_p, close_p) * (1 - abs(s - 0.5) * 0.02)
                vol = 1000000 + int(s * 5000000)
                mock_hist.append({
                    "date": d,
                    "open": round(open_p, 2),
                    "high": round(high_p, 2),
                    "low": round(low_p, 2),
                    "close": round(close_p, 2),
                    "volume": vol
                })
                price = close_p
            history = mock_hist

        df = pd.DataFrame(history)
        
        # Ensure correct column types
        for col in ['open', 'high', 'low', 'close', 'volume']:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')
                
        # Fill NaNs if any
        df['close'] = df['close'].ffill().bfill()
        df['open'] = df['open'].fillna(df['close'])
        df['high'] = df['high'].fillna(df['close'])
        df['low'] = df['low'].fillna(df['close'])
        df['volume'] = df['volume'].fillna(0)
        
        # 2. Compute Moving Averages
        df['sma9'] = df['close'].rolling(window=9, min_periods=1).mean()
        df['sma21'] = df['close'].rolling(window=21, min_periods=1).mean()
        
        # 3. Compute Crossover Signals
        signals_buy = []
        signals_sell = []
        for idx in range(1, len(df)):
            prev_sma9 = df.loc[idx-1, 'sma9']
            prev_sma21 = df.loc[idx-1, 'sma21']
            curr_sma9 = df.loc[idx, 'sma9']
            curr_sma21 = df.loc[idx, 'sma21']
            
            # Prevent crossover signals if data is missing or flat
            if pd.isna(prev_sma9) or pd.isna(prev_sma21) or pd.isna(curr_sma9) or pd.isna(curr_sma21):
                continue
                
            if prev_sma9 <= prev_sma21 and curr_sma9 > curr_sma21:
                signals_buy.append((idx, df.loc[idx, 'low'] * 0.98))
            elif prev_sma9 >= prev_sma21 and curr_sma9 < curr_sma21:
                signals_sell.append((idx, df.loc[idx, 'high'] * 1.02))
                
        # 4. Compute Participant Flows
        df['flow'] = [round(_money_flow_bar(row), 2) for _, row in df.iterrows()]
        
        fii_w, dii_w, retail_w, hni_w = weights
        df['fii_net'] = df['flow'] * fii_w
        df['dii_net'] = df['flow'] * dii_w
        df['retail_net'] = df['flow'] * retail_w
        df['hni_net'] = df['flow'] * hni_w
        
        df['fii_cum'] = df['fii_net'].cumsum()
        df['dii_cum'] = df['dii_net'].cumsum()
        df['retail_cum'] = df['retail_net'].cumsum()
        df['hni_cum'] = df['hni_net'].cumsum()
        
        # 5. Set up plot styling to match the site's dark theme
        plt.style.use('dark_background')
        
        fig = plt.figure(figsize=(10, 8), facecolor='#040914', dpi=120)
        gs = fig.add_gridspec(3, 1, height_ratios=[3, 1.5, 1.2], hspace=0.18)
        
        ax1 = fig.add_subplot(gs[0])
        ax2 = fig.add_subplot(gs[1], sharex=ax1)
        ax3 = fig.add_subplot(gs[2], sharex=ax1)
        
        for ax in [ax1, ax2, ax3]:
            ax.set_facecolor('#0b1221')
            ax.grid(color='#ffffff', alpha=0.04, linestyle='--', linewidth=0.8)
            ax.spines['top'].set_visible(False)
            ax.spines['right'].set_visible(False)
            ax.spines['left'].set_color('#1e293b')
            ax.spines['bottom'].set_color('#1e293b')
            ax.tick_params(colors='#94a3b8', labelsize=8)
            
        # --- Plot 1: Candlestick Chart & SMAs ---
        for idx, row in df.iterrows():
            o, h, l, c = row['open'], row['high'], row['low'], row['close']
            color = '#10B981' if c >= o else '#EF4444'
            ax1.vlines(idx, l, h, colors=color, linewidth=1.2, alpha=0.9)
            height = abs(c - o)
            if height == 0:
                height = 0.01 * c
            bottom = min(o, c)
            ax1.bar(idx, height, bottom=bottom, color=color, width=0.6, align='center', edgecolor=color, linewidth=0.5)
            
        ax1.plot(df.index, df['sma9'], color='#0EA5E9', linewidth=1.5, label='Fast SMA (9)')
        ax1.plot(df.index, df['sma21'], color='#F59E0B', linewidth=1.5, label='Slow SMA (21)')
        
        buy_plotted = False
        sell_plotted = False
        for s_idx, s_val in signals_buy:
            ax1.plot(s_idx, s_val, '^', color='#10B981', markersize=7)
            ax1.text(s_idx, s_val * 0.99, 'BUY', color='#10B981', fontsize=6, ha='center', fontweight='bold')
            buy_plotted = True
            
        for s_idx, s_val in signals_sell:
            ax1.plot(s_idx, s_val, 'v', color='#EF4444', markersize=7)
            ax1.text(s_idx, s_val * 1.01, 'SELL', color='#EF4444', fontsize=6, ha='center', fontweight='bold')
            sell_plotted = True
            
        if buy_plotted:
            ax1.plot([], [], '^', color='#10B981', label='SMA Bullish Cross')
        if sell_plotted:
            ax1.plot([], [], 'v', color='#EF4444', label='SMA Bearish Cross')
            
        clean_symbol = symbol.replace('.NS', '').replace('-USD', '')
        ax1.set_title(f"{clean_symbol} Technical Candlesticks & SMA Crossovers", color='#f1f5f9', fontsize=10, pad=10, loc='left', fontweight='bold')
        ax1.legend(facecolor='#0b1221', edgecolor='#1e293b', loc='upper left', fontsize=7, framealpha=0.8)
        ax1.get_xaxis().set_visible(False)
        ax1.set_ylabel('Price (\u20b9)', color='#94a3b8', fontsize=8)
        
        # --- Plot 2: Cumulative Participant Net Flow ---
        ax2.plot(df.index, df['fii_cum'], color='#0EA5E9', linewidth=1.5, label='FII (Institutional)')
        ax2.plot(df.index, df['dii_cum'], color='#7C3AED', linewidth=1.5, label='DII (Domestic)')
        ax2.plot(df.index, df['retail_cum'], color='#F59E0B', linewidth=1.5, label='Retail (Individual)')
        ax2.plot(df.index, df['hni_cum'], color='#EC4899', linewidth=1.5, label='HNI (HNW)')
        
        ax2.fill_between(df.index, df['fii_cum'], 0, color='#0EA5E9', alpha=0.03)
        ax2.fill_between(df.index, df['dii_cum'], 0, color='#7C3AED', alpha=0.03)
        
        ax2.axhline(0, color='#ffffff', alpha=0.1, linestyle='-', linewidth=0.8)
        ax2.set_title("Cumulative Participant Net Money Flow (Cr)", color='#f1f5f9', fontsize=10, pad=8, loc='left', fontweight='bold')
        ax2.legend(facecolor='#0b1221', edgecolor='#1e293b', loc='upper left', fontsize=7, framealpha=0.8)
        ax2.set_ylabel('Net Flow (\u20b9 Cr)', color='#94a3b8', fontsize=8)
        ax2.get_xaxis().set_visible(False)
        
        # --- Plot 3: Daily Volume ---
        vol_colors = ['#10B981' if c >= o else '#EF4444' for o, c in zip(df['open'], df['close'])]
        ax3.bar(df.index, df['volume'] / 1e6, color=vol_colors, width=0.6, alpha=0.8, label='Daily Volume')
        
        df['vol_sma9'] = (df['volume'] / 1e6).rolling(window=9, min_periods=1).mean()
        ax3.plot(df.index, df['vol_sma9'], color='#ffffff', linestyle=':', linewidth=1.2, alpha=0.7, label='Volume SMA (9)')
        
        ax3.set_title("Trading Volume & Activity (Millions)", color='#f1f5f9', fontsize=10, pad=8, loc='left', fontweight='bold')
        ax3.set_ylabel('Vol (Millions)', color='#94a3b8', fontsize=8)
        ax3.legend(facecolor='#0b1221', edgecolor='#1e293b', loc='upper left', fontsize=7, framealpha=0.8)
        
        # X-ticks date formatting
        step = max(1, len(df) // 6)
        tick_indices = list(range(0, len(df), step))
        if len(df) - 1 not in tick_indices and (len(df) - 1 - tick_indices[-1]) > step / 2:
            tick_indices.append(len(df) - 1)
            
        date_labels = []
        for idx in tick_indices:
            d_str = str(df.loc[idx, 'date'])[:10]
            try:
                dt = pd.to_datetime(d_str)
                date_labels.append(dt.strftime('%b %d'))
            except Exception:
                date_labels.append(d_str[5:])
                
        ax3.set_xticks(tick_indices)
        ax3.set_xticklabels(date_labels, color='#94a3b8', fontsize=8)
        
        sig_color = '#10B981' if signal == 'BULLISH' else ('#EF4444' if signal == 'BEARISH' else '#0EA5E9')
        fig.suptitle(f"{clean_symbol} AI ANALYTICS & FLOW DASHBOARD  |  Score: {ai_score} ({signal})", 
                     color=sig_color, fontsize=12, fontweight='bold', y=0.96)
        
        os.makedirs('generated_charts', exist_ok=True)
        
        # Safe filename
        safe_sym = symbol.replace('.NS', '').replace('-USD', '').replace('.', '_')
        output_filename = f"flow_{safe_sym}.png"
        output_path = os.path.join('generated_charts', output_filename)
        
        plt.savefig(output_path, dpi=120, facecolor=fig.get_facecolor(), edgecolor='none', bbox_inches='tight')
        plt.close(fig)
        
        return f"/generated_charts/{output_filename}"
        
    except Exception as e:
        import traceback
        print("Chart generation failure:", str(e), file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return None


def analyze(symbol, market=None):
    quote = (market or {}).get("quote")
    history = (market or {}).get("history") or []

    daily_flows = []
    for d in history:
        if d.get("close") is not None:
            daily_flows.append({
                "date": str(d.get("date", ""))[:10],
                "flow": round(_money_flow_bar(d), 2),
            })

    total_inflow = 0.0
    total_outflow = 0.0
    if daily_flows:
        for f in daily_flows:
            if f["flow"] >= 0:
                total_inflow += f["flow"]
            else:
                total_outflow += abs(f["flow"])

    # Momentum & volume trend
    momentum = 0.0
    vol_trend = 0.0
    if len(history) >= 2:
        closes = [h["close"] for h in history if h.get("close")]
        vols = [h.get("volume") or 0 for h in history]
        if len(closes) >= 2:
            momentum = (closes[-1] - closes[0]) / closes[0] * 100 if closes[0] else 0
        if len(vols) >= 4:
            recent = sum(vols[-3:]) / 3
            older = sum(vols[:3]) / 3 if len(vols) >= 6 else sum(vols[:-3]) / max(len(vols) - 3, 1)
            vol_trend = ((recent - older) / older * 100) if older else 0

    change_pct = (quote or {}).get("changePercent") or 0
    market_cap = (quote or {}).get("marketCap") or 0

    # Large-cap → more FII/DII; high vol + momentum → more HNI
    cap_factor = _clamp((market_cap or 5e11) / 1e12, 0.2, 1.0)
    weights = list(BASE_WEIGHTS)
    weights[0] += 0.08 * cap_factor
    weights[1] += 0.06 * cap_factor
    weights[3] += 0.05 * _clamp(abs(momentum) / 10, 0, 1)
    weights[2] -= 0.06 * cap_factor
    w_sum = sum(weights)
    weights = [w / w_sum for w in weights]

    net_total = total_inflow - total_outflow
    if net_total == 0 and daily_flows:
        net_total = sum(f["flow"] for f in daily_flows)

    # Fallback when no history
    if not daily_flows:
        seed = _deterministic_seed(symbol)
        net_total = (seed - 0.5) * 400
        total_inflow = abs(net_total) + 120 + seed * 200
        total_outflow = total_inflow - net_total

    summary = []
    for i, cat in enumerate(CATEGORIES):
        share = weights[i]
        inf = max(0, total_inflow * share)
        out = max(0, total_outflow * share * (0.85 + 0.15 * (1 - share)))
        summary.append({
            "category": cat,
            "inflow": round(inf, 2),
            "outflow": round(out, 2),
            "net": round(inf - out, 2),
        })

    if not daily_flows:
        base_date = __import__("datetime").datetime.now()
        daily_flows = []
        for i in range(10):
            d = (base_date - __import__("datetime").timedelta(days=9 - i)).strftime("%Y-%m-%d")
            s = _deterministic_seed(symbol + d)
            daily_flows.append({"date": d, "flow": round((s - 0.48) * 180, 2)})

    # AI conviction score (0–100)
    flow_bias = _clamp(net_total / 50, -1, 1) * 25
    mom_score = _clamp(momentum, -15, 15) * 1.2
    vol_score = _clamp(vol_trend, -30, 30) * 0.4
    chg_score = _clamp(change_pct, -8, 8) * 2.5
    ai_score = round(_clamp(62 + flow_bias + mom_score + vol_score + chg_score, 35, 98), 1)

    signal = "BULLISH" if ai_score >= 70 else ("BEARISH" if ai_score < 45 else "NEUTRAL")

    # Generate analytical dashboard chart via Matplotlib
    chart_image = _generate_chart(symbol, history, weights, signal, ai_score)

    return {
        "symbol": symbol,
        "summary": summary,
        "history": daily_flows[-14:],
        "ai_score": ai_score,
        "signal": signal,
        "chart_image": chart_image,
        "metrics": {
            "net_flow_cr": round(net_total, 2),
            "momentum_pct": round(momentum, 2),
            "volume_trend_pct": round(vol_trend, 2),
            "change_pct": round(change_pct, 2),
        },
    }


def _read_stdin_json(timeout_sec=2.0):
    if sys.stdin.isatty():
        return None
    import threading
    holder = []

    def _reader():
        holder.append(sys.stdin.read())

    t = threading.Thread(target=_reader, daemon=True)
    t.start()
    t.join(timeout=timeout_sec)
    if not holder or not holder[0].strip():
        return None
    try:
        return json.loads(holder[0])
    except json.JSONDecodeError:
        return None


def main():
    symbol = "RELIANCE.NS"
    if len(sys.argv) > 1:
        symbol = sys.argv[1].upper()

    market = _read_stdin_json(timeout_sec=0.25 if len(sys.argv) > 1 else 2.0)
    if market:
        symbol = market.get("symbol", symbol).upper()

    result = analyze(symbol, market)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
