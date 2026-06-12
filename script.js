/**
 * BULL TRACK TERMINAL v35.0 - THE "ULTRA REAL" PRO TERMINAL
 * Persistent Watchlist | Portfolio Heatmaps | Fundamental Analysis | Sector Allocation
 */

const DUMMY_SEED = {
    wallet: { balance: 10000000000 },
    holdings: [
        { symbol: 'RELIANCE.NS', name: 'Reliance Industries', qty: 100, cost: 2850.40, sector: 'Energy' },
        { symbol: 'TCS.NS', name: 'Tata Consultancy', qty: 50, cost: 3920.15, sector: 'IT' },
        { symbol: 'HDFCBANK.NS', name: 'HDFC Bank', qty: 150, cost: 1420.00, sector: 'Finance' }
    ],
    history: [],
    watchlist: ['RELIANCE.NS', 'TCS.NS', 'BTC-USD', 'ETH-USD', 'SOL-USD', 'INFY.NS', 'HDFCBANK.NS'],
    theme: 'dark',
    profile: { username: 'Shubham Kumar', bio: 'Wealth Manager Pro' }
};

const StateManager = {
    get() {
        const s = localStorage.getItem('BULL_TRACK_STATE');
        return s ? JSON.parse(s) : DUMMY_SEED;
    },
    save(state) { localStorage.setItem('BULL_TRACK_STATE', JSON.stringify(state)); }
};

const AppState = {
    ...StateManager.get(),
    masterStocks: [],
    masterCryptos: [],
    liveQuotes: {},
    cryptoSearch: '',
    activeView: 'dashboard',
    currentTrade: { symbol: '', price: 0 },
    hubSearch: '',
    stockMarket: { sector: 'all', page: 1, sort: 'change', search: '', view: 'table', items: [], total: 0, hasMore: false, loading: false }
};

const ChartService = {
    _charts: {},
    _lwChart: null,
    _lwSeries: null,

    destroy(id) {
        if (this._charts[id]) {
            this._charts[id].destroy();
            delete this._charts[id];
        }
    },

    destroyLw() {
        if (this._lwChart) {
            this._lwChart.remove();
            this._lwChart = null;
            this._lwSeries = null;
        }
    },

    fmtInr(v) {
        if (v == null || isNaN(v)) return '—';
        const abs = Math.abs(v);
        if (abs >= 1e7) return '₹' + (v / 1e7).toFixed(2) + ' Cr';
        if (abs >= 1e5) return '₹' + (v / 1e5).toFixed(2) + ' L';
        return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    },

    baseOptions(extra = {}) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(8,10,18,0.96)',
                    titleColor: '#F1F5F9',
                    bodyColor: '#94A3B8',
                    borderColor: 'rgba(14,165,233,0.35)',
                    borderWidth: 1,
                    padding: 14,
                    titleFont: { family: 'Inter', size: 12, weight: '600' },
                    bodyFont: { family: 'Inter', size: 11 },
                    callbacks: {
                        label(ctx) {
                            const v = ctx.parsed.y ?? ctx.parsed;
                            return ` ${ctx.dataset.label || ''}: ${ChartService.fmtInr(v)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#64748B', font: { size: 10, family: 'Inter' }, maxRotation: 0 },
                    grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false }
                },
                y: {
                    ticks: {
                        color: '#64748B',
                        font: { size: 10 },
                        callback: v => ChartService.fmtInr(v)
                    },
                    grid: { color: 'rgba(255,255,255,0.06)', drawBorder: false }
                }
            },
            ...extra
        };
    },

    renderPortfolioCombo(canvasId, trendRows) {
        const el = document.getElementById(canvasId);
        if (!el || typeof Chart === 'undefined') return;

        const labels = trendRows.map(r => {
            const d = new Date(r.date + 'T12:00:00');
            return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
        });
        const netWorth = trendRows.map(r => r.net_worth || 0);
        const pnls = trendRows.map(r => r.pnl || 0);
        const barColors = pnls.map(v =>
            v >= 0 ? 'rgba(16,185,129,0.75)' : 'rgba(239,68,68,0.75)'
        );

        this.destroy('portfolio');

        const ctx = el.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, 280);
        grad.addColorStop(0, 'rgba(14,165,233,0.35)');
        grad.addColorStop(1, 'rgba(14,165,233,0)');

        this._charts.portfolio = new Chart(el, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        type: 'line',
                        label: 'Net Worth',
                        data: netWorth,
                        borderColor: '#0EA5E9',
                        backgroundColor: grad,
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2.5,
                        pointRadius: 4,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#0EA5E9',
                        pointBorderWidth: 2,
                        yAxisID: 'y'
                    },
                    {
                        type: 'bar',
                        label: 'Total P&L',
                        data: pnls,
                        backgroundColor: barColors,
                        borderRadius: 6,
                        borderSkipped: false,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: this.baseOptions({
                scales: {
                    x: {
                        ticks: { color: '#64748B', font: { size: 10 } },
                        grid: { display: false }
                    },
                    y: {
                        position: 'left',
                        ticks: { color: '#0EA5E9', callback: v => ChartService.fmtInr(v) },
                        grid: { color: 'rgba(14,165,233,0.08)' }
                    },
                    y1: {
                        position: 'right',
                        ticks: { color: '#94A3B8', callback: v => ChartService.fmtInr(v) },
                        grid: { drawOnChartArea: false }
                    }
                }
            })
        });
    },

    renderHoldingsBar(canvasId, holdings) {
        const el = document.getElementById(canvasId);
        if (!el || typeof Chart === 'undefined') return;

        const rows = holdings.map(h => {
            const ltp = AppState.liveQuotes[h.symbol]?.price || h.cost || 0;
            const pnl = (ltp - h.cost) * h.qty;
            const sym = h.symbol.replace('.NS', '').replace('-USD', '');
            return { sym, pnl, pct: h.cost > 0 ? ((ltp - h.cost) / h.cost) * 100 : 0 };
        }).sort((a, b) => b.pnl - a.pnl).slice(0, 8);

        if (!rows.length) return;

        this.destroy('holdingsBar');
        this._charts.holdingsBar = new Chart(el, {
            type: 'bar',
            data: {
                labels: rows.map(r => r.sym),
                datasets: [{
                    label: 'P&L (₹)',
                    data: rows.map(r => r.pnl),
                    backgroundColor: rows.map(r =>
                        r.pnl >= 0 ? 'rgba(16,185,129,0.8)' : 'rgba(239,68,68,0.8)'
                    ),
                    borderRadius: 8,
                    borderSkipped: false
                }]
            },
            options: this.baseOptions({
                indexAxis: 'y',
                plugins: {
                    tooltip: {
                        callbacks: {
                            afterLabel(ctx) {
                                const r = rows[ctx.dataIndex];
                                return ` Return: ${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(2)}%`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#64748B', callback: v => ChartService.fmtInr(v) },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: { ticks: { color: '#E2E8F0', font: { weight: '600', size: 11 } }, grid: { display: false } }
                }
            })
        });
    },

    renderFlowBar(canvasId, history, label) {
        const el = document.getElementById(canvasId);
        if (!el || !history?.length) return;
        this.destroy(canvasId);
        const labels = history.map(h => (h.date || '').slice(5));
        const flows = history.map(h => h.flow);
        this._charts[canvasId] = new Chart(el, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: label || 'Net Flow',
                    data: flows,
                    backgroundColor: flows.map(f =>
                        f >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'
                    ),
                    borderRadius: 8,
                    borderSkipped: false
                }]
            },
            options: this.baseOptions({
                plugins: {
                    tooltip: {
                        callbacks: {
                            label(ctx) {
                                return ` Flow: ${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y.toFixed(2)} Cr`;
                            }
                        }
                    }
                }
            })
        });
    },

    renderDoughnut(canvasId, labels, values, colors) {
        const el = document.getElementById(canvasId);
        if (!el || !labels.length) return;
        this.destroy(canvasId);
        this._charts[canvasId] = new Chart(el, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors || ['#0EA5E9', '#10B981', '#7C3AED', '#F59E0B', '#EF4444', '#EC4899'],
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '72%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#94A3B8', boxWidth: 10, font: { size: 11 }, padding: 14 }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(8,10,18,0.96)',
                        callbacks: {
                            label(ctx) {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = total ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                                return ` ${ctx.label}: ${ChartService.fmtInr(ctx.parsed)} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    },

    renderScreenerBar(canvasId, items, title) {
        const el = document.getElementById(canvasId);
        if (!el || !items?.length) return;
        this.destroy(canvasId);
        const top = items.slice(0, 8);
        this._charts[canvasId] = new Chart(el, {
            type: 'bar',
            data: {
                labels: top.map(q => q.symbol.replace('.NS', '').replace('-USD', '')),
                datasets: [{
                    label: title,
                    data: top.map(q => q.changePercent || 0),
                    backgroundColor: top.map(q =>
                        (q.changePercent || 0) >= 0 ? 'rgba(16,185,129,0.75)' : 'rgba(239,68,68,0.75)'
                    ),
                    borderRadius: 6
                }]
            },
            options: this.baseOptions({
                plugins: {
                    tooltip: {
                        callbacks: {
                            label(ctx) {
                                return ` ${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y.toFixed(2)}%`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: { callback: v => v + '%' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            })
        });
    },

    async renderCryptoCandles(containerId, symbol, period) {
        const container = document.getElementById(containerId);
        if (!container) return;

        let data = [];
        try {
            data = await fetch(`/api/market/chart?symbol=${encodeURIComponent(symbol)}&period=${period || '1M'}`).then(r => r.json());
        } catch (e) {}

        this.destroyLw();
        container.innerHTML = '';

        if (!data.length || typeof LightweightCharts === 'undefined') {
            container.innerHTML = '<div class="chart-empty-msg">Chart loading… check connection or retry.</div>';
            return;
        }

        const chart = LightweightCharts.createChart(container, {
            width: container.clientWidth || container.offsetWidth || (containerId === 'terminal-chart' ? 356 : 600),
            height: containerId === 'terminal-chart' ? 180 : (container.clientHeight || 340),
            layout: {
                background: { type: 'solid', color: '#0B0F1A' },
                textColor: '#94A3B8',
                fontFamily: 'Inter, sans-serif'
            },
            grid: {
                vertLines: { color: 'rgba(255,255,255,0.04)' },
                horzLines: { color: 'rgba(255,255,255,0.04)' }
            },
            crosshair: { vertLine: { color: 'rgba(245,158,11,0.4)' }, horzLine: { color: 'rgba(245,158,11,0.4)' } },
            rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
            timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: true }
        });

        const candles = data.map(d => ({
            time: Math.floor(new Date(d.date).getTime() / 1000),
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close
        })).filter((c, i, arr) => i === 0 || c.time > arr[i - 1].time);

        let series;
        if (typeof chart.addCandlestickSeries === 'function') {
            series = chart.addCandlestickSeries({
                upColor: '#10B981',
                downColor: '#EF4444',
                borderUpColor: '#10B981',
                borderDownColor: '#EF4444',
                wickUpColor: '#10B981',
                wickDownColor: '#EF4444'
            });
            series.setData(candles);
        } else {
            series = chart.addAreaSeries({
                lineColor: '#F59E0B',
                topColor: 'rgba(245,158,11,0.4)',
                bottomColor: 'rgba(245,158,11,0.02)'
            });
            series.setData(candles.map(c => ({ time: c.time, value: c.close })));
        }
        chart.timeScale().fitContent();

        this._lwChart = chart;
        this._lwSeries = series;

        if (!this._lwResize) {
            this._lwResize = () => {
                if (this._lwChart && container) {
                    this._lwChart.applyOptions({ width: container.clientWidth });
                }
            };
            window.addEventListener('resize', this._lwResize);
        }
    }
};

const DataService = {
    isCrypto(sym) {
        const q = AppState.liveQuotes[sym];
        if (q && q.assetType === 'crypto') return true;
        return /^[A-Z0-9]+-USD$/.test((sym || '').toUpperCase()) || AppState.masterCryptos.some(c => c.symbol === sym);
    },
    formatPrice(sym, price) {
        if (price == null || isNaN(price)) return '—';
        if (this.isCrypto(sym)) {
            return '\u20b9' + price.toLocaleString('en-IN', { maximumFractionDigits: price >= 10000 ? 0 : 2 });
        }
        return '\u20b9' + price.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    },
    async init() {
        try { const res = await fetch('stocks.json'); AppState.masterStocks = await res.json(); } catch(e){}
        try { const res = await fetch('crypto.json'); AppState.masterCryptos = await res.json(); } catch(e){}
        try { const w = await fetch('/api/wallet').then(r=>r.json()); AppState.wallet = w; } catch(e){}
        try { const h = await fetch('/api/holdings').then(r=>r.json()); AppState.holdings = h.filter(h=>h&&h.symbol); } catch(e){}
        const hc = document.getElementById('nav-holdings-count');
        if(hc) hc.innerText = AppState.holdings.length;
        await this.refreshQuotes();
        await this.fetchIndices();
        this.updateTicker();
    },
    async fetchIndices() {
        try {
            const [stocks, crypto] = await Promise.all([
                fetch('/api/market/quote?symbols=^NSEI,^BSESN,^NSEBANK').then(r=>r.json()).catch(()=>[]),
                fetch('/api/crypto/quote?symbols=BTC-USD,ETH-USD').then(r=>r.json()).catch(()=>[])
            ]);
            const res = [...(Array.isArray(stocks)?stocks:[]), ...(Array.isArray(crypto)?crypto:[])];
            const map = {}; res.forEach(q=>{ if(q?.symbol) { map[q.symbol]=q; AppState.liveQuotes[q.symbol]=q; }});
            const set = (id, chgId, sym, isCrypto) => {
                const q = map[sym]; if(!q) return;
                const el = document.getElementById(id); const chgEl = document.getElementById(chgId);
                if(el) {
                    if (isCrypto) el.innerText = this.formatPrice(sym, q.price).replace('\u20b9', '\u20b9');
                    else el.innerText = q.price.toLocaleString('en-IN',{maximumFractionDigits:0});
                }
                if(chgEl) { chgEl.innerText = (q.changePercent>=0?'+':'')+q.changePercent.toFixed(2)+'%'; chgEl.className = 'index-chg '+(q.changePercent>=0?'text-green':'text-red'); }
            };
            set('idx-nifty','idx-nifty-chg','^NSEI', false);
            set('idx-sensex','idx-sensex-chg','^BSESN', false);
            set('idx-bank','idx-bank-chg','^NSEBANK', false);
            set('idx-btc','idx-btc-chg','BTC-USD', true);
            set('idx-eth','idx-eth-chg','ETH-USD', true);
        } catch(e){}
    },
    updateTicker() {
        const ticker = document.getElementById('live-ticker'); if(!ticker) return;
        const priority = ['BTC-USD','ETH-USD','SOL-USD', ...AppState.watchlist, ...Object.keys(AppState.liveQuotes)];
        const syms = [...new Set(priority)].filter(s => AppState.liveQuotes[s]).slice(0, 18);
        if(!syms.length) return;
        ticker.innerHTML = syms.map(s => {
            const q = AppState.liveQuotes[s];
            const chg = q.changePercent>=0?'tg':'tr';
            const label = s.replace('.NS','').replace('-USD','');
            const px = this.formatPrice(s, q.price);
            const usd = q.priceUsd ? ` <small style="opacity:0.6">$${q.priceUsd.toLocaleString('en-US',{maximumFractionDigits:0})}</small>` : '';
            return `<span><b>${label}</b> ${px}${usd} <span class="${chg}">${q.changePercent>=0?'+':''}${q.changePercent?.toFixed(2)||'0.00'}%</span></span>`;
        }).join('');
    },
    async refreshQuotes() {
        const hc = document.getElementById('nav-holdings-count');
        if(hc) hc.innerText = AppState.holdings.length;
        
        let visibleStocks = AppState.masterStocks.slice(0, 60).map(s=>s.symbol);
        if (AppState.activeView === 'stocks') {
            visibleStocks = AppState.masterStocks
                .filter(s => s.symbol.toLowerCase().includes(AppState.hubSearch)||s.name?.toLowerCase().includes(AppState.hubSearch))
                .slice(0, 60)
                .map(s => s.symbol);
        }

        const allSyms = [...new Set([
            'BTC-USD','ETH-USD','SOL-USD',
            ...AppState.watchlist,
            ...AppState.holdings.filter(h=>h&&h.symbol).map(h=>h.symbol),
            ...visibleStocks,
            ...AppState.masterCryptos.map(c => c.symbol)
        ])].filter(Boolean);

        const cryptoSyms = allSyms.filter(s => this.isCrypto(s));
        const stockSyms = allSyms.filter(s => !this.isCrypto(s));

        if (cryptoSyms.length && AppState.activeView !== 'crypto') {
            try {
                const cq = await fetch(`/api/crypto/quote?symbols=${encodeURIComponent(cryptoSyms.join(','))}`).then(r=>r.json());
                if (Array.isArray(cq)) cq.forEach(q => { if (q?.symbol) AppState.liveQuotes[q.symbol] = q; });
            } catch(e){}
        }

        if (stockSyms.length) {
            const chunks = [];
            for (let i = 0; i < stockSyms.length; i += 15) chunks.push(stockSyms.slice(i, i + 15).join(','));
            for (const chunk of chunks) {
                try {
                    const quotes = await fetch(`/api/market/quote?symbols=${encodeURIComponent(chunk)}`).then(r=>r.json());
                    if (Array.isArray(quotes)) quotes.forEach(q => { if (q?.symbol) AppState.liveQuotes[q.symbol] = q; });
                } catch(e){}
            }
        }

        const hb = document.getElementById('header-balance');
        if(hb) hb.innerText = '\u20b9'+(AppState.wallet?.balance||0).toLocaleString('en-IN',{maximumFractionDigits:0});
        this.updateTicker();
        if (AppState.activeView === 'crypto') UI.renderCryptoGrid?.();
    },

    async ensureQuote(sym) {
        if (AppState.liveQuotes[sym]?.price > 0) return AppState.liveQuotes[sym];
        try {
            const url = this.isCrypto(sym)
                ? `/api/crypto/quote?symbols=${encodeURIComponent(sym)}`
                : `/api/market/quote?symbols=${encodeURIComponent(sym)}`;
            const quotes = await fetch(url).then(r => r.json());
            const q = Array.isArray(quotes) ? quotes[0] : null;
            if (q?.symbol) AppState.liveQuotes[q.symbol] = q;
            return q;
        } catch (e) { return null; }
    }
};

const UI = {
    async start() {
        await DataService.init();
        this.applyTheme();
        this.bindEvents();
        this.renderView('dashboard');
        this.renderWatchlist();
        // Refresh every 60 seconds only (not 5 sec spam)
        setInterval(() => this.loop(), 60000);
        this.notify('BullTrack Pro — Stocks + Crypto Live ✔', 'success');
    },

    addBalance() { 
        this.setWalletMode('add'); 
        document.getElementById('balance-modal').classList.remove('hidden'); 
        if(window.lucide) window.lucide.createIcons(); 
    },
    setWalletMode(mode) {
        this._walletMode = mode;
        const btnAdd = document.getElementById('tab-add');
        const btnWith = document.getElementById('tab-withdraw');
        const submit = document.getElementById('btn-wallet-submit');
        if(!btnAdd) return;
        if(mode === 'add') {
            btnAdd.className = 'btn-primary'; btnAdd.style.flex='1';
            btnWith.className = 'btn-secondary'; btnWith.style.cssText='flex:1;justify-content:center;';
            submit.textContent = 'Confirm Deposit';
            submit.style.background = 'var(--green)';
        } else {
            btnAdd.className = 'btn-secondary'; btnAdd.style.cssText='flex:1;justify-content:center;';
            btnWith.className = 'btn-primary'; btnWith.style.flex='1';
            submit.textContent = 'Confirm Withdrawal';
            submit.style.background = 'var(--red)';
        }
    },
    async confirmWalletTx() {
        const input = document.getElementById('add-bal-input');
        const amt = parseFloat(input.value);
        if(!amt || amt <= 0) return this.notify('Enter a valid amount', 'error');
        const mode = this._walletMode || 'add';
        if(mode === 'withdraw' && amt > AppState.wallet.balance) {
            return this.notify(`Insufficient funds! Available: \u20b9${Math.floor(AppState.wallet.balance).toLocaleString('en-IN')}`, 'error');
        }
        const txAmt = mode === 'add' ? amt : -amt;
        input.value = '';
        document.getElementById('balance-modal').classList.add('hidden');
        try {
            const res = await fetch('/api/wallet/transaction', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ amount: txAmt }) });
            const data = await res.json();
            if(data.error) throw new Error(data.error);
            AppState.wallet = data;
            const hb = document.getElementById('header-balance');
            if(hb) hb.innerText = '\u20b9' + Math.floor(data.balance).toLocaleString('en-IN');
            this.notify(mode === 'add' ? `\u20b9${amt.toLocaleString()} deposited! \uD83D\uDCB0` : `\u20b9${amt.toLocaleString()} withdrawn! \uD83D\uDCB8`, 'success');
        } catch(e) {
            this.notify('Transaction failed: ' + e.message, 'error');
        }
    },
    async confirmAddBalance() { return this.confirmWalletTx(); },

    openAddStockModal() {
        document.getElementById('add-stock-modal').classList.remove('hidden');
        document.getElementById('add-stock-symbol').value = '';
        document.getElementById('add-stock-name').value = '';
        if(window.lucide) window.lucide.createIcons();
    },
    async submitNewStock() {
        const symbol = document.getElementById('add-stock-symbol').value.trim().toUpperCase();
        const name = document.getElementById('add-stock-name').value.trim() || symbol;
        if (!symbol) return this.notify('Please enter a stock symbol', 'error');
        
        const btn = document.getElementById('btn-add-stock-submit');
        btn.innerText = 'Adding...'; btn.disabled = true;

        try {
            const res = await fetch('/api/stocks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol, name })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            // Add to frontend master list
            const isCrypto = /^[A-Z0-9]+-USD$/.test(symbol) || symbol.includes('BTC') || symbol.includes('ETH');
            if (isCrypto) {
                if (!AppState.masterCryptos.find(s => s.symbol === symbol)) {
                    AppState.masterCryptos.push({ symbol, name, ticker: symbol.replace('-USD', '') });
                }
            } else if (!AppState.masterStocks.find(s => s.symbol === symbol)) {
                AppState.masterStocks.push({ symbol, name });
            }
            
            this.notify(`${symbol} added successfully!`, 'success');
            document.getElementById('add-stock-modal').classList.add('hidden');
            
            // Refresh quotes and UI
            await DataService.refreshQuotes();
            if (AppState.activeView === 'stocks') this.renderStocksList();
        } catch (e) {
            this.notify('Failed to add stock: ' + e.message, 'error');
        } finally {
            btn.innerText = 'Add to Platform'; btn.disabled = false;
        }
    },

    bindEvents() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.onclick = () => {
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                this.renderView(item.dataset.view);
            };
        });
        document.addEventListener('click', (e) => {
            const wrap = document.querySelector('.price-lookup-wrap');
            if (wrap && !wrap.contains(e.target)) this.hidePriceLookup();
        });
    },

    hidePriceLookup() {
        const dd = document.getElementById('price-lookup-dropdown');
        if (dd) dd.classList.add('hidden');
    },

    onPriceLookup(val) {
        clearTimeout(this._priceLookupT);
        if (!val || val.trim().length < 1) {
            this.hidePriceLookup();
            return;
        }
        this._priceLookupT = setTimeout(() => this.lookupPriceNow(val.trim()), 450);
    },

    async lookupPriceNow(q) {
        const input = document.getElementById('global-price-search');
        const query = (q || input?.value || '').trim();
        const dd = document.getElementById('price-lookup-dropdown');
        if (!dd || !query) return;

        dd.classList.remove('hidden');
        dd.innerHTML = '<div class="price-lookup-loading">Live price fetch ho rahi hai…</div>';

        try {
            const data = await fetch('/api/market/lookup?q=' + encodeURIComponent(query)).then(r => r.json());
            const results = data.results || [];
            if (!results.length) {
                dd.innerHTML = `<div class="price-lookup-empty">"${query}" nahi mila. Try: RELIANCE, TCS, HDFC, ZOMATO.NS</div>`;
                return;
            }
            dd.innerHTML = results.map(r => {
                const sym = (r.symbol || '').replace('.NS', '').replace('-USD', '');
                const isC = r.assetType === 'crypto';
                const price = r.price > 0
                    ? (isC ? DataService.formatPrice(r.symbol, r.price) : '₹' + r.price.toLocaleString('en-IN', { maximumFractionDigits: 2 }))
                    : 'Loading…';
                const chg = r.changePercent || 0;
                const chgCls = chg >= 0 ? 'text-green' : 'text-red';
                const usd = r.priceUsd ? `<small style="color:var(--dim);display:block">$${r.priceUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}</small>` : '';
                const safeName = (r.name || sym).replace(/'/g, '');
                return `<div class="price-lookup-item" onclick="UI.pickLookupResult('${r.symbol}','${safeName}')">
                    <div class="price-lookup-item-main">
                        <b>${sym}</b>
                        <small>${r.name || r.symbol}</small>
                    </div>
                    <div class="price-lookup-item-price">
                        <span class="ltp">${price}</span>
                        ${usd}
                        <span class="chg ${chgCls}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</span>
                    </div>
                </div>`;
            }).join('');
            results.forEach(r => { if (r.symbol) AppState.liveQuotes[r.symbol] = r; });
        } catch (e) {
            dd.innerHTML = '<div class="price-lookup-empty">Network error. Server chalu hai?</div>';
        }
        if (window.lucide) window.lucide.createIcons();
    },

    pickLookupResult(symbol, name) {
        this.hidePriceLookup();
        const input = document.getElementById('global-price-search');
        if (input) input.value = symbol.replace('.NS', '').replace('-USD', '');
        this.openTerminal(symbol, name);
        this.notify(`${symbol} — live price loaded`, 'success');
    },

    notify(msg, type = 'success') {
        const area = document.getElementById('notification-area'); if (!area) return;
        
        let title = 'Notification';
        let iconName = 'bell';
        if (type === 'success') {
            title = 'Success';
            iconName = 'check-circle-2';
        } else if (type === 'error') {
            title = 'Error';
            iconName = 'alert-triangle';
        } else if (type === 'info') {
            title = 'Info';
            iconName = 'info';
        }
        
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.innerHTML = `
            <div class="toast-icon"><i data-lucide="${iconName}"></i></div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-msg">${msg}</div>
            </div>
            <div class="toast-progress"></div>
        `;
        area.appendChild(t);
        if (window.lucide) window.lucide.createIcons();
        
        setTimeout(() => {
            t.classList.add('toast-exit');
            setTimeout(() => t.remove(), 350);
        }, 4000);
    },

    notifyTrade(type, symbol, name, qty, price) {
        const area = document.getElementById('notification-area'); if (!area) return;
        
        const isCrypto = DataService.isCrypto(symbol);
        const cleanSymbol = symbol.replace('.NS', '').replace('-USD', '');
        const total = qty * price;
        const formattedTotal = total.toLocaleString('en-IN', { maximumFractionDigits: 2 });
        const formattedPrice = price.toLocaleString('en-IN', { maximumFractionDigits: 2 });
        const qtyStr = isCrypto ? qty.toFixed(4) : qty.toString();
        const assetInitial = cleanSymbol.slice(0, 2);
        
        const t = document.createElement('div');
        t.className = `toast-trade ${type}`;
        t.innerHTML = `
            <div class="toast-trade-header">
                <div class="toast-trade-title-wrap">
                    <div class="toast-trade-badge ${type}">${type} ORDER</div>
                    <div class="toast-trade-time">Filled · Just now</div>
                </div>
                <div class="toast-trade-icon">
                    <i data-lucide="${type === 'BUY' ? 'trending-up' : 'trending-down'}"></i>
                </div>
            </div>
            <div class="toast-trade-asset">
                <div class="toast-trade-logo">${assetInitial}</div>
                <div class="toast-trade-info">
                    <span class="toast-trade-sym">${cleanSymbol}</span>
                    <span class="toast-trade-name">${name || symbol}</span>
                </div>
            </div>
            <div class="toast-trade-receipt">
                <div class="toast-trade-row">
                    <span class="label">Quantity</span>
                    <span class="value">${qtyStr} ${isCrypto ? 'units' : 'shares'}</span>
                </div>
                <div class="toast-trade-row">
                    <span class="label">Execution Price</span>
                    <span class="value">₹${formattedPrice}</span>
                </div>
                <div class="toast-trade-divider"></div>
                <div class="toast-trade-row total">
                    <span class="label">Total Value</span>
                    <span class="value">₹${formattedTotal}</span>
                </div>
            </div>
            <div class="toast-progress"></div>
        `;
        area.appendChild(t);
        if (window.lucide) window.lucide.createIcons();
        
        setTimeout(() => {
            t.classList.add('toast-exit');
            setTimeout(() => t.remove(), 350);
        }, 5000);
    },

    toggleTheme() {
        AppState.theme = AppState.theme === 'dark' ? 'light' : 'dark';
        this.applyTheme();
        StateManager.save(AppState);
    },
    applyTheme() {
        if (AppState.theme === 'light') document.body.classList.add('light-mode');
        else document.body.classList.remove('light-mode');
        if (AppState.activeView === 'analysis') {
            this.runAnalysis();
        }
        if (window.lucide) window.lucide.createIcons();
    },

    async loop() {
        await DataService.refreshQuotes();
        // Reload holdings from server
        try { AppState.holdings = await fetch('/api/holdings').then(r=>r.json()); } catch(e){}
        try { const w = await fetch('/api/wallet').then(r=>r.json()); AppState.wallet=w; } catch(e){}
        const hc = document.getElementById('nav-holdings-count');
        if(hc) hc.innerText = AppState.holdings.length;
        this.renderWatchlist();
        if(AppState.activeView==='dashboard') { this.renderView('dashboard'); }
        if(AppState.activeView==='crypto') this.renderCryptoGrid();
        if(AppState.activeView==='companies' && AppState.stockMarket?.items?.length) {
            AppState.stockMarket.page = 1;
            this.loadCompaniesPage(true);
        }
    },

    async renderView(view) {
        const cont = document.getElementById('view-container');
        const title = document.getElementById('page-title');
        if (!cont || !title) return;
        AppState.activeView = view;
        // Sync nav active state
        document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.view === view));

        switch(view) {
            case 'dashboard':   await this.viewDashboard(cont, title); break;
            case 'screener':    await this.viewScreener(cont, title); break;
            case 'analysis':    await this.viewAnalysis(cont, title); break;
            case 'crypto':      await this.viewCrypto(cont, title); break;
            case 'companies':   await this.viewCompanies(cont, title); break;
            case 'stocks':      this.viewStocks(cont, title); break;
            case 'news':        await this.viewNews(cont, title); break;
            case 'portfolio':   await this.viewPortfolio(cont, title); break;
            case 'positions':   await this.viewPositions(cont, title); break;
            case 'history':     await this.viewHistory(cont, title); break;
            case 'wallet':      await this.viewWallet(cont, title); break;
            case 'leaderboard': await this.viewLeaderboard(cont, title); break;
            case 'challenge':   await this.viewChallenge(cont, title); break;
            case 'guide':       this.viewGuide(cont, title); break;
            case 'settings':    await this.viewSettings(cont, title); break;
        }
        if (window.lucide) window.lucide.createIcons();
    },

    // --- PERSISTENT WATCHLIST ---
    filterWatchlist(val) {
        const term = (val || '').toLowerCase().trim();
        const el = document.getElementById('watchlist-items');
        if (!el) return;
        if (term.length >= 2) {
            clearTimeout(this._wlLookupT);
            this._wlLookupT = setTimeout(async () => {
                try {
                    const data = await fetch('/api/market/lookup?q=' + encodeURIComponent(term)).then(r => r.json());
                    const results = (data.results || []).filter(r => r.price > 0);
                    if (results.length) {
                        results.forEach(r => { AppState.liveQuotes[r.symbol] = r; });
                        el.innerHTML = results.map(r => {
                            const sym = r.symbol;
                            const label = sym.replace('.NS', '').replace('-USD', '');
                            const chg = r.changePercent || 0;
                            return `<div class="watchlist-item" onclick="UI.openTerminal('${sym}','${(r.name || '').replace(/'/g, '')}')">
                                <div><b style="font-size:12px;">${label}</b><br><small style="color:var(--text-dim);font-size:10px;">${r.name || 'Live search'}</small></div>
                                <div style="text-align:right;">
                                    <b style="font-size:12px;">${DataService.formatPrice(sym, r.price)}</b><br>
                                    <span class="${chg >= 0 ? 'text-green' : 'text-red'}" style="font-size:10px;">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</span>
                                </div>
                            </div>`;
                        }).join('');
                        return;
                    }
                } catch (e) {}
                this.renderWatchlist(term);
            }, 400);
            return;
        }
        this.renderWatchlist(term);
    },

    renderWatchlist(filterTerm) {
        const el = document.getElementById('watchlist-items'); if(!el) return;
        let list = AppState.watchlist;
        if (filterTerm) {
            const t = filterTerm.toLowerCase();
            list = list.filter(sym => sym.toLowerCase().includes(t));
        }
        el.innerHTML = list.map(sym => {
            const q = AppState.liveQuotes[sym] || { price: 0, changePercent: 0 };
            const isC = DataService.isCrypto(sym);
            const label = sym.replace('.NS','').replace('-USD','');
            const exch = isC ? 'CRYPTO' : 'NSE';
            return `
                <div class="watchlist-item" onclick="UI.openTerminal('${sym}')">
                    <div>
                        <b style="font-size:12px;">${label}</b><br>
                        <small style="color:var(--text-dim); font-size:10px;">${isC ? '₿ ' : ''}${exch}</small>
                    </div>
                    <div style="text-align:right;">
                        <b style="font-size:12px;">${DataService.formatPrice(sym, q.price)}</b><br>
                        <span class="${q.changePercent>=0?'text-green':'text-red'}" style="font-size:10px;">${q.changePercent>=0?'+':''}${q.changePercent.toFixed(2)}%</span>
                    </div>
                </div>
            `;
        }).join('');
    },

    // --- PRO DASHBOARD ---
    async viewDashboard(c, t) {
        t.innerText = 'Market Dashboard';
        const bal = AppState.wallet?.balance || 0;
        const invested = AppState.holdings.filter(h=>h&&h.symbol).reduce((a,h)=>a+(h.qty*(h.cost||0)),0);
        const curVal = this.getHoldingsValue();
        const totalPnL = curVal - invested;
        const totalPnLPct = invested > 0 ? (totalPnL/invested*100) : 0;
        const netWorth = bal + curVal;

        c.innerHTML = `
        <!-- STAT CARDS -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;">
            <div class="glass-card" style="padding:22px;">
                <small class="kp-label">NET WORTH</small>
                <h2 style="font-size:22px;margin:8px 0 4px;font-weight:800;color:var(--text);">₹${netWorth.toLocaleString('en-IN',{maximumFractionDigits:0})}</h2>
                <span class="text-cyan" style="font-size:11px;">Portfolio + Cash</span>
            </div>
            <div class="glass-card" style="padding:22px;">
                <small class="kp-label">CASH BALANCE</small>
                <h2 style="font-size:22px;margin:8px 0 4px;font-weight:800;color:var(--text);">₹${bal.toLocaleString('en-IN',{maximumFractionDigits:0})}</h2>
                <span style="font-size:11px;color:var(--text-dim);">Available to Trade</span>
            </div>
            <div class="glass-card" style="padding:22px;">
                <small class="kp-label">TOTAL P&amp;L</small>
                <h2 style="font-size:22px;margin:8px 0 4px;font-weight:800;" class="${totalPnL>=0?'text-green':'text-red'}">${totalPnL>=0?'+':''}₹${Math.abs(totalPnL).toLocaleString('en-IN',{maximumFractionDigits:0})}</h2>
                <span class="${totalPnL>=0?'text-green':'text-red'}" style="font-size:11px;">${totalPnLPct>=0?'+':''}${totalPnLPct.toFixed(2)}% all time</span>
            </div>
            <div class="glass-card" style="padding:22px;">
                <small class="kp-label">HOLDINGS</small>
                <h2 style="font-size:22px;margin:8px 0 4px;font-weight:800;color:var(--text);">${AppState.holdings.filter(h=>h&&h.symbol).length}</h2>
                <span style="font-size:11px;color:var(--text-dim);">Active Positions</span>
            </div>
        </div>

        <!-- REAL CHARTS -->
        <div class="charts-dashboard-row">
            <div class="pnl-trend-card">
                <div class="pnl-trend-header">
                    <div class="pnl-trend-title">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0EA5E9" stroke-width="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                        <span>Portfolio Performance</span>
                    </div>
                    <div class="chart-legend-pills">
                        <span class="chart-legend-pill chart-legend-pill--line">Net Worth</span>
                        <span class="chart-legend-pill chart-legend-pill--bar">P&amp;L</span>
                    </div>
                </div>
                <div class="pnl-chart-wrap"><canvas id="pnl-trend-canvas"></canvas></div>
            </div>
            <div class="chart-card">
                <div class="chart-card-header">
                    <h3>Holdings P&amp;L</h3>
                    <span class="pnl-trend-badge">LIVE</span>
                </div>
                <div class="chart-panel"><canvas id="dash-holdings-bar"></canvas></div>
            </div>
        </div>
        <div class="glass-card flow-teaser" onclick="UI.renderView('analysis')" style="padding:18px 22px;cursor:pointer;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;">
            <div><small class="kp-label">INSTITUTIONAL FLOW</small><h3 style="font-size:14px;margin:6px 0 0;font-weight:700;">FII / DII bar charts &amp; AI score</h3></div>
            <span class="text-cyan" style="font-size:12px;font-weight:700;">Open →</span>
        </div>

        <div id="dash-crypto-row" class="crypto-dash-row" style="margin-bottom:20px;">Loading crypto…</div>

        <div class="chart-card" style="margin-bottom:20px;">
            <h3 style="margin-bottom:16px;">Top Movers Today</h3>
            <div id="top-movers" style="display:grid;grid-template-columns:repeat(6,1fr);gap:12px;">Loading...</div>
        </div>`;

        this.renderDashboardCharts();
        this.renderTopMovers();
        this.renderDashboardCrypto();
    },

    async renderDashboardCharts() {
        let trend = [];
        try {
            trend = await fetch('/api/portfolio/trend').then(r => r.json());
        } catch (e) {}
        if (!Array.isArray(trend) || !trend.length) {
            const bal = AppState.wallet?.balance || 0;
            const cur = this.getHoldingsValue();
            trend = [{ date: new Date().toISOString().split('T')[0], net_worth: bal + cur, pnl: cur - AppState.holdings.reduce((a, h) => a + h.qty * h.cost, 0) }];
        }
        ChartService.renderPortfolioCombo('pnl-trend-canvas', trend);
        const holdings = AppState.holdings.filter(h => h && h.symbol);
        if (holdings.length) {
            ChartService.renderHoldingsBar('dash-holdings-bar', holdings);
        } else {
            const el = document.getElementById('dash-holdings-bar');
            if (el?.parentElement) el.parentElement.innerHTML = '<div class="chart-empty-msg">Buy stocks or crypto to see P&amp;L chart</div>';
        }
    },

    async renderDashboardCrypto() {
        const el = document.getElementById('dash-crypto-row'); if(!el) return;
        try {
            const ov = await fetch('/api/crypto/hub').then(r=>r.json());
            if (ov.quotes) ov.quotes.forEach(q => { if (q?.symbol) AppState.liveQuotes[q.symbol] = q; });
            const btc = ov.btc; const eth = ov.eth; const g = ov.global || {};
            el.innerHTML = `
            <div class="crypto-global-bar">
                <span>Market Cap <b>$${((g.totalMarketCapUsd||0)/1e12).toFixed(2)}T</b></span>
                <span>BTC Dominance <b>${(g.btcDominance||0).toFixed(1)}%</b></span>
                <span>24h Volume <b>$${((g.totalVolumeUsd||0)/1e9).toFixed(1)}B</b></span>
                <button class="btn-secondary btn-sm" onclick="UI.renderView('crypto')">Open Crypto Hub →</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:14px;">
                ${[btc, eth].filter(Boolean).map(q => `
                <div class="glass-card crypto-card" onclick="UI.openTerminal('${q.symbol}','${q.name}')" style="padding:20px;cursor:pointer;border-color:rgba(245,158,11,0.25);">
                    <small class="kp-label">${q.name}</small>
                    <h3 style="font-size:20px;margin:10px 0 4px;font-weight:800;">${DataService.formatPrice(q.symbol, q.price)}</h3>
                    <span style="font-size:11px;color:var(--dim)">$${(q.priceUsd||0).toLocaleString('en-US',{maximumFractionDigits:0})}</span>
                    <div class="${q.changePercent>=0?'text-green':'text-red'}" style="font-size:13px;font-weight:700;margin-top:8px;">${q.changePercent>=0?'+':''}${q.changePercent.toFixed(2)}%</div>
                </div>`).join('')}
                <div class="glass-card crypto-card" onclick="UI.renderView('crypto')" style="padding:20px;cursor:pointer;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;">
                    <span style="font-size:28px;margin-bottom:8px;">₿</span>
                    <b>25+ Coins</b>
                    <span class="text-cyan" style="font-size:12px;margin-top:8px;">Trade Bitcoin freely →</span>
                </div>
            </div>`;
        } catch(e) {
            el.innerHTML = '<p style="color:var(--dim);font-size:13px;">Crypto data loading… <a href="#" onclick="UI.renderView(\'crypto\');return false;" class="text-cyan">Open Crypto Hub</a></p>';
        }
    },

    renderTopMovers() {
        const el = document.getElementById('top-movers'); if(!el) return;
        const quotes = Object.values(AppState.liveQuotes).filter(q=>q&&q.price>0);
        if(!quotes.length) { el.innerHTML = '<p style="color:var(--text-dim);padding:10px;">Loading market data...</p>'; return; }
        const sorted = [...quotes].sort((a,b)=>Math.abs(b.changePercent)-Math.abs(a.changePercent)).slice(0,6);
        el.innerHTML = sorted.map(q=>{
            const sym = q.symbol.replace('.NS','');
            const isUp = q.changePercent >= 0;
            return `<div class="glass-card" onclick="UI.openTerminal('${q.symbol}','${q.name||q.symbol}')" style="padding:14px;cursor:pointer;border-color:rgba(${isUp?'16,185,129':'239,68,68'},0.3);box-shadow:inset 0 0 12px rgba(${isUp?'16,185,129':'239,68,68'},0.05);" onmouseover="this.style.boxShadow='0 0 20px rgba(${isUp?'16,185,129':'239,68,68'},0.2)'; this.style.transform='translateY(-3px) scale(1.02)';" onmouseout="this.style.boxShadow='inset 0 0 12px rgba(${isUp?'16,185,129':'239,68,68'},0.05)'; this.style.transform='';">
                <div style="font-size:12px;font-weight:800;">${sym}</div>
                <div style="font-size:16px;font-weight:800;margin:8px 0;">₹${q.price.toFixed(2)}</div>
                <div style="font-size:11px;font-weight:700;" class="${isUp?'text-green':'text-red'}">${isUp?'+':''}${q.changePercent.toFixed(2)}%</div>
            </div>`;
        }).join('');
    },


    // --- PRO PORTFOLIO ---
    viewPortfolio(c, t) {
        t.innerText = "Asset Intelligence Dashboard";
        const inv = AppState.holdings.reduce((a,b)=>a+(b.qty*b.cost), 0);
        const validHoldings = AppState.holdings.filter(h=>h&&h.symbol);
        const cur = validHoldings.reduce((a,h)=>a+(h.qty*(AppState.liveQuotes[h.symbol]?.price||h.cost||0)),0);
        c.innerHTML = `
            <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:20px;margin-bottom:24px;">
                <div class="chart-card">
                    <div class="chart-card-header"><h3>Holdings P&amp;L (Live)</h3></div>
                    <div class="chart-panel"><canvas id="portfolio-pnl-bar"></canvas></div>
                </div>
                <div class="chart-card">
                    <h3 style="margin-bottom:12px;">Allocation</h3>
                    <div class="chart-panel"><canvas id="sector-chart"></canvas></div>
                </div>
            </div>
            <div style="display:grid; grid-template-columns: 2fr 1fr; gap:24px; margin-bottom:24px;">
                <div class="chart-card">
                    <h3>Portfolio Heatmap <small style="font-size:11px;color:var(--text-dim);font-weight:400;">(Performance Today)</small></h3>
                    <div class="heatmap-grid">${validHoldings.length ? validHoldings.map(h => {
                        const q = AppState.liveQuotes[h.symbol] || { changePercent: 0 };
                        const pct = q.changePercent||0;
                        const color = pct>=0 ? `rgba(16,185,129,${Math.min(0.15+pct/4,0.8)})` : `rgba(239,68,68,${Math.min(0.15+Math.abs(pct)/4,0.8)})`;
                        const sym = h.symbol.replace('.NS','');
                        return `<div class="heatmap-box" style="background:${color};border:1px solid ${pct>=0?'rgba(16,185,129,0.3)':'rgba(239,68,68,0.3)'};" onclick="UI.openTerminal('${h.symbol}')">
                            <b style="font-size:11px;">${sym}</b><br>
                            <span style="font-size:12px;">${pct>=0?'+':''}${pct.toFixed(2)}%</span>
                        </div>`;
                    }).join('') : '<p style="color:var(--text-dim);padding:20px;">No holdings yet. Buy some stocks!</p>'}
                    </div>
                </div>
            </div>
            <div class="chart-card">
                <h3>Holdings Breakdown</h3>
                <table style="width:100%;border-collapse:collapse;">
                    <thead><tr style="color:var(--text-dim);font-size:11px;letter-spacing:0.5px;">
                        <th style="padding:12px 16px;text-align:left;">STOCK</th>
                        <th style="padding:12px 16px;text-align:right;">QTY</th>
                        <th style="padding:12px 16px;text-align:right;">AVG COST</th>
                        <th style="padding:12px 16px;text-align:right;">LTP</th>
                        <th style="padding:12px 16px;text-align:right;">CURR VALUE</th>
                        <th style="padding:12px 16px;text-align:right;">P&amp;L</th>
                        <th style="padding:12px 16px;text-align:right;">%</th>
                        <th style="padding:12px 16px;text-align:center;">ACTION</th>
                    </tr></thead>
                    <tbody>${validHoldings.map(h=>{
                        const ltp = AppState.liveQuotes[h.symbol]?.price||h.cost||0;
                        const pnl = (ltp-h.cost)*h.qty;
                        const pnlPct = h.cost>0?((ltp-h.cost)/h.cost*100):0;
                        const sym = h.symbol.replace('.NS','').replace('-USD','');
                        const qtyFmt = DataService.isCrypto(h.symbol) ? (+h.qty).toFixed(4) : h.qty;
                        return `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);transition:0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background=''">
                            <td style="padding:16px;"><b>${sym}</b>${DataService.isCrypto(h.symbol)?' <span style="font-size:9px;color:#F59E0B">₿</span>':''}<br><small style="color:var(--text-dim);font-size:10px;">${h.name||h.symbol}</small></td>
                            <td style="padding:16px;text-align:right;font-weight:700;">${qtyFmt}</td>
                            <td style="padding:16px;text-align:right;">₹${Number(h.cost).toLocaleString('en-IN',{maximumFractionDigits:2})}</td>
                            <td style="padding:16px;text-align:right;font-weight:700;">₹${ltp.toLocaleString('en-IN',{maximumFractionDigits:2})}</td>
                            <td style="padding:16px;text-align:right;">₹${(h.qty*ltp).toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                            <td style="padding:16px;text-align:right;" class="${pnl>=0?'text-green':'text-red'}"><b>${pnl>=0?'+':''}₹${Math.abs(pnl).toLocaleString('en-IN',{maximumFractionDigits:0})}</b></td>
                            <td style="padding:16px;text-align:right;" class="${pnlPct>=0?'text-green':'text-red'}">${pnlPct>=0?'+':''}${pnlPct.toFixed(2)}%</td>
                            <td style="padding:16px;text-align:center;"><button style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:var(--red);padding:6px 14px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;" onclick="UI.openTerminal('${h.symbol}')">SELL</button></td>
                        </tr>`;
                    }).join('')}</tbody>
                </table>
            </div>`;
        if (validHoldings.length) {
            ChartService.renderHoldingsBar('portfolio-pnl-bar', validHoldings);
            this.renderSectorChart();
        }
    },

    renderSectorChart() {
        const holdings = AppState.holdings.filter(h => h && h.symbol);
        const sectors = {};
        holdings.forEach(h => {
            const isC = DataService.isCrypto(h.symbol);
            const s = isC ? 'Crypto' : (h.sector || 'Others');
            sectors[s] = (sectors[s] || 0) + (h.qty * (AppState.liveQuotes[h.symbol]?.price || h.cost || 0));
        });
        if (!Object.keys(sectors).length) return;
        ChartService.renderDoughnut('sector-chart', Object.keys(sectors), Object.values(sectors));
    },

    // --- UTILS ---
    getHoldingsValue() { return AppState.holdings.filter(h=>h&&h.symbol).reduce((acc,h)=>acc+(h.qty*(AppState.liveQuotes[h.symbol]?.price||h.cost||0)),0); },

    async viewCompanies(c, t) {
        t.innerText = 'Stock Market — NSE Companies';
        AppState.stockMarket = { sector: 'all', page: 1, sort: 'change', search: '', view: 'table', items: [], total: 0, hasMore: false, loading: false };
        c.innerHTML = `
        <div id="stock-hub-hero" class="stock-market-hero">Loading market…</div>
        <div id="nifty-strip" class="nifty-strip"></div>
        <div class="stock-toolbar">
            <div class="search-card" style="flex:1;min-width:220px;margin:0;">
                <i data-lucide="search"></i>
                <input type="text" id="company-search" placeholder="Search company or symbol (RELIANCE, TCS…)" oninput="UI.onCompanySearch(this.value)">
            </div>
            <select id="stock-sort" class="stock-sort-select" onchange="UI.onStockSort(this.value)">
                <option value="change">Top movers</option>
                <option value="name">Name A–Z</option>
                <option value="price">Price high–low</option>
                <option value="volume">Volume</option>
                <option value="symbol">Symbol</option>
            </select>
            <select id="stock-view-mode" class="stock-view-toggle" onchange="UI.setStockView(this.value)">
                <option value="table">Table view</option>
                <option value="grid">Grid view</option>
            </select>
        </div>
        <div id="sector-chips" class="sector-chips"></div>
        <div id="company-search-hint"></div>
        <div id="companies-list"><div class="analysis-loading"><div class="analysis-spinner"></div><p>Loading live prices…</p></div></div>
        <div id="load-more-wrap" class="load-more-wrap" style="display:none">
            <button class="btn-primary" onclick="UI.loadMoreCompanies()">Load more companies</button>
        </div>`;
        if (window.lucide) window.lucide.createIcons();
        await this.loadStockHub();
        await this.loadCompaniesPage(true);
    },

    async loadStockHub() {
        try {
            const hub = await fetch('/api/stocks/hub').then(r => r.json());
            const hero = document.getElementById('stock-hub-hero');
            if (hero) {
                const gainers = (hub.nifty50 || []).filter(s => (s.changePercent || 0) > 0).length;
                hero.innerHTML = `
                    <div>
                        <small class="kp-label">NSE EQUITIES</small>
                        <h2>${hub.totalCompanies || 600}+ Companies</h2>
                        <span style="color:var(--dim);font-size:13px;">Live prices via Yahoo Finance · Trade in virtual INR wallet</span>
                    </div>
                    <div class="stock-market-stats">
                        <div><b>${hub.totalCompanies || 0}</b><small>LISTED</small></div>
                        <div><b>${hub.sectors?.length || 0}</b><small>SECTORS</small></div>
                        <div><b class="text-green">${gainers}</b><small>NIFTY UP</small></div>
                    </div>`;
            }
            const strip = document.getElementById('nifty-strip');
            if (strip && hub.nifty50) {
                strip.innerHTML = hub.nifty50.map(s => {
                    const sym = s.symbol.replace('.NS', '');
                    const chg = s.changePercent || 0;
                    AppState.liveQuotes[s.symbol] = { ...s, assetType: 'stock' };
                    return `<div class="nifty-chip" onclick="UI.openTerminal('${s.symbol}','${(s.name || '').replace(/'/g, '')}')">
                        <b>${sym}</b>
                        <div class="price">${s.price > 0 ? '₹' + s.price.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'}</div>
                        <span class="${chg >= 0 ? 'text-green' : 'text-red'}" style="font-size:11px;font-weight:700">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</span>
                    </div>`;
                }).join('');
            }
            const chips = document.getElementById('sector-chips');
            if (chips && hub.sectors) {
                chips.innerHTML = `<span class="sector-chip active" data-sector="all" onclick="UI.filterSector('all',this)">All (${hub.totalCompanies})</span>` +
                    hub.sectors.slice(0, 12).map(sec =>
                        `<span class="sector-chip" data-sector="${sec.name}" onclick="UI.filterSector('${sec.name}',this)">${sec.name} (${sec.count})</span>`
                    ).join('');
            }
        } catch (e) {
            const hero = document.getElementById('stock-hub-hero');
            if (hero) hero.innerHTML = '<p class="text-red">Could not load market data. Restart server.</p>';
        }
    },

    filterSector(sector, el) {
        AppState.stockMarket.sector = sector;
        AppState.stockMarket.page = 1;
        document.querySelectorAll('.sector-chip').forEach(c => c.classList.toggle('active', c === el));
        this.loadCompaniesPage(true);
    },

    onStockSort(val) {
        AppState.stockMarket.sort = val;
        AppState.stockMarket.page = 1;
        this.loadCompaniesPage(true);
    },

    setStockView(mode) {
        AppState.stockMarket.view = mode;
        this.renderCompaniesList();
    },

    onCompanySearch(val) {
        AppState.stockMarket.search = val.trim();
        AppState.stockMarket.page = 1;
        clearTimeout(this._companySearchT);
        this._companySearchT = setTimeout(() => this.loadCompaniesPage(true), 500);
    },

    async loadCompaniesPage(reset) {
        if (AppState.stockMarket.loading) return;
        AppState.stockMarket.loading = true;
        const sm = AppState.stockMarket;
        if (reset) sm.items = [];
        const params = new URLSearchParams({
            page: sm.page,
            limit: 50,
            sector: sm.sector,
            sort: sm.sort
        });
        if (sm.search) params.set('q', sm.search);
        try {
            if (sm.search.length >= 2) {
                const live = await fetch(`/api/market/search?q=${encodeURIComponent(sm.search)}`).then(r => r.json());
                const stockHits = (live || []).filter(x => x.assetType !== 'crypto' && (x.symbol || '').includes('.NS'));
                if (stockHits.length) {
                    const syms = stockHits.slice(0, 30).map(x => x.symbol).join(',');
                    const quotes = await fetch(`/api/market/quote?symbols=${encodeURIComponent(syms)}`).then(r => r.json());
                    quotes.forEach(q => { if (q?.symbol) AppState.liveQuotes[q.symbol] = q; });
                    sm.items = stockHits.slice(0, 30).map(h => {
                        const q = AppState.liveQuotes[h.symbol] || {};
                        return { symbol: h.symbol, name: h.name || q.name || h.symbol, sector: 'Search', ...q };
                    });
                    sm.hasMore = false;
                    sm.total = sm.items.length;
                    const hint = document.getElementById('company-search-hint');
                    if (hint) hint.innerHTML = `<div class="search-results-hint">Live search: ${sm.items.length} results for "${sm.search}"</div>`;
                    this.renderCompaniesList();
                    document.getElementById('load-more-wrap').style.display = 'none';
                    AppState.stockMarket.loading = false;
                    return;
                }
            }
            document.getElementById('company-search-hint').innerHTML = '';
            const data = await fetch(`/api/stocks/page?${params}`).then(r => r.json());
            data.items.forEach(item => {
                if (item.symbol) AppState.liveQuotes[item.symbol] = item;
            });
            if (reset) sm.items = data.items;
            else sm.items = [...sm.items, ...data.items];
            sm.total = data.total;
            sm.hasMore = data.hasMore;
            this.renderCompaniesList();
            const lm = document.getElementById('load-more-wrap');
            if (lm) lm.style.display = sm.hasMore ? 'block' : 'none';
        } catch (e) {
            document.getElementById('companies-list').innerHTML = '<p class="text-red" style="padding:20px">Failed to load companies.</p>';
        }
        AppState.stockMarket.loading = false;
    },

    loadMoreCompanies() {
        AppState.stockMarket.page += 1;
        this.loadCompaniesPage(false);
    },

    renderCompanyRow(s) {
        const sym = s.symbol.replace('.NS', '');
        const initials = sym.slice(0, 2);
        const price = s.price || 0;
        const chg = s.changePercent || 0;
        const chgCls = chg >= 0 ? 'text-green' : 'text-red';
        const vol = s.volume ? (s.volume / 1e6).toFixed(2) + 'M' : '—';
        const mcap = s.marketCap ? '₹' + (s.marketCap / 1e7).toFixed(0) + ' Cr' : '—';
        const safeName = (s.name || sym).replace(/'/g, '');
        return { sym, initials, price, chg, chgCls, vol, mcap, safeName };
    },

    renderCompaniesList() {
        const el = document.getElementById('companies-list');
        if (!el) return;
        const items = AppState.stockMarket.items;
        if (!items.length) {
            el.innerHTML = '<div class="chart-empty-msg">No companies found. Try another sector or search.</div>';
            return;
        }
        if (AppState.stockMarket.view === 'grid') {
            el.innerHTML = `<div class="stock-grid-market">${items.map(s => {
                const r = this.renderCompanyRow(s);
                return `<div class="stock-card-co" onclick="UI.openTerminal('${s.symbol}','${r.safeName}')">
                    <div class="flex-between"><span class="sym">${r.sym}</span><span class="${r.chgCls}" style="font-size:11px;font-weight:700">${r.chg >= 0 ? '+' : ''}${r.chg.toFixed(2)}%</span></div>
                    <div class="ltp">${r.price > 0 ? '₹' + r.price.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}</div>
                    <small style="color:var(--dim);font-size:11px">${r.safeName}</small>
                    <small style="display:block;margin-top:6px;color:var(--dim);font-size:10px">${s.sector || ''}</small>
                    <button class="btn-primary" style="margin-top:12px;width:100%;font-size:11px;padding:8px" onclick="event.stopPropagation();UI.openTerminal('${s.symbol}','${r.safeName}')">Trade</button>
                </div>`;
            }).join('')}</div>`;
            return;
        }
        el.innerHTML = `
        <div class="stock-table-wrap">
            <table class="stock-table">
                <thead><tr>
                    <th>COMPANY</th>
                    <th>SECTOR</th>
                    <th style="text-align:right">LTP</th>
                    <th style="text-align:right">CHANGE</th>
                    <th style="text-align:right">VOLUME</th>
                    <th style="text-align:right">MKT CAP</th>
                    <th></th>
                </tr></thead>
                <tbody>${items.map(s => {
                    const r = this.renderCompanyRow(s);
                    return `<tr onclick="UI.openTerminal('${s.symbol}','${r.safeName}')">
                        <td><div class="stock-co"><div class="stock-logo">${r.initials}</div><div class="stock-co-name"><b>${r.sym}</b><small>${r.safeName}</small></div></div></td>
                        <td><span style="font-size:11px;color:var(--dim)">${s.sector || '—'}</span></td>
                        <td style="text-align:right;font-weight:800">${r.price > 0 ? '₹' + r.price.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}</td>
                        <td style="text-align:right" class="${r.chgCls}"><b>${r.chg >= 0 ? '+' : ''}${r.chg.toFixed(2)}%</b></td>
                        <td style="text-align:right;color:var(--dim);font-size:11px">${r.vol}</td>
                        <td style="text-align:right;color:var(--dim);font-size:11px">${r.mcap}</td>
                        <td style="text-align:right"><button class="btn-primary" style="font-size:10px;padding:6px 12px" onclick="event.stopPropagation();UI.openTerminal('${s.symbol}','${r.safeName}')">Trade</button></td>
                    </tr>`;
                }).join('')}</tbody>
            </table>
        </div>
        <p style="text-align:center;margin-top:12px;font-size:11px;color:var(--dim)">Showing ${items.length} of ${AppState.stockMarket.total} companies · Live NSE prices</p>`;
    },

    viewStocks(c, t) {
        t.innerText = 'Quick Trade';
        c.innerHTML = `
            <div class="search-card">
                <i data-lucide="search"></i>
                <input type="text" id="hs" placeholder="Search 600+ NSE companies…" oninput="UI.fh(this.value)">
            </div>
            <p style="font-size:12px;color:var(--dim);margin-bottom:12px">Tip: Open <a href="#" onclick="UI.renderView('companies');return false" class="text-cyan">Stock Market</a> for full list with filters &amp; live table.</p>
            <div class="hub-grid" id="hg"></div>`;
        this.renderStocksList();
        if(window.lucide) window.lucide.createIcons();
    },
    fh(v) { AppState.hubSearch = v.toLowerCase(); this.renderStocksList(); clearTimeout(this._st); this._st = setTimeout(() => DataService.refreshQuotes().then(() => this.renderStocksList()), 800); },
    renderStocksList() {
        const g = document.getElementById('hg'); if(!g) return;
        const f = AppState.masterStocks.filter(s => s.symbol.toLowerCase().includes(AppState.hubSearch)||s.name?.toLowerCase().includes(AppState.hubSearch)).slice(0,60);
        g.innerHTML = f.map(s => {
            const q = AppState.liveQuotes[s.symbol] || {price:0,changePercent:0};
            const chgCls = q.changePercent>=0?'text-green':'text-red';
            const chgSign = q.changePercent>=0?'+':'';
            const sym = s.symbol.replace('.NS','');
            return `<div class="hub-card stock-card-co" onclick="UI.openTerminal('${s.symbol}','${(s.name||s.symbol).replace(/'/g,'')}')">
                <div class="flex-between"><span class="sym">${sym}</span><span class="${chgCls} chg" style="font-size:11px;font-weight:700">${q.price>0?chgSign+q.changePercent.toFixed(2)+'%':'…'}</span></div>
                <div class="price" style="font-size:18px;font-weight:800;margin:8px 0">${q.price>0?'\u20b9'+q.price.toLocaleString('en-IN',{maximumFractionDigits:2}):'Loading…'}</div>
                <div style="font-size:11px;color:var(--dim)">${s.name||''}</div>
                <small style="color:var(--dim);font-size:10px">${s.sector||''}</small>
            </div>`;
        }).join('');
        if (f.length) {
            const chunk = f.map(s => s.symbol).join(',');
            const needsFetch = f.some(s => !AppState.liveQuotes[s.symbol] || AppState.liveQuotes[s.symbol].price === 0);
            if (needsFetch) {
                fetch(`/api/market/quote?symbols=${encodeURIComponent(chunk)}`).then(r => r.json()).then(quotes => {
                    if (Array.isArray(quotes)) quotes.forEach(q => { if (q?.symbol) AppState.liveQuotes[q.symbol] = q; });
                    if (AppState.activeView === 'stocks') this.renderStocksList();
                }).catch(() => {});
            }
        }
    },

    async openTerminal(sym, name) {
        await DataService.ensureQuote(sym);
        const q = AppState.liveQuotes[sym] || {price:0,open:0,high:0,low:0,prevClose:0};
        const isCrypto = DataService.isCrypto(sym);
        AppState.currentTrade = { symbol: sym, name: name||sym, price: q.price||0, isCrypto };
        const fmt = v => v>0 ? DataService.formatPrice(sym, v) : '—';
        const qtyInput = document.getElementById('tm-qty');
        if (qtyInput) {
            qtyInput.step = isCrypto ? '0.0001' : '1';
            qtyInput.min = isCrypto ? '0.00001' : '1';
            qtyInput.value = isCrypto ? '0.01' : '1';
        }
        document.getElementById('tm-symbol').innerText = sym.replace('-USD','').replace('.NS','');
        document.getElementById('tm-name').innerText = (name||sym) + (isCrypto ? ' · Crypto' : '');
        document.getElementById('tm-price').innerText = fmt(q.price);
        if (q.priceUsd) document.getElementById('tm-price').innerHTML = fmt(q.price) + ` <small style="font-size:12px;color:var(--dim)">$${q.priceUsd.toLocaleString('en-US',{maximumFractionDigits:2})}</small>`;
        document.getElementById('tm-balance').innerText = '\u20b9'+(AppState.wallet?.balance||0).toLocaleString('en-IN',{maximumFractionDigits:0});
        document.getElementById('tm-open').innerText = fmt(q.open);
        document.getElementById('tm-high').innerText = fmt(q.high);
        document.getElementById('tm-low').innerText = fmt(q.low);
        document.getElementById('tm-prev').innerText = fmt(q.prevClose);
        this.updateTradeTotal();
        document.getElementById('trade-modal').classList.remove('hidden');
        if(window.lucide) window.lucide.createIcons();

        // Load technical chart inside the trading terminal
        setTimeout(() => {
            const terminalWrap = document.querySelector('.trade-chart-wrap');
            if (terminalWrap) {
                terminalWrap.querySelectorAll('.btn-period').forEach(b => {
                    const isActive = b.innerText === '1M';
                    b.classList.toggle('active', isActive);
                    b.style.background = isActive ? 'rgba(255,255,255,0.04)' : 'transparent';
                    b.style.color = isActive ? 'var(--text)' : 'var(--dim)';
                });
            }
            ChartService.renderCryptoCandles('terminal-chart', sym, '1M');
        }, 100);
    },
    closeTradeModal() { 
        ChartService.destroyLw();
        document.getElementById('trade-modal').classList.add('hidden'); 
    },
    changeTerminalPeriod(period, btn) {
        if (!AppState.currentTrade || !AppState.currentTrade.symbol) return;
        const sym = AppState.currentTrade.symbol;
        
        // Update active class on buttons
        const parent = btn.parentElement;
        if (parent) {
            parent.querySelectorAll('.btn-period').forEach(b => {
                b.classList.remove('active');
                b.style.background = 'transparent';
                b.style.color = 'var(--dim)';
            });
            btn.classList.add('active');
            btn.style.background = 'rgba(255,255,255,0.04)';
            btn.style.color = 'var(--text)';
        }
        
        // Render technical chart for the selected period
        ChartService.renderCryptoCandles('terminal-chart', sym, period);
    },
    changeQty(d) {
        const i = document.getElementById('tm-qty');
        const isCrypto = AppState.currentTrade.isCrypto;
        const step = isCrypto ? 0.001 : 1;
        const min = isCrypto ? 0.00001 : 1;
        let v = parseFloat(i.value) || min;
        v = Math.max(min, v + d * step);
        i.value = isCrypto ? v.toFixed(4) : Math.round(v);
        this.updateTradeTotal();
    },
    updateTradeTotal() {
        const q = parseFloat(document.getElementById('tm-qty').value) || 0;
        const total = q * AppState.currentTrade.price;
        document.getElementById('tm-total').innerText = '\u20b9' + total.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    },
    async executeTrade(type) {
        const qty = parseFloat(document.getElementById('tm-qty').value);
        if(!qty||qty<=0) return this.notify('Enter valid quantity','error');
        const {symbol,name,price} = AppState.currentTrade;
        if(!price||price<=0) return this.notify('Price not available','error');
        const modal = document.getElementById('trade-modal');
        const btn = modal ? modal.querySelector(type === 'BUY' ? '.btn-buy' : '.btn-sell') : null;
        if(btn) { btn.disabled=true; btn.innerText='Processing...'; }
        try {
            const res = await fetch('/api/trade/execute',{
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({symbol,name,qty,type,price})
            });
            const data = await res.json();
            if(data.success) {
                this.notifyTrade(type, symbol, name, qty, price);
                // Refresh wallet & holdings from server
                const w = await fetch('/api/wallet').then(r=>r.json());
                AppState.wallet = w;
                document.getElementById('header-balance').innerText='\u20b9'+w.balance.toLocaleString('en-IN',{maximumFractionDigits:0});
                document.getElementById('tm-balance').innerText='\u20b9'+w.balance.toLocaleString('en-IN',{maximumFractionDigits:0});
                AppState.holdings = await fetch('/api/holdings').then(r=>r.json());
                const hc=document.getElementById('nav-holdings-count'); if(hc) hc.innerText=AppState.holdings.length;
                this.closeTradeModal();
                await DataService.refreshQuotes();
                this.renderWatchlist();
                if (AppState.activeView === 'dashboard') this.renderDashboardCharts();
                if(['portfolio','history','wallet','crypto','dashboard'].includes(AppState.activeView)) this.renderView(AppState.activeView);
            } else {
                this.notify(data.error||'Trade failed','error');
            }
        } catch(e) { this.notify('Server error: '+e.message,'error'); }
        finally { if(btn){btn.disabled=false; btn.innerHTML=type==='BUY'?'<i data-lucide="trending-up"></i>BUY':'<i data-lucide="trending-down"></i>SELL'; if(window.lucide)window.lucide.createIcons();} }
    },
    async viewPositions(c, t) {
        t.innerText = 'Positions (Intraday)';
        let positions = [];
        try { positions = await fetch('/api/positions').then(r=>r.json()); } catch(e){}
        if (!positions.length) { c.innerHTML = `<div class="card" style="text-align:center;padding:60px"><p style="color:var(--dim)">No active intraday positions</p></div>`; return; }
        c.innerHTML = `<div class="card"><h3 style="margin-bottom:16px">Active Positions</h3><table class="data-table"><thead><tr><th>SYMBOL</th><th>NAME</th><th>QTY</th><th>AVG PRICE</th><th>LTP</th><th>P&L</th></tr></thead><tbody>${
            positions.map(p => {
                const ltp = AppState.liveQuotes[p.symbol]?.price || p.ltp || p.avgPrice;
                const pnl = (ltp - p.avgPrice) * p.qty;
                return `<tr><td><b>${p.symbol}</b></td><td>${p.name||'—'}</td><td>${p.qty}</td><td>₹${(+p.avgPrice).toFixed(2)}</td><td>₹${ltp.toFixed(2)}</td><td class="${pnl>=0?'text-green':'text-red'}">${pnl>=0?'+':''}₹${pnl.toFixed(2)}</td></tr>`;
            }).join('')
        }</tbody></table></div>`;
    },

    async viewHistory(c, t) {
        t.innerText = 'Order History';
        let history = [];
        try { history = await fetch('/api/history').then(r=>r.json()); } catch(e){}
        c.innerHTML = `<div class="card"><div class="flex-between" style="margin-bottom:16px"><h3>Order Book (${history.length} orders)</h3><button class="btn-danger" onclick="UI.clearHistory()"><i data-lucide="trash-2"></i>Clear All</button></div><table class="data-table"><thead><tr><th>TYPE</th><th>SYMBOL</th><th>QTY</th><th>PRICE</th><th>TOTAL</th><th>DATE</th></tr></thead><tbody>${
            history.length ? history.map(h => `<tr><td><span class="badge ${h.type==='BUY'?'badge-green':h.type==='SELL'?'badge-red':'badge-purple'}">${h.type}</span></td><td><b>${h.symbol||'—'}</b><br><small style="color:var(--dim)">${h.name}</small></td><td>${h.qty}</td><td>₹${(+h.price).toFixed(2)}</td><td>₹${(+h.total).toLocaleString()}</td><td style="color:var(--dim);font-size:11px">${new Date(h.date).toLocaleString('en-IN')}</td></tr>`).join('')
            : '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--dim)">No orders yet</td></tr>'
        }</tbody></table></div>`;
        if(window.lucide) window.lucide.createIcons();
    },
    async clearHistory() {
        try { await fetch('/api/history',{method:'DELETE'}); this.notify('History cleared','info'); this.renderView('history'); } catch(e){}
    },

    async viewWallet(c, t) {
        t.innerText = 'Virtual Wallet';
        let bal = AppState.wallet?.balance || 0;
        try { const w = await fetch('/api/wallet').then(r=>r.json()); bal = w.balance; AppState.wallet = w; } catch(e){}
        let history = [];
        try { history = await fetch('/api/history').then(r=>r.json()); } catch(e){}
        const invested = AppState.holdings.filter(h=>h&&h.symbol).reduce((a,h)=>a+(h.qty*(h.cost||0)),0);
        const curVal = this.getHoldingsValue();
        const pnl = curVal - invested;
        c.innerHTML = `
        <!-- WALLET HERO -->
        <div style="background:linear-gradient(135deg,#0f0c29,#1a1040,#0d1526);border:1px solid rgba(124,58,237,0.3);border-radius:24px;padding:36px;position:relative;overflow:hidden;margin-bottom:20px;">
            <div style="position:absolute;top:-60px;right:-60px;width:250px;height:250px;background:radial-gradient(circle,rgba(0,240,255,0.12),transparent 70%);pointer-events:none;"></div>
            <small class="kp-label">AVAILABLE BALANCE</small>
            <div style="font-size:48px;font-weight:900;font-family:'Poppins',sans-serif;margin:12px 0;color:var(--text);">₹${bal.toLocaleString('en-IN',{maximumFractionDigits:2})}</div>
            <div style="display:flex;gap:32px;margin-bottom:28px;">
                <div><span class="kp-label">INVESTED</span><b style="display:block;font-size:16px;">₹${invested.toLocaleString('en-IN',{maximumFractionDigits:0})}</b></div>
                <div><span class="kp-label">CURRENT VALUE</span><b style="display:block;font-size:16px;">₹${curVal.toLocaleString('en-IN',{maximumFractionDigits:0})}</b></div>
                <div><span class="kp-label">UNREALISED P&amp;L</span><b style="display:block;font-size:16px;" class="${pnl>=0?'text-green':'text-red'}">${pnl>=0?'+':''}₹${Math.abs(pnl).toLocaleString('en-IN',{maximumFractionDigits:0})}</b></div>
                <div><span class="kp-label">NET WORTH</span><b style="display:block;font-size:16px;">₹${(bal+curVal).toLocaleString('en-IN',{maximumFractionDigits:0})}</b></div>
            </div>
            <div style="display:flex;gap:12px;">
                <button onclick="UI.setWalletMode('add');document.getElementById('balance-modal').classList.remove('hidden');" style="background:var(--green);border:none;color:#000;padding:14px 28px;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:8px;box-shadow:0 4px 15px rgba(16,185,129,0.4);transition:0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
                    ➕ Deposit Funds
                </button>
                <button onclick="UI.setWalletMode('withdraw');document.getElementById('balance-modal').classList.remove('hidden');" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:var(--red);padding:14px 28px;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:8px;transition:0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
                    ➖ Withdraw Funds
                </button>
            </div>
        </div>

        <!-- TRANSACTION TABLE -->
        <div class="chart-card">
            <h3 style="margin-bottom:16px;">Transaction History</h3>
            <table style="width:100%;border-collapse:collapse;">
                <thead><tr style="color:var(--text-dim);font-size:11px;">
                    <th style="padding:10px 16px;text-align:left;">TYPE</th>
                    <th style="padding:10px 16px;text-align:left;">DESCRIPTION</th>
                    <th style="padding:10px 16px;text-align:right;">AMOUNT</th>
                    <th style="padding:10px 16px;text-align:right;">DATE</th>
                </tr></thead>
                <tbody>${history.slice(0,20).map(h=>{
                    const isDeposit = h.type==='DEPOSIT';
                    const isWithdraw = h.type==='WITHDRAW';
                    const isBuy = h.type==='BUY';
                    const isSell = h.type==='SELL';
                    const badgeColor = isDeposit?'16,185,129': isWithdraw?'239,68,68': isBuy?'239,68,68':'16,185,129';
                    const textColor = isDeposit?'green': isWithdraw?'red': isBuy?'red':'green';
                    const sign = (isDeposit||isSell)?'+':'-';
                    const icon = isDeposit?'⬇️': isWithdraw?'⬆️': isBuy?'📈':'📉';
                    return `<tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                        <td style="padding:14px 16px;"><span style="font-size:10px;font-weight:700;padding:4px 10px;border-radius:20px;background:rgba(${badgeColor},0.12);color:var(--${textColor});">${icon} ${h.type}</span></td>
                        <td style="padding:14px 16px;"><b style="font-size:13px;">${h.symbol||''}</b>${h.symbol?'<br>':''}<span style="color:var(--text-dim);font-size:12px;">${h.name||''}</span></td>
                        <td style="padding:14px 16px;text-align:right;font-weight:700;" class="${(isDeposit||isSell)?'text-green':'text-red'}">${sign}₹${(+h.total).toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                        <td style="padding:14px 16px;text-align:right;color:var(--text-dim);font-size:11px;">${new Date(h.date).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</td>
                    </tr>`;
                }).join('') || '<tr><td colspan="4" style="text-align:center;padding:40px;color:var(--text-dim);">No transactions yet</td></tr>'}
                </tbody>
            </table>
        </div>`;
        if(window.lucide) window.lucide.createIcons();
    },

    async viewLeaderboard(c, t) {
        t.innerText = 'Leaderboard';
        let board = [];
        try { board = await fetch('/api/leaderboard').then(r=>r.json()); } catch(e){}
        const medals = ['🥇','🥈','🥉'];
        c.innerHTML = `<div class="card"><h3 style="margin-bottom:4px">Top Traders</h3><p style="color:var(--dim);font-size:12px;margin-bottom:20px">Ranked by profit percentage</p><div style="display:flex;flex-direction:column;gap:8px">${
            board.map((u,i)=>`<div class="lb-row"><div style="font-size:20px;width:32px;text-align:center">${medals[i]||i+1}</div><div class="lb-avatar">${u.avatar}</div><div style="flex:1"><b style="font-size:13px">${u.username}</b><div style="font-size:11px;color:var(--dim)">${u.trades} trades</div></div><div style="text-align:right"><div class="text-green" style="font-weight:800;font-size:16px">+${u.profitPerc}%</div></div></div>`).join('')
        }</div></div>`;
    },

    async viewChallenge(c, t) {
        t.innerText = 'Trading Challenges';
        let challenges = [];
        try { challenges = await fetch('/api/challenges').then(r=>r.json()); } catch(e){}
        c.innerHTML = `<div style="display:grid;gap:16px">${
            challenges.map(ch=>{
                const pct = Math.min((ch.current/ch.goal)*100,100);
                return `<div class="challenge-card"><div class="flex-between"><div><h3 style="font-size:15px">${ch.title}</h3><span style="font-size:11px;color:var(--dim)">${ch.daysRemaining} days remaining</span></div><span class="badge badge-purple">${ch.status}</span></div><div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div><div class="flex-between" style="font-size:12px"><span style="color:var(--dim)">Progress: ₹${(+ch.current).toLocaleString()} / ₹${(+ch.goal).toLocaleString()}</span><b class="text-cyan">${pct.toFixed(0)}%</b></div></div>`;
            }).join('')
        }</div>`;
    },

    async viewNews(c, t) {
        t.innerText = 'Live Market News';
        c.innerHTML = `
            <div class="analysis-toolbar" style="margin-bottom: 20px;">
                <div class="chart-period-tabs" style="display: flex; gap: 8px;">
                    <button class="btn-period active" onclick="UI.changeNewsCategory('indian', this)">Indian Markets</button>
                    <button class="btn-period" onclick="UI.changeNewsCategory('crypto', this)">Crypto Hub</button>
                    <button class="btn-period" onclick="UI.changeNewsCategory('global', this)">Global Finance</button>
                </div>
            </div>
            <div id="news-list" class="movers-grid" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px;">
                <div class="analysis-loading"><div class="analysis-spinner"></div><p>Fetching real-time daily news…</p></div>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        await this.loadNews('indian');
    },

    async loadNews(category) {
        const list = document.getElementById('news-list');
        if (!list) return;
        try {
            const data = await fetch(`/api/news?category=${category}`).then(r => r.json());
            if (!data || data.length === 0) {
                list.innerHTML = '<div class="chart-empty-msg">Could not load news feed. Try again.</div>';
                return;
            }
            list.innerHTML = data.map(item => `
                <a href="${item.link}" target="_blank" class="glass-card" style="padding: 20px; display: flex; flex-direction: column; justify-content: space-between; text-decoration: none; color: inherit; min-height: 160px; transition: 0.3s; border-color: rgba(255,255,255,0.04);">
                    <div>
                        <div class="flex-between" style="margin-bottom: 10px;">
                            <span class="badge badge-purple" style="font-size: 9px; padding: 4px 8px; font-weight: 800; border-radius: 6px;">${item.source}</span>
                            <small style="color: var(--dim); font-size: 11px;">${item.pubDate.split(',')[0]}</small>
                        </div>
                        <h4 style="font-size: 14px; font-weight: 700; line-height: 1.4; color: var(--text); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; margin-top: 6px;">
                            ${item.title}
                        </h4>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: var(--cyan); margin-top: 14px;">
                        Read Article <i data-lucide="arrow-up-right" class="icon-sm" style="width: 12px; height: 12px;"></i>
                    </div>
                </a>
            `).join('');
            if (window.lucide) window.lucide.createIcons();
        } catch (e) {
            list.innerHTML = '<div class="chart-empty-msg">Error loading news: ' + e.message + '</div>';
        }
    },

    changeNewsCategory(category, btn) {
        const parent = btn.parentElement;
        if (parent) {
            parent.querySelectorAll('button').forEach(b => {
                b.classList.remove('active');
                b.style.background = 'transparent';
                b.style.color = 'var(--dim)';
            });
            btn.classList.add('active');
            btn.style.background = 'rgba(255,255,255,0.04)';
            btn.style.color = 'var(--text)';
        }
        this.loadNews(category);
    },

    _analysisSymbol: 'RELIANCE.NS',
    _analysisChart: null,
    _flowChart: null,

    async viewAnalysis(c, t) {
        t.innerText = 'Institutional Flow Analysis';
        const sym = this._analysisSymbol || 'RELIANCE.NS';
        const watchSyms = [...new Set([sym, 'BTC-USD', 'ETH-USD', ...AppState.watchlist.slice(0, 8)])];

        c.innerHTML = `
        <div class="analysis-toolbar">
            <div class="analysis-symbol-wrap">
                <label class="kp-label">SYMBOL</label>
                <select id="analysis-symbol" class="analysis-select" onchange="UI.onAnalysisSymbolChange(this.value)">
                    ${watchSyms.map(s => `<option value="${s}" ${s === sym ? 'selected' : ''}>${s.replace('.NS', '')}</option>`).join('')}
                </select>
            </div>
            <input type="text" id="analysis-custom" class="analysis-input" placeholder="Custom symbol e.g. TCS.NS" />
            <button class="btn-primary" onclick="UI.runAnalysis()"><i data-lucide="refresh-cw"></i> Analyze</button>
        </div>
        <div id="analysis-body"><div class="analysis-loading"><div class="analysis-spinner"></div><p>Running flow algorithms…</p></div></div>`;

        if (window.lucide) window.lucide.createIcons();
        await this.runAnalysis();
    },

    onAnalysisSymbolChange(val) {
        this._analysisSymbol = val;
    },

    async runAnalysis() {
        const custom = document.getElementById('analysis-custom');
        const select = document.getElementById('analysis-symbol');
        let sym = (custom && custom.value.trim()) || (select && select.value) || this._analysisSymbol;
        sym = sym.toUpperCase();
        if (!sym.includes('.') && !sym.includes('-')) {
            if (['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','DOT','MATIC','AVAX','LINK'].includes(sym)) sym = sym + '-USD';
            else sym += '.NS';
        }
        this._analysisSymbol = sym;

        const body = document.getElementById('analysis-body');
        if (!body) return;
        body.innerHTML = '<div class="analysis-loading"><div class="analysis-spinner"></div><p>Fetching market data for ' + sym + '…</p></div>';

        try {
            const data = await fetch(`/api/market/analysis?symbol=${encodeURIComponent(sym)}&theme=${AppState.theme}`).then(r => {
                if (!r.ok) return r.json().then(j => { throw new Error(j.error || j.details || 'Analysis failed'); });
                return r.json();
            });
            this.renderAnalysisResults(data);
        } catch (e) {
            body.innerHTML = `<div class="chart-card" style="text-align:center;padding:48px;"><p class="text-red" style="margin-bottom:12px;">${e.message}</p><p style="color:var(--dim);font-size:13px;">Ensure Python is installed and run: <code>python analysis.py</code></p><button class="btn-primary" style="margin-top:16px" onclick="UI.runAnalysis()">Retry</button></div>`;
        }
        if (window.lucide) window.lucide.createIcons();
    },

    renderAnalysisResults(data) {
        const body = document.getElementById('analysis-body');
        if (!body) return;

        const q = data.quote || {};
        const m = data.metrics || {};
        const signal = data.signal || 'NEUTRAL';
        const sigClass = signal === 'BULLISH' ? 'text-green' : (signal === 'BEARISH' ? 'text-red' : 'text-cyan');
        const score = data.ai_score || 0;
        const scoreColor = score >= 70 ? 'var(--green)' : (score < 45 ? 'var(--red)' : 'var(--cyan)');

        body.innerHTML = `
        <div class="analysis-hero">
            <div>
                <small class="kp-label">ANALYZING</small>
                <h2 style="font-size:26px;font-weight:800;margin:8px 0 4px;">${(data.symbol || '').replace('.NS', '')}</h2>
                <span style="color:var(--dim);font-size:13px;">${q.name || data.symbol || ''}</span>
                ${q.price ? `<div style="margin-top:12px;font-size:22px;font-weight:800;">₹${q.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })} <span class="${(q.changePercent || 0) >= 0 ? 'text-green' : 'text-red'}" style="font-size:14px;">${(q.changePercent || 0) >= 0 ? '+' : ''}${(q.changePercent || 0).toFixed(2)}%</span></div>` : ''}
            </div>
            <div class="analysis-score-ring" style="--score-color:${scoreColor};--score-pct:${score}">
                <div class="analysis-score-inner">
                    <span class="kp-label">AI SCORE</span>
                    <b style="font-size:36px;color:${scoreColor}">${score}</b>
                    <span class="${sigClass}" style="font-size:12px;font-weight:800;letter-spacing:1px;">${signal}</span>
                </div>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px;">
            <div class="glass-card" style="padding:18px;"><small class="kp-label">NET FLOW (Cr)</small><h3 class="${(m.net_flow_cr || 0) >= 0 ? 'text-green' : 'text-red'}" style="margin-top:8px;font-size:20px;">${(m.net_flow_cr || 0) >= 0 ? '+' : ''}${(m.net_flow_cr || 0).toFixed(2)}</h3></div>
            <div class="glass-card" style="padding:18px;"><small class="kp-label">MOMENTUM</small><h3 style="margin-top:8px;font-size:20px;" class="${(m.momentum_pct || 0) >= 0 ? 'text-green' : 'text-red'}">${(m.momentum_pct || 0) >= 0 ? '+' : ''}${(m.momentum_pct || 0).toFixed(2)}%</h3></div>
            <div class="glass-card" style="padding:18px;"><small class="kp-label">VOLUME TREND</small><h3 style="margin-top:8px;font-size:20px;" class="${(m.volume_trend_pct || 0) >= 0 ? 'text-green' : 'text-red'}">${(m.volume_trend_pct || 0) >= 0 ? '+' : ''}${(m.volume_trend_pct || 0).toFixed(2)}%</h3></div>
            <div class="glass-card" style="padding:18px;"><small class="kp-label">TODAY CHANGE</small><h3 style="margin-top:8px;font-size:20px;" class="${(m.change_pct || 0) >= 0 ? 'text-green' : 'text-red'}">${(m.change_pct || 0) >= 0 ? '+' : ''}${(m.change_pct || 0).toFixed(2)}%</h3></div>
        </div>

        <!-- Premium Python Analytics Chart Dashboard -->
        <div class="chart-card" style="margin-bottom:20px;">
            <div class="flex-between" style="margin-bottom:14px;">
                <h3>Python AI Technical & Institutional Analytics Dashboard</h3>
                <span class="badge badge-purple" style="font-size:10px; display:inline-flex; align-items:center; gap:4px;">
                    <i data-lucide="cpu" class="icon-sm" style="width:12px; height:12px;"></i> Python 3.14 + Matplotlib
                </span>
            </div>
            <div class="python-chart-wrapper" style="position:relative; width:100%; border-radius:12px; overflow:hidden; border:1px solid var(--border); background:var(--bg2); padding: 8px;">
                ${data.chart_image ? `
                    <img src="${data.chart_image}?t=${Date.now()}" alt="Python Generated Chart" style="width:100%; height:auto; display:block; border-radius:8px; image-rendering:-webkit-optimize-contrast;" />
                ` : `
                    <div style="padding:40px; text-align:center; color:var(--dim);">
                        <i data-lucide="alert-triangle" style="margin:0 auto 12px; color:var(--amber);"></i>
                        <p>Python chart could not be generated. Please ensure matplotlib is installed.</p>
                    </div>
                `}
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:20px;margin-bottom:20px;">
            <div class="chart-card">
                <h3 style="margin-bottom:12px;">Net Flow Trend <small style="color:var(--dim);font-weight:400;">(real OHLCV)</small></h3>
                <div class="chart-panel"><canvas id="flow-history-chart"></canvas></div>
            </div>
            <div class="chart-card">
                <h3 style="margin-bottom:12px;">Inflow vs Outflow</h3>
                <div class="chart-panel"><canvas id="flow-participant-chart"></canvas></div>
            </div>
        </div>

        <div class="chart-card">
            <h3 style="margin-bottom:16px;">Inflow vs Outflow by Category (₹ Cr proxy)</h3>
            <table class="data-table">
                <thead><tr><th>PARTICIPANT</th><th style="text-align:right">INFLOW</th><th style="text-align:right">OUTFLOW</th><th style="text-align:right">NET</th></tr></thead>
                <tbody>${(data.summary || []).map(row => `
                    <tr>
                        <td><b>${row.category}</b></td>
                        <td style="text-align:right" class="text-green">+${row.inflow.toFixed(2)}</td>
                        <td style="text-align:right" class="text-red">-${row.outflow.toFixed(2)}</td>
                        <td style="text-align:right;font-weight:800" class="${row.net >= 0 ? 'text-green' : 'text-red'}">${row.net >= 0 ? '+' : ''}${row.net.toFixed(2)}</td>
                    </tr>
                `).join('')}</tbody>
            </table>
            <p style="margin-top:14px;font-size:11px;color:var(--dim);line-height:1.6;">Flow estimates use volume-weighted money flow (CMF-style) on Yahoo OHLCV. Category splits are modelled weights tuned for Indian markets — not exchange-reported FII/DII data.</p>
            <button class="btn-secondary" style="margin-top:16px" onclick="UI.openTerminal('${data.symbol}')"><i data-lucide="zap"></i> Trade ${(data.symbol || '').replace('.NS', '')}</button>
        </div>`;

        this.renderAnalysisCharts(data);
        if (window.lucide) window.lucide.createIcons();
    },

    renderAnalysisCharts(data) {
        ChartService.destroy('flow-history-chart');
        ChartService.destroy('flow-participant-chart');
        if (data.history?.length) {
            ChartService.renderFlowBar('flow-history-chart', data.history, 'Net Flow');
        }
        if (data.summary?.length) {
            const el = document.getElementById('flow-participant-chart');
            if (el) {
                ChartService.destroy('flow-participant-chart');
                ChartService._charts['flow-participant-chart'] = new Chart(el, {
                    type: 'bar',
                    data: {
                        labels: data.summary.map(s => s.category.split(' ')[0]),
                        datasets: [
                            {
                                label: 'Inflow',
                                data: data.summary.map(s => s.inflow),
                                backgroundColor: 'rgba(16,185,129,0.7)',
                                borderRadius: 4
                            },
                            {
                                label: 'Outflow',
                                data: data.summary.map(s => -s.outflow),
                                backgroundColor: 'rgba(239,68,68,0.7)',
                                borderRadius: 4
                            }
                        ]
                    },
                    options: ChartService.baseOptions({
                        scales: {
                            x: { stacked: true },
                            y: {
                                stacked: true,
                                ticks: {
                                    callback: v => (v >= 0 ? '+' : '') + v.toFixed(0) + ' Cr'
                                }
                            }
                        }
                    })
                });
            }
        }
    },

    _cryptoChart: null,

    async viewCrypto(c, t) {
        t.innerText = 'Crypto Hub — Bitcoin & Altcoins';
        c.innerHTML = `
        <div id="crypto-overview" class="crypto-overview-wrap">Loading live crypto markets…</div>
        <div class="search-card" style="margin:16px 0;">
            <i data-lucide="search"></i>
            <input type="text" id="crypto-search" placeholder="Search BTC, ETH, SOL…" oninput="UI.filterCrypto(this.value)">
        </div>
        <div class="crypto-chart-coins" id="crypto-chart-coins">
            <span class="crypto-coin-chip active" onclick="UI.selectCryptoChart('BTC-USD',this)">BTC</span>
            <span class="crypto-coin-chip" onclick="UI.selectCryptoChart('ETH-USD',this)">ETH</span>
            <span class="crypto-coin-chip" onclick="UI.selectCryptoChart('SOL-USD',this)">SOL</span>
            <span class="crypto-coin-chip" onclick="UI.selectCryptoChart('BNB-USD',this)">BNB</span>
            <span class="crypto-coin-chip" onclick="UI.selectCryptoChart('XRP-USD',this)">XRP</span>
        </div>
        <div class="crypto-period-tabs">
            <button class="quick-btn crypto-period active" data-p="1D" onclick="UI.setCryptoChartPeriod('1D',this)">1D</button>
            <button class="quick-btn crypto-period" data-p="1W" onclick="UI.setCryptoChartPeriod('1W',this)">1W</button>
            <button class="quick-btn crypto-period" data-p="1M" onclick="UI.setCryptoChartPeriod('1M',this)">1M</button>
            <button class="quick-btn crypto-period" data-p="1Y" onclick="UI.setCryptoChartPeriod('1Y',this)">1Y</button>
        </div>
        <div class="chart-card" style="margin-bottom:20px;">
            <h3 id="crypto-chart-title" style="margin-bottom:12px;">BTC — Candlestick <span style="color:var(--dim);font-size:12px;font-weight:400;">(INR · Binance)</span></h3>
            <div id="crypto-lw-chart" class="lw-chart-panel"></div>
        </div>
        <h3 style="margin-bottom:12px;font-size:15px;">Trade Crypto <small style="color:var(--dim);font-weight:400;">— Binance live · virtual INR wallet</small></h3>
        <div class="hub-grid" id="crypto-grid"></div>`;

        this._cryptoChartPeriod = '1M';
        this._cryptoChartSymbol = 'BTC-USD';
        if (window.lucide) window.lucide.createIcons();
        await this.loadCryptoHub(true);
        await this.renderCryptoCandleChart();
        if (!this._cryptoInterval) {
            this._cryptoInterval = setInterval(() => {
                if (AppState.activeView === 'crypto') this.loadCryptoHub(false);
            }, 90000);
        }
    },

    filterCrypto(v) {
        AppState.cryptoSearch = (v || '').toLowerCase();
        this.renderCryptoGrid();
    },

    renderCryptoOverview(ov) {
        const el = document.getElementById('crypto-overview');
        if (!el) return;
        const g = ov.global || {};
        const btc = ov.btc;
        el.innerHTML = `
            <div class="crypto-hero">
                <div class="crypto-hero-main">
                    <span class="crypto-btc-icon">₿</span>
                    <div>
                        <small class="kp-label">BITCOIN LIVE</small>
                        <h2 style="font-size:32px;font-weight:900;margin:6px 0;">${btc ? DataService.formatPrice('BTC-USD', btc.price) : '—'}</h2>
                        <span style="color:var(--dim);font-size:14px;">${btc && btc.priceUsd ? '$' + btc.priceUsd.toLocaleString('en-US') : ''}</span>
                        <span class="${(btc?.changePercent||0)>=0?'text-green':'text-red'}" style="margin-left:12px;font-weight:700;">${btc ? (btc.changePercent>=0?'+':'')+btc.changePercent.toFixed(2)+'%' : ''}</span>
                    </div>
                </div>
                <div class="crypto-hero-stats">
                    <div><small class="kp-label">MARKET CAP</small><b>$${((g.totalMarketCapUsd||0)/1e12).toFixed(2)}T</b></div>
                    <div><small class="kp-label">BTC DOMINANCE</small><b>${(g.btcDominance||0).toFixed(1)}%</b></div>
                    <div><small class="kp-label">ACTIVE COINS</small><b>${(g.activeCryptos||0).toLocaleString()}</b></div>
                </div>
            </div>`;
    },

    async loadCryptoHub(showLoading) {
        const el = document.getElementById('crypto-overview');
        if (showLoading && el) el.innerHTML = '<div class="analysis-loading"><div class="analysis-spinner"></div><p>Loading live crypto…</p></div>';
        try {
            const hub = await fetch('/api/crypto/hub').then(r => r.json());
            if (hub.catalog?.length) AppState.masterCryptos = hub.catalog;
            if (Array.isArray(hub.quotes)) {
                hub.quotes.forEach(q => { if (q?.symbol) AppState.liveQuotes[q.symbol] = q; });
            }
            this.renderCryptoOverview(hub);
            this.renderCryptoGrid();
            DataService.updateTicker();
        } catch (e) {
            if (el) el.innerHTML = '<p style="color:var(--red);padding:16px;">Network error. <button class="btn-primary" onclick="UI.loadCryptoHub(true)">Retry</button></p>';
        }
    },

    renderCryptoGrid() {
        const g = document.getElementById('crypto-grid');
        if (!g) return;
        const list = AppState.masterCryptos.filter(c =>
            c.symbol.toLowerCase().includes(AppState.cryptoSearch) ||
            c.name?.toLowerCase().includes(AppState.cryptoSearch) ||
            c.ticker?.toLowerCase().includes(AppState.cryptoSearch)
        );
        g.innerHTML = list.map(c => {
            const q = AppState.liveQuotes[c.symbol] || { price: 0, changePercent: 0, priceUsd: 0 };
            const chgCls = q.changePercent >= 0 ? 'text-green' : 'text-red';
            const hasPrice = q.price > 0;
            const active = (this._cryptoChartSymbol || 'BTC-USD') === c.symbol ? ' chart-active' : '';
            return `<div class="hub-card crypto-hub-card${active}" onclick="UI.selectCryptoChart('${c.symbol}',this)">
                <div class="flex-between">
                    <span class="sym" style="color:#F59E0B;">${c.ticker || c.symbol.replace('-USD','')}</span>
                    <span class="${chgCls} chg" style="font-size:11px;font-weight:700">${hasPrice ? (q.changePercent >= 0 ? '+' : '') + (q.changePercent || 0).toFixed(2) + '%' : '…'}</span>
                </div>
                <div class="price">${hasPrice ? DataService.formatPrice(c.symbol, q.price) : 'Loading…'}</div>
                <div style="font-size:10px;color:var(--dim);margin-top:4px">${q.priceUsd ? '$' + q.priceUsd.toLocaleString('en-US', { maximumFractionDigits: 2 }) : c.name}</div>
                <button class="btn-secondary" style="margin-top:10px;font-size:10px;padding:5px 12px;width:100%" onclick="event.stopPropagation();UI.openTerminal('${c.symbol}','${c.name.replace(/'/g,'')}')">Trade</button>
            </div>`;
        }).join('') || '<p style="color:var(--dim);padding:20px;">No coins match your search.</p>';
    },

    selectCryptoChart(sym, el) {
        this._cryptoChartSymbol = sym;
        document.querySelectorAll('.crypto-coin-chip').forEach(c => c.classList.toggle('active', c.textContent === sym.replace('-USD', '')));
        document.querySelectorAll('.crypto-hub-card').forEach(c => c.classList.remove('chart-active'));
        if (el) el.classList.add('chart-active');
        const title = document.getElementById('crypto-chart-title');
        if (title) title.innerHTML = `${sym.replace('-USD', '')} — Candlestick <span style="color:var(--dim);font-size:12px;font-weight:400;">(INR · live)</span>`;
        this.renderCryptoCandleChart();
    },

    async setCryptoChartPeriod(period, btn) {
        this._cryptoChartPeriod = period;
        document.querySelectorAll('.crypto-period').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        await this.renderCryptoCandleChart();
    },

    async renderCryptoCandleChart() {
        const sym = this._cryptoChartSymbol || 'BTC-USD';
        await ChartService.renderCryptoCandles('crypto-lw-chart', sym, this._cryptoChartPeriod || '1M');
    },

    async viewScreener(c, t) {
        t.innerText = 'Market Screener';
        c.innerHTML = `<div style="text-align:center;padding:60px;"><p style="color:var(--text-dim);font-size:16px;">Running screener algorithms...</p><div style="margin-top:16px;width:30px;height:30px;border:3px solid rgba(0,240,255,0.1);border-top-color:var(--cyan);border-radius:50%;animation:spin 1s linear infinite;display:inline-block;"></div></div>`;
        try {
            const data = await fetch('/api/market/screener').then(r=>r.json());
            
            const renderTable = (title, items, isBull) => `
                <div class="chart-card">
                    <h3 style="margin-bottom:16px;display:flex;align-items:center;gap:8px;">
                        <span style="width:8px;height:8px;border-radius:50%;background:var(--${isBull?'green':'red'});"></span>${title}
                    </h3>
                    <table style="width:100%;border-collapse:collapse;">
                        <thead><tr style="color:var(--text-dim);font-size:11px;border-bottom:1px solid rgba(255,255,255,0.05);text-align:left;">
                            <th style="padding:8px;">SYMBOL</th>
                            <th style="padding:8px;text-align:right;">PRICE</th>
                            <th style="padding:8px;text-align:right;">CHANGE</th>
                        </tr></thead>
                        <tbody>${items.length ? items.slice(0,10).map(q => `
                            <tr style="border-bottom:1px solid rgba(255,255,255,0.02);cursor:pointer;transition:0.1s;" onclick="UI.openTerminal('${q.symbol}')" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''">
                                <td style="padding:12px 8px;"><b>${q.symbol.replace('.NS','')}</b><br><small style="color:var(--text-dim);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;display:inline-block;">${q.name}</small></td>
                                <td style="padding:12px 8px;text-align:right;font-weight:700;">₹${q.price.toFixed(2)}</td>
                                <td style="padding:12px 8px;text-align:right;font-weight:700;" class="${q.changePercent>=0?'text-green':'text-red'}">${q.changePercent>=0?'+':''}${q.changePercent.toFixed(2)}%</td>
                            </tr>
                        `).join('') : '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--text-dim);">No data</td></tr>'}</tbody>
                    </table>
                </div>
            `;

            c.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;">
                <div class="chart-card">
                    <h3 style="margin-bottom:12px;">Gainers % (Live)</h3>
                    <div class="chart-panel" style="height:220px"><canvas id="screener-bulls-bar"></canvas></div>
                </div>
                <div class="chart-card">
                    <h3 style="margin-bottom:12px;">Losers % (Live)</h3>
                    <div class="chart-panel" style="height:220px"><canvas id="screener-bears-bar"></canvas></div>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
                ${renderTable('Top Gainers (Bulls)', data.bulls || [], true)}
                ${renderTable('Top Losers (Bears)', data.bears || [], false)}
            </div>
            <div class="chart-card" style="margin-top:24px;">
                <h3 style="margin-bottom:16px;">Most Active by Volume</h3>
                <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:12px;">
                    ${(data.actives || []).slice(0,10).map(q => `
                        <div class="heatmap-box" style="min-width:140px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.1);cursor:pointer;" onclick="UI.openTerminal('${q.symbol}')" onmouseover="this.style.border='1px solid var(--cyan)'" onmouseout="this.style.border='1px solid rgba(255,255,255,0.1)'">
                            <b style="font-size:13px;">${q.symbol.replace('.NS','')}</b><br>
                            <span style="font-size:16px;font-weight:800;color:var(--text);margin:6px 0;display:block;">₹${q.price.toFixed(2)}</span>
                            <span class="${q.changePercent>=0?'text-green':'text-red'}" style="font-size:12px;font-weight:700;">${q.changePercent>=0?'+':''}${q.changePercent.toFixed(2)}%</span><br>
                            <span style="color:var(--text-dim);font-size:10px;margin-top:4px;display:block;">Vol: ${(q.volume/1000000).toFixed(1)}M</span>
                        </div>
                    `).join('')}
                </div>
            </div>`;
            ChartService.renderScreenerBar('screener-bulls-bar', data.bulls || [], '24h %');
            ChartService.renderScreenerBar('screener-bears-bar', data.bears || [], '24h %');
        } catch (e) {
            c.innerHTML = `<div style="text-align:center;padding:60px;"><p style="color:var(--red);">Failed to load screener data. API rate limit or network issue.</p></div>`;
        }
    },

    viewGuide(c, t) {
        t.innerText = 'User Guide';
        c.innerHTML = `
        <div class="card" style="margin-bottom:16px"><h3 style="margin-bottom:12px;display:flex;align-items:center;gap:8px"><span>🚀</span> Getting Started</h3><p style="color:var(--dim);line-height:1.8">Welcome to BullTrack Pro — virtual NSE stocks + <b>Bitcoin & crypto</b> (free CoinGecko live prices). Add balance, trade stocks or BTC/ETH with fractional quantities.</p></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div class="card"><h4 style="margin-bottom:10px;display:flex;align-items:center;gap:8px"><span>💰</span> Add Balance</h4><p style="color:var(--dim);font-size:13px;line-height:1.7">Click "Add Balance" in the top bar or go to Virtual Wallet. Add virtual funds to start trading.</p></div>
            <div class="card"><h4 style="margin-bottom:10px;display:flex;align-items:center;gap:8px"><span>📈</span> Stock Market</h4><p style="color:var(--dim);font-size:13px;line-height:1.7">Open Stock Market for 600+ NSE companies with live LTP, change %, volume &amp; market cap. Click Trade on any row.</p></div>
            <div class="card"><h4 style="margin-bottom:10px;display:flex;align-items:center;gap:8px"><span>💼</span> Holdings</h4><p style="color:var(--dim);font-size:13px;line-height:1.7">View all your delivery holdings, live P&L, portfolio heatmap and sector allocation.</p></div>
            <div class="card"><h4 style="margin-bottom:10px;display:flex;align-items:center;gap:8px"><span>₿</span> Crypto Hub</h4><p style="color:var(--dim);font-size:13px;line-height:1.7">Trade Bitcoin, Ethereum, Solana & 25+ coins. Live INR prices, charts, and virtual wallet — no API key needed.</p></div>
            <div class="card"><h4 style="margin-bottom:10px;display:flex;align-items:center;gap:8px"><span>🏆</span> Leaderboard</h4><p style="color:var(--dim);font-size:13px;line-height:1.7">Compete with other traders. Complete challenges to earn rank points and climb the board.</p></div>
        </div>`;
    },

    async viewSettings(c, t) {
        t.innerText = 'Settings';
        let profile = { username: 'Shubham Kumar', bio: 'Pro Trader', avatar: 'SK' };
        try { profile = await fetch('/api/profile').then(r=>r.json()); } catch(e){}
        c.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
            <div class="card"><h3 style="margin-bottom:20px">Profile Settings</h3>
                <div class="input-group"><label>Display Name</label><input id="s-name" value="${profile.username||''}"></div>
                <div class="input-group"><label>Bio / Role</label><input id="s-bio" value="${profile.bio||''}"></div>
                <div class="input-group"><label>Avatar Initials</label><input id="s-avatar" value="${profile.avatar||''}" maxlength="2"></div>
                <button class="btn-primary" onclick="UI.saveProfile()"><i data-lucide="save"></i>Save Profile</button>
            </div>
            <div class="card"><h3 style="margin-bottom:20px">Appearance</h3>
                <div class="input-group"><label>Theme</label>
                    <div style="display:flex;gap:10px;margin-top:4px">
                        <button class="btn-secondary" onclick="UI.setTheme('dark')"><i data-lucide="moon"></i>Dark</button>
                        <button class="btn-secondary" onclick="UI.setTheme('light')"><i data-lucide="sun"></i>Light</button>
                    </div>
                </div>
                <div style="margin-top:24px;padding:16px;background:rgba(255,77,79,.05);border:1px solid rgba(255,77,79,.15);border-radius:12px">
                    <h4 style="color:var(--red);margin-bottom:8px">Danger Zone</h4>
                    <p style="color:var(--dim);font-size:12px;margin-bottom:12px">Reset all portfolio data (cannot be undone)</p>
                    <button class="btn-danger" onclick="UI.resetPortfolio()"><i data-lucide="trash-2"></i>Reset Portfolio</button>
                </div>
            </div>
        </div>`;
        if(window.lucide) window.lucide.createIcons();
    },
    async saveProfile() {
        const body = { username: document.getElementById('s-name').value, bio: document.getElementById('s-bio').value, avatar: document.getElementById('s-avatar').value };
        try { await fetch('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); document.getElementById('sidebar-username').innerText=body.username; document.getElementById('sidebar-avatar').innerText=body.avatar; this.notify('Profile saved!','success'); } catch(e){ this.notify('Save failed','error'); }
    },
    setTheme(t) { AppState.theme=t; this.applyTheme(); },
    async resetPortfolio() {
        if(!confirm('Are you sure? This will delete all holdings and history!')) return;
        try {
            await fetch('/api/history',{method:'DELETE'});
            AppState.holdings=[]; AppState.history=[];
            this.notify('Portfolio reset!','info'); this.renderView('dashboard');
        } catch(e){ this.notify('Reset failed','error'); }
    }
};

window.onload = () => UI.start();
