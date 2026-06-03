const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb } = require('./database');
const cryptoApi = require('./crypto');
const stocksApi = require('./stocks-api');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({
    suppressNotices: ['yahooSurvey']
});


const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

let db;

// Initialize Database and Start Server
initDb().then(database => {
    db = database;
    
    // Function to start server and automatically handle port conflicts
    const startServer = (port) => {
        const server = app.listen(port, () => {
            console.log(`Server running at http://localhost:${port}`);
        });

        // Event listener for port conflict errors
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`⚠️ Port ${port} is already in use. Trying port ${port + 1}...`);
                startServer(port + 1); // Try the next port
            } else {
                console.error('Initial server startup error:', err);
            }
        });
    };

    startServer(PORT); // Start trying with the initial port
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection (app continues):', err?.message || err);
});

// --- API ENDPOINTS ---
 
// --- MOCK MARKET DATA ENGINE ---
// GET: Share name/symbol → live price (local list + Yahoo)
app.get('/api/market/lookup', async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 1) return res.json({ results: [] });

    try {
        const term = q.toLowerCase();
        const catalog = stocksApi.loadCatalog();
        const local = catalog
            .map(s => {
                const sym = s.symbol.replace('.NS', '').toLowerCase();
                const name = (s.name || '').toLowerCase();
                let score = 0;
                if (sym === term) score = 100;
                else if (name === term) score = 90;
                else if (sym.startsWith(term)) score = 70;
                else if (name.includes(term)) score = 50;
                else if (sym.includes(term)) score = 40;
                else return null;
                return { ...s, score };
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8);

        let yahooHits = [];
        if (q.length >= 2 && local.length < 3) {
            const searchTimeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('search timeout')), 3500));
            const yahooRes = await Promise.race([
                yahooFinance.search(q, {}, { validateResult: false }),
                searchTimeout
            ]).catch(() => ({ quotes: [] }));
            yahooHits = (yahooRes.quotes || [])
                .filter(x => x.isYahooFinance && (x.quoteType === 'EQUITY' || x.quoteType === 'ETF'))
                .slice(0, 5)
                .map(x => ({
                    symbol: x.symbol,
                    name: x.shortname || x.longname || x.symbol,
                    sector: '—',
                    assetType: 'stock'
                }));
        }

        const cryptoHits = q.length >= 2 && local.length < 2
            ? await cryptoApi.searchCrypto(q).catch(() => [])
            : [];

        const seen = new Set();
        const candidates = [];
        [...local, ...yahooHits, ...cryptoHits.map(c => ({ symbol: c.symbol, name: c.name, assetType: 'crypto' }))].forEach(item => {
            let sym = (item.symbol || '').toUpperCase();
            if (!sym) return;
            if (cryptoApi.isCryptoSymbol(sym)) {
                /* keep */
            } else if (!sym.includes('.')) {
                sym = sym + '.NS';
            }
            if (seen.has(sym)) return;
            seen.add(sym);
            candidates.push({ ...item, symbol: sym });
        });

        if (!candidates.length) {
            let guess = q.toUpperCase().replace(/\s+/g, '');
            if (!guess.includes('.') && !cryptoApi.isCryptoSymbol(guess)) guess += '.NS';
            if (cryptoApi.isCryptoSymbol(guess) || guess.endsWith('.NS')) {
                candidates.push({ symbol: guess, name: q, assetType: cryptoApi.isCryptoSymbol(guess) ? 'crypto' : 'stock' });
            }
        }

        const stockSyms = candidates.filter(c => c.assetType !== 'crypto').map(c => c.symbol);
        const cryptoSyms = candidates.filter(c => c.assetType === 'crypto').map(c => c.symbol);

        const [stockQuotes, cryptoQuotes] = await Promise.all([
            stockSyms.length ? stocksApi.fetchStockQuotes(stockSyms, yahooFinance) : [],
            cryptoSyms.length ? cryptoApi.fetchCryptoQuotes(cryptoSyms) : []
        ]);
        const quoteMap = {};
        [...stockQuotes, ...cryptoQuotes].forEach(qu => { quoteMap[qu.symbol] = qu; });

        const results = candidates.slice(0, 8).map(c => {
            const qu = quoteMap[c.symbol];
            if (qu) return { ...c, ...qu, name: qu.name || c.name };
            return { ...c, price: 0, changePercent: 0, change: 0 };
        });

        res.json({ results, query: q });
    } catch (err) {
        console.error('Lookup error:', err.message);
        res.status(500).json({ error: err.message, results: [] });
    }
});

// GET: Search Market
app.get('/api/market/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.json([]);

    try {
        const [yahooRes, cryptoHits] = await Promise.all([
            yahooFinance.search(query, {}, { validateResult: false }).catch(() => ({ quotes: [] })),
            cryptoApi.searchCrypto(query).catch(() => [])
        ]);
        const stocks = (yahooRes.quotes || [])
            .filter(q => q.isYahooFinance && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'))
            .map(q => ({
                symbol: q.symbol,
                name: q.shortname || q.longname || q.symbol,
                exchange: q.exchange,
                type: q.quoteType,
                assetType: 'stock'
            }));
        res.json([...cryptoHits, ...stocks]);
    } catch (err) {
        console.error('Search Error:', err.message);
        res.status(500).json({ error: 'Failed', details: err.message });
    }
});

// POST: Add Custom Stock or Crypto to master list
app.post('/api/stocks', (req, res) => {
    const { symbol, name } = req.body;
    if (!symbol) return res.status(400).json({ error: 'Symbol is required' });
    try {
        const sym = symbol.toUpperCase();
        const isCrypto = cryptoApi.isCryptoSymbol(sym);
        const filePath = path.join(__dirname, isCrypto ? 'crypto.json' : 'stocks.json');
        let list = [];
        if (fs.existsSync(filePath)) {
            list = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
        const normalized = isCrypto ? cryptoApi.normalizeSymbol(sym) : sym;
        if (!list.find(s => s.symbol === normalized)) {
            const id = cryptoApi.symbolToId(normalized);
            list.push({
                symbol: normalized,
                name: name || normalized,
                ...(isCrypto && id ? { id, ticker: normalized.replace('-USD', '') } : { sector: 'Crypto' })
            });
            fs.writeFileSync(filePath, JSON.stringify(list, null, 4));
        }
        res.json({ success: true, message: isCrypto ? 'Crypto added' : 'Stock added', symbol: normalized, assetType: isCrypto ? 'crypto' : 'stock' });
    } catch (err) {
        console.error('Add Asset Error:', err.message);
        res.status(500).json({ error: 'Failed to add asset', details: err.message });
    }
});

// GET: Current Prices for symbols (stocks + crypto)
app.get('/api/market/quote', async (req, res) => {
    let symbols = req.query.symbols ? req.query.symbols.split(',') : [];
    if (symbols.length === 0) return res.json([]);

    try {
        symbols = symbols.map(s => s.trim().toUpperCase());
        const cryptoSyms = symbols.filter(cryptoApi.isCryptoSymbol);
        const stockSyms = symbols.filter(s => !cryptoApi.isCryptoSymbol(s));

        const results = await Promise.all([
            cryptoSyms.length ? cryptoApi.fetchCryptoQuotes(cryptoSyms) : [],
            stockSyms.length ? stocksApi.fetchStockQuotes(stockSyms, yahooFinance) : []
        ]);

        const cryptoQuotes = results[0] || [];
        const stockFormatted = results[1] || [];

        res.json([...stockFormatted, ...cryptoQuotes]);
    } catch (err) {
        console.error('Market quote error:', err.message);
        res.status(500).json({ error: err.message });
    }
});


// GET: Historical Chart Data for a Symbol
function generateMockHistory(symbol, days) {
    let hash = 0;
    for (let i = 0; i < symbol.length; i++) {
        hash = (hash << 5) - hash + symbol.charCodeAt(i);
        hash |= 0;
    }
    hash = Math.abs(hash);

    const basePrice = 50 + (hash % 2450) + (hash % 100) / 100;
    const volatility = 0.015 + (hash % 30) / 1000;
    const trend = ((hash % 100) - 48) / 1000;

    const results = [];
    let currentPrice = basePrice;
    
    const now = Date.now();
    const isCrypto = cryptoApi.isCryptoSymbol(symbol);

    for (let i = days; i >= 0; i--) {
        const date = new Date(now - i * 24 * 60 * 60 * 1000);
        if (!isCrypto && (date.getDay() === 0 || date.getDay() === 6)) {
            continue;
        }

        const open = currentPrice;
        const dailyChange = (Math.sin(hash + i) * volatility) + trend;
        const close = currentPrice * (1 + dailyChange);
        const high = Math.max(open, close) * (1 + Math.abs(Math.cos(hash + i)) * 0.012);
        const low = Math.min(open, close) * (1 - Math.abs(Math.sin(hash + i + 1)) * 0.012);
        
        results.push({
            date: date.toISOString(),
            open: parseFloat(open.toFixed(2)),
            high: parseFloat(high.toFixed(2)),
            low: parseFloat(low.toFixed(2)),
            close: parseFloat(close.toFixed(2)),
            volume: 50000 + (hash % 850000) + Math.floor(Math.random() * 5000)
        });
        
        currentPrice = close;
    }
    return results;
}

// GET: Historical Chart Data for a Symbol
app.get('/api/market/chart', async (req, res) => {
    let symbol = req.query.symbol;
    if (!symbol) return res.json([]);
    
    symbol = symbol.toUpperCase();
    const period = req.query.period || '1M';

    if (cryptoApi.isCryptoSymbol(symbol)) {
        try {
            const cleaned = await cryptoApi.fetchCryptoChart(symbol, period);
            return res.json(cleaned);
        } catch (err) {
            console.error(`Crypto Chart Error for ${symbol}:`, err.message);
            return res.json([]);
        }
    }

    try {
        let days = 30;
        if (period === '1W') days = 7;
        if (period === '1M') days = 30;
        if (period === '1Y') days = 365;

        let finalSymbol = symbol;
        if (!finalSymbol.includes('.')) {
            finalSymbol = finalSymbol + '.NS';
        }

        const now = new Date();
        const period1 = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
        
        let results = await yahooFinance.historical(finalSymbol, {
            period1: period1.toISOString().split('T')[0],
            interval: '1d'
        }, { validateResult: false }).catch(() => []);
        
        if (!results || results.length === 0) {
            results = generateMockHistory(finalSymbol, days);
        }

        const cleaned = (results || [])
            .filter(d => d && d.close != null)
            .map(d => ({
                date: d.date instanceof Date ? d.date.toISOString() : d.date,
                open: d.open || d.close,
                high: d.high || d.close,
                low: d.low || d.close,
                close: d.close,
                volume: d.volume || 0
            }))
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        res.json(cleaned);
    } catch (err) {
        console.error(`Chart Error for ${symbol}:`, err.message);
        res.json([]); 
    }
});

// GET: Live Prices for multiple symbols (stocks + crypto robust fetcher)
app.get('/api/market/live', async (req, res) => {
    const symbols = req.query.symbols ? req.query.symbols.split(',') : [];
    if (symbols.length === 0) return res.json([]);

    try {
        const symbolList = symbols.map(s => s.trim().toUpperCase());
        const cryptoSyms = symbolList.filter(cryptoApi.isCryptoSymbol);
        const stockSyms = symbolList.filter(s => !cryptoApi.isCryptoSymbol(s));

        const [stockQuotes, cryptoQuotes] = await Promise.all([
            stockSyms.length ? stocksApi.fetchStockQuotes(stockSyms, yahooFinance) : [],
            cryptoSyms.length ? cryptoApi.fetchCryptoQuotes(cryptoSyms) : []
        ]);

        const results = [...stockQuotes, ...cryptoQuotes].map(q => ({
            symbol: q.symbol,
            price: q.price,
            change: q.changePercent || 0,
            name: q.name || q.symbol
        }));

        res.json(results);
    } catch (err) {
        console.error('Live Price Error:', err.message);
        res.json([]); // Return empty on error to prevent frontend crash
    }
});

const CATEGORIES = [
    "FII (Foreign Institutional)",
    "DII (Domestic Institutional)",
    "Retail",
    "HNI (High Net Worth)",
];
const BASE_WEIGHTS = [0.32, 0.28, 0.28, 0.12];

function jsClamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function moneyFlowBar(day) {
    const o = day.open;
    const h = day.high;
    const l = day.low;
    const c = day.close;
    const v = day.volume || 0;
    
    if (o == null || h == null || l == null || c == null || v <= 0) {
        return 0.0;
    }
    const rng = h - l;
    let mfm = 0.0;
    if (rng > 0) {
        mfm = ((c - l) - (h - c)) / rng;
    }
    return (mfm * v * c) / 1e7;
}

function deterministicSeed(symbol) {
    let hash = 0;
    for (let i = 0; i < symbol.length; i++) {
        hash = (hash << 5) - hash + symbol.charCodeAt(i);
        hash |= 0;
    }
    hash = Math.abs(hash);
    return (hash % 1000) / 1000;
}

function jsAnalyze(symbol, market = {}) {
    const quote = market.quote || {};
    const history = market.history || [];

    const dailyFlows = [];
    for (const d of history) {
        if (d && d.close != null) {
            dailyFlows.push({
                date: String(d.date || "").slice(0, 10),
                flow: parseFloat(moneyFlowBar(d).toFixed(2))
            });
        }
    }

    let totalInflow = 0.0;
    let totalOutflow = 0.0;
    if (dailyFlows.length > 0) {
        for (const f of dailyFlows) {
            if (f.flow >= 0) {
                totalInflow += f.flow;
            } else {
                totalOutflow += Math.abs(f.flow);
            }
        }
    }

    let momentum = 0.0;
    let volTrend = 0.0;
    if (history.length >= 2) {
        const closes = history.filter(h => h && h.close != null).map(h => h.close);
        const vols = history.map(h => h.volume || 0);
        if (closes.length >= 2) {
            momentum = closes[0] ? ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100 : 0;
        }
        if (vols.length >= 4) {
            const recent = vols.slice(-3).reduce((a, b) => a + b, 0) / 3;
            const older = vols.length >= 6 
                ? vols.slice(0, 3).reduce((a, b) => a + b, 0) / 3 
                : vols.slice(0, -3).reduce((a, b) => a + b, 0) / Math.max(vols.length - 3, 1);
            volTrend = older ? ((recent - older) / older) * 100 : 0;
        }
    }

    const changePct = quote.changePercent || 0;
    const marketCap = quote.marketCap || 0;

    const capFactor = jsClamp((marketCap || 5e11) / 1e12, 0.2, 1.0);
    const weights = [...BASE_WEIGHTS];
    weights[0] += 0.08 * capFactor;
    weights[1] += 0.06 * capFactor;
    weights[3] += 0.05 * jsClamp(Math.abs(momentum) / 10, 0, 1);
    weights[2] -= 0.06 * capFactor;
    
    const wSum = weights.reduce((a, b) => a + b, 0);
    const normalizedWeights = weights.map(w => w / wSum);

    let netTotal = totalInflow - totalOutflow;
    if (netTotal === 0 && dailyFlows.length > 0) {
        netTotal = dailyFlows.reduce((a, b) => a + b.flow, 0);
    }

    if (dailyFlows.length === 0) {
        const seed = deterministicSeed(symbol);
        netTotal = (seed - 0.5) * 400;
        totalInflow = Math.abs(netTotal) + 120 + seed * 200;
        totalOutflow = totalInflow - netTotal;
    }

    const summary = [];
    for (let i = 0; i < CATEGORIES.length; i++) {
        const cat = CATEGORIES[i];
        const share = normalizedWeights[i];
        const inf = Math.max(0, totalInflow * share);
        const out = Math.max(0, totalOutflow * share * (0.85 + 0.15 * (1 - share)));
        summary.push({
            category: cat,
            inflow: parseFloat(inf.toFixed(2)),
            outflow: parseFloat(out.toFixed(2)),
            net: parseFloat((inf - out).toFixed(2))
        });
    }

    if (dailyFlows.length === 0) {
        const baseDate = new Date();
        for (let i = 0; i < 10; i++) {
            const dStr = new Date(baseDate.getTime() - (9 - i) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            const s = deterministicSeed(symbol + dStr);
            dailyFlows.push({ date: dStr, flow: parseFloat(((s - 0.48) * 180).toFixed(2)) });
        }
    }

    const flowBias = jsClamp(netTotal / 50, -1, 1) * 25;
    const momScore = jsClamp(momentum, -15, 15) * 1.2;
    const volScore = jsClamp(volTrend, -30, 30) * 0.4;
    const chgScore = jsClamp(changePct, -8, 8) * 2.5;
    const aiScore = parseFloat(jsClamp(62 + flowBias + momScore + volScore + chgScore, 35, 98).toFixed(1));

    const signal = aiScore >= 70 ? "BULLISH" : (aiScore < 45 ? "BEARISH" : "NEUTRAL");

    return {
        symbol: symbol,
        summary: summary,
        history: dailyFlows.slice(-14),
        ai_score: aiScore,
        signal: signal,
        metrics: {
            net_flow_cr: parseFloat(netTotal.toFixed(2)),
            momentum_pct: parseFloat(momentum.toFixed(2)),
            volume_trend_pct: parseFloat(volTrend.toFixed(2)),
            change_pct: parseFloat(changePct.toFixed(2))
        }
    };
}

// GET: Python-Powered Institutional Inflow Analysis (Yahoo data → Python with instant JS fallback)
app.get('/api/market/analysis', async (req, res) => {
    const { spawn } = require('child_process');
    const symbol = (req.query.symbol || 'RELIANCE.NS').toUpperCase();

    let quote = null;
    let history = [];
    try {
        if (cryptoApi.isCryptoSymbol(symbol)) {
            const cq = await cryptoApi.fetchCryptoQuotes([symbol]);
            if (cq[0]) {
                quote = {
                    regularMarketPrice: cq[0].price,
                    regularMarketChangePercent: cq[0].changePercent,
                    regularMarketVolume: cq[0].volume,
                    marketCap: cq[0].marketCap,
                    shortName: cq[0].name
                };
            }
            history = await cryptoApi.fetchCryptoChart(symbol, '1M');
            if (history.length) {
                history = history.map(d => ({
                    date: d.date,
                    open: d.open,
                    high: d.high,
                    low: d.low,
                    close: d.close,
                    volume: d.volume || 0
                }));
            }
        } else {
            let finalSymbol = symbol;
            if (!finalSymbol.includes('.')) {
                finalSymbol = finalSymbol + '.NS';
            }
            quote = await yahooFinance.quote(finalSymbol, {}, { validateResult: false }).catch(() => null);
            const period1 = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
            history = await yahooFinance.historical(finalSymbol, {
                period1: period1.toISOString().split('T')[0],
                interval: '1d'
            }, { validateResult: false }).catch(() => []);
            
            // If history fails to fetch from Yahoo, use the deterministic generator
            if (!history || history.length === 0) {
                history = generateMockHistory(finalSymbol, 45);
            }
            if (!quote && history.length > 0) {
                const lastDay = history[history.length - 1];
                quote = {
                    regularMarketPrice: lastDay.close,
                    regularMarketChangePercent: ((lastDay.close - history[0].close) / history[0].close) * 100,
                    regularMarketVolume: lastDay.volume,
                    marketCap: lastDay.close * 100000000,
                    shortName: symbol
                };
            }
        }
    } catch (err) {
        console.error('Analysis prefetch:', err.message);
    }

    const theme = req.query.theme || 'dark';
    const payload = JSON.stringify({
        symbol,
        quote: quote ? {
            price: quote.regularMarketPrice,
            changePercent: quote.regularMarketChangePercent || 0,
            volume: quote.regularMarketVolume || 0,
            marketCap: quote.marketCap || 0,
            name: quote.shortName || quote.longName || symbol
        } : null,
        history: (history || []).map(d => ({
            date: d.date instanceof Date ? d.date.toISOString().split('T')[0] : d.date,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
            volume: d.volume || 0
        })),
        theme
    });

    const scriptPath = path.join(__dirname, 'analysis.py');
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    let pythonProcess;
    
    try {
        pythonProcess = spawn(pythonCmd, [scriptPath, symbol], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (spawnErr) {
        console.warn('Direct spawn error, executing JS fallback analysis:', spawnErr.message);
        return runJsFallback();
    }

    let resultData = '';
    let stderrData = '';

    pythonProcess.on('error', (err) => {
        console.warn('Python execution error, running pure Javascript fallback analysis:', err.message);
        runJsFallback();
    });

    pythonProcess.stdin.write(payload);
    pythonProcess.stdin.end();

    pythonProcess.stdout.on('data', (data) => { resultData += data.toString(); });
    pythonProcess.stderr.on('data', (data) => { stderrData += data.toString(); });

    pythonProcess.on('close', (code) => {
        if (code !== 0) {
            console.warn('Python analysis non-zero code, running JS fallback...');
            return runJsFallback();
        }
        try {
            const jsonResult = JSON.parse(resultData.trim());
            if (quote) jsonResult.quote = {
                symbol,
                name: quote.shortName || quote.longName || symbol,
                price: quote.regularMarketPrice,
                changePercent: quote.regularMarketChangePercent || 0
            };
            res.json(jsonResult);
        } catch (err) {
            runJsFallback();
        }
    });

    function runJsFallback() {
        try {
            const jsResult = jsAnalyze(symbol, { quote, history });
            if (quote) jsResult.quote = {
                symbol,
                name: quote.shortName || quote.longName || symbol,
                price: quote.regularMarketPrice,
                changePercent: quote.regularMarketChangePercent || 0
            };
            res.json(jsResult);
        } catch (jsErr) {
            console.error('JS Fallback failed:', jsErr.message);
            res.status(500).json({ error: 'Fallback analysis failed', details: jsErr.message });
        }
    }
});

// GET: Market Screener (Bull/Bear) - Focused on Indian Market
app.get('/api/market/screener', async (req, res) => {
    try {
        // Fetch Indian Day Gainers/Losers
        // Yahoo screeners for India: 'day_gainers_india', 'day_losers_india'
        const [gainers, losers, active] = await Promise.all([
            yahooFinance.screener({ scrIds: 'day_gainers', count: 50 }, { validateResult: false }).catch(() => ({ quotes: [] })),
            yahooFinance.screener({ scrIds: 'day_losers', count: 50 }, { validateResult: false }).catch(() => ({ quotes: [] })),
            yahooFinance.screener({ scrIds: 'most_actives', count: 50 }, { validateResult: false }).catch(() => ({ quotes: [] }))
        ]);
        
        const formatQuote = (q, type) => ({
            symbol: q.symbol,
            name: q.shortName || q.longName || q.symbol,
            price: q.regularMarketPrice || 0,
            change: q.regularMarketChange || 0,
            changePercent: q.regularMarketChangePercent || 0,
            volume: q.regularMarketVolume || 0,
            marketCap: q.marketCap || 0,
            type: type 
        });

        let bulls = (gainers.quotes || []).filter(q => q.regularMarketPrice).map(q => formatQuote(q, 'bull'));
        let bears = (losers.quotes || []).filter(q => q.regularMarketPrice).map(q => formatQuote(q, 'bear'));
        let actives = (active.quotes || []).filter(q => q.regularMarketPrice).map(q => formatQuote(q, 'active'));

        // Fallback: If Indian screener fails, use top Nifty stocks
        if (bulls.length === 0 && bears.length === 0) {
            const niftyTop = ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'ICICIBANK.NS', 'INFY.NS', 'BHARTIARTL.NS', 'SBIN.NS', 'ITC.NS', 'LT.NS', 'AXISBANK.NS'];
            const quotes = await yahooFinance.quote(niftyTop);
            bulls = quotes.map(q => formatQuote(q, 'bull'));
        }
        
        res.json({ bulls, bears, actives });
    } catch (err) {
        console.error('Screener Error:', err.message);
        res.status(500).json({ error: 'Failed to fetch screener data', details: err.message });
    }
});

// --- STOCKS / COMPANIES (600+ NSE, Yahoo live prices) ---
app.get('/api/stocks/catalog', (req, res) => {
    try {
        const stocks = stocksApi.loadCatalog();
        res.json({
            total: stocks.length,
            sectors: stocksApi.getSectors(stocks)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/stocks/hub', async (req, res) => {
    try {
        res.json(await stocksApi.getStocksHub(yahooFinance));
    } catch (err) {
        console.error('Stocks hub:', err.message);
        res.status(500).json({ error: 'Failed to load stock market data' });
    }
});

app.get('/api/stocks/page', async (req, res) => {
    try {
        const data = await stocksApi.getStocksPage(yahooFinance, {
            page: req.query.page,
            limit: req.query.limit,
            sector: req.query.sector,
            q: req.query.q,
            sort: req.query.sort
        });
        res.json(data);
    } catch (err) {
        console.error('Stocks page:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- CRYPTO (Binance + CoinGecko fallback, free) ---
app.get('/api/crypto/hub', async (req, res) => {
    try {
        res.json(await cryptoApi.fetchCryptoHub());
    } catch (err) {
        console.error('Crypto hub:', err.message);
        const fallback = cryptoApi.getDefaultOverview();
        res.json({
            ...fallback,
            quotes: await cryptoApi.fetchCryptoQuotes(['BTC-USD', 'ETH-USD', 'SOL-USD']).catch(() => []),
            catalog: cryptoApi.loadCatalog()
        });
    }
});

app.get('/api/crypto/list', async (req, res) => {
    try {
        const perPage = Math.min(parseInt(req.query.limit, 10) || 50, 100);
        res.json(await cryptoApi.fetchTopMarkets(perPage));
    } catch (err) {
        res.json(cryptoApi.loadCatalog().slice(0, 25));
    }
});

app.get('/api/crypto/overview', async (req, res) => {
    try {
        const hub = await cryptoApi.fetchCryptoHub();
        res.json({ global: hub.global, btc: hub.btc, eth: hub.eth });
    } catch (err) {
        res.json(cryptoApi.getDefaultOverview());
    }
});

app.get('/api/crypto/quote', async (req, res) => {
    const symbols = req.query.symbols ? req.query.symbols.split(',').map(s => s.trim()) : [];
    if (!symbols.length) return res.json([]);
    try {
        res.json(await cryptoApi.fetchCryptoQuotes(symbols));
    } catch (err) {
        res.json([]);
    }
});

app.get('/api/crypto/chart', async (req, res) => {
    const symbol = req.query.symbol;
    if (!symbol) return res.json([]);
    try {
        res.json(await cryptoApi.fetchCryptoChart(symbol, req.query.period || '1M'));
    } catch (err) {
        res.json([]);
    }
});

app.get('/api/crypto/search', async (req, res) => {
    try {
        res.json(await cryptoApi.searchCrypto(req.query.q || ''));
    } catch (err) {
        res.json([]);
    }
});

app.get('/api/crypto/screener', async (req, res) => {
    try {
        const markets = await cryptoApi.fetchTopMarkets(50);
        const sorted = [...markets].sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0));
        res.json({
            bulls: sorted.filter(m => (m.changePercent || 0) > 0).slice(0, 15),
            bears: sorted.filter(m => (m.changePercent || 0) < 0).slice(0, 15).reverse(),
            actives: [...markets].sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 15)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET: Legacy Live Market Data Wrapper (Removed duplicate; consolidated into the main robust /api/market/live endpoint)



// GET: Real Portfolio Trend
app.get('/api/portfolio/trend', async (req, res) => {
    try {
        const holdings = await db.all('SELECT * FROM holdings');
        const walletRow = await db.get('SELECT balance FROM wallet WHERE id = 1');
        const wallet = walletRow ? walletRow.balance : 0;
        
        let currentValue = 0;
        let invested = 0;

        if (holdings.length > 0) {
            const symbols = holdings.map(h => h.symbol);
            const quoteMap = await cryptoApi.getPricesForHoldings(symbols, yahooFinance);

            holdings.forEach(h => {
                invested += (h.qty * h.cost);
                const ltp = quoteMap[h.symbol] || h.ltp || h.cost;
                currentValue += (h.qty * ltp);
            });
        }

        const netWorth = wallet + currentValue;
        const pnl = currentValue - invested;

        const today = new Date().toISOString().split('T')[0];
        
        await db.run(
            `INSERT INTO portfolio_history (date, net_worth, pnl) 
             VALUES (?, ?, ?)
             ON CONFLICT(date) DO UPDATE SET net_worth=excluded.net_worth, pnl=excluded.pnl`,
            [today, netWorth, pnl]
        );

        let history = await db.all('SELECT * FROM portfolio_history ORDER BY date ASC');
        const byDate = {};
        history.forEach(h => { byDate[h.date] = h; });

        const series = [];
        let lastNw = netWorth;
        let lastPnl = pnl;
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const row = byDate[dateStr];
            if (row) {
                lastNw = row.net_worth;
                lastPnl = row.pnl;
            }
            series.push({
                date: dateStr,
                net_worth: row ? row.net_worth : lastNw,
                pnl: row ? row.pnl : lastPnl
            });
        }
        res.json(series);
    } catch (err) {
        console.error('Portfolio Trend Error:', err.message);
        res.status(500).json({ error: 'Failed to fetch trend', details: err.message });
    }
});


// GET: All Holdings
app.get('/api/holdings', async (req, res) => {
    try {
        const holdings = await db.all('SELECT * FROM holdings');
        res.json(holdings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Add Stock
app.post('/api/holdings', async (req, res) => {
    const { symbol, name, qty, cost, ltp } = req.body;
    try {
        const result = await db.run(
            'INSERT INTO holdings (symbol, name, qty, cost, ltp) VALUES (?, ?, ?, ?, ?)',
            [symbol, name, qty, cost, ltp]
        );
        res.status(201).json({ id: result.lastID, symbol, name, qty, cost, ltp });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE: Remove Stock
app.delete('/api/holdings/:id', async (req, res) => {
    try {
        await db.run('DELETE FROM holdings WHERE id = ?', [req.params.id]);
        res.json({ message: 'Stock deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- HISTORY ENDPOINTS ---

// GET: All History
app.get('/api/history', async (req, res) => {
    try {
        const history = await db.all('SELECT * FROM history ORDER BY date DESC');
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Add History Entry
app.post('/api/history', async (req, res) => {
    const { type, symbol, name, qty, price, total } = req.body;
    try {
        const result = await db.run(
            'INSERT INTO history (type, symbol, name, qty, price, total) VALUES (?, ?, ?, ?, ?, ?)',
            [type, symbol, name, qty, price, total]
        );
        res.status(201).json({ id: result.lastID, type, symbol, name, qty, price, total, date: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE: Remove History Entry
app.delete('/api/history/:id', async (req, res) => {
    try {
        await db.run('DELETE FROM history WHERE id = ?', [req.params.id]);
        res.json({ message: 'History entry deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE: Clear All History
app.delete('/api/history', async (req, res) => {
    try {
        await db.run('DELETE FROM history');
        res.json({ message: 'All history cleared' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET: Wallet Balance
app.get('/api/wallet', async (req, res) => {
    try {
        const wallet = await db.get('SELECT balance FROM wallet WHERE id = 1');
        res.json(wallet);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Incremental Wallet Update (Add/Subtract) - saves to history
app.post('/api/wallet/transaction', async (req, res) => {
    const { amount } = req.body; // positive = deposit, negative = withdraw
    if (amount === undefined || isNaN(amount)) return res.status(400).json({ error: 'Invalid amount' });

    try {
        // Check sufficient funds for withdrawal
        if (amount < 0) {
            const current = await db.get('SELECT balance FROM wallet WHERE id = 1');
            if (current.balance + amount < 0) {
                return res.status(400).json({ error: `Insufficient balance. Available: ₹${current.balance.toFixed(2)}` });
            }
        }

        // Update wallet balance
        await db.run('UPDATE wallet SET balance = balance + ? WHERE id = 1', [amount]);
        const updated = await db.get('SELECT balance FROM wallet WHERE id = 1');

        // Record in history table
        const txType = amount >= 0 ? 'DEPOSIT' : 'WITHDRAW';
        const txLabel = amount >= 0 ? 'Funds Deposited' : 'Funds Withdrawn';
        const txAmt = Math.abs(amount);
        await db.run(
            'INSERT INTO history (type, symbol, name, qty, price, total, date) VALUES (?, ?, ?, ?, ?, ?, datetime("now"))',
            [txType, null, txLabel, 1, txAmt, txAmt]
        );

        res.json(updated);
    } catch (err) {
        console.error(`Wallet Transaction Error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});


// --- PROFILE ENDPOINTS ---
// GET: Profile details
app.get('/api/profile', async (req, res) => {
    try {
        const profile = await db.get('SELECT * FROM profile WHERE id = 1');
        res.json(profile);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Update Profile
app.post('/api/profile', async (req, res) => {
    const { username, bio, avatar } = req.body;
    try {
        await db.run(
            'UPDATE profile SET username = ?, bio = ?, avatar = ? WHERE id = 1',
            [username, bio, avatar]
        );
        const updated = await db.get('SELECT * FROM profile WHERE id = 1');
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT: Set Wallet Balance (Override - for backward compatibility or direct set)
app.put('/api/wallet', async (req, res) => {
    const { balance } = req.body;
    try {
        await db.run('UPDATE wallet SET balance = ? WHERE id = 1', [balance]);
        res.json({ balance });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- POSITIONS ---
app.get('/api/positions', async (req, res) => {
    try {
        const positions = await db.all("SELECT * FROM positions");
        res.json(positions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- TRADE EXECUTION ENGINE ---
app.post('/api/trade/execute', async (req, res) => {
    const { symbol, qty, type, price } = req.body;
    const total = qty * price;

    try {
        // 1. Check Wallet for BUY
        if (type === 'BUY') {
            const wallet = await db.get('SELECT balance FROM wallet WHERE id = 1');
            if (wallet.balance < total) return res.status(400).json({ error: 'Insufficient Margin' });
            
            // Deduct from wallet
            await db.run('UPDATE wallet SET balance = balance - ? WHERE id = 1', [total]);
            
            // Add/Update Holdings
            const existing = await db.get('SELECT * FROM holdings WHERE symbol = ?', [symbol]);
            if (existing) {
                const newQty = existing.qty + qty;
                const newCost = ((existing.qty * existing.cost) + (qty * price)) / newQty;
                await db.run('UPDATE holdings SET qty = ?, cost = ?, ltp = ? WHERE symbol = ?', [newQty, newCost, price, symbol]);
            } else {
                await db.run('INSERT INTO holdings (symbol, name, qty, cost, ltp) VALUES (?, ?, ?, ?, ?)', [symbol, symbol, qty, price, price]);
            }
        } 
        // 2. Handle SELL
        else if (type === 'SELL') {
            const existing = await db.get('SELECT * FROM holdings WHERE symbol = ?', [symbol]);
            if (!existing || existing.qty < qty) return res.status(400).json({ error: 'Insufficient Holdings' });
            
            // Add to wallet
            await db.run('UPDATE wallet SET balance = balance + ? WHERE id = 1', [total]);
            
            // Deduct/Remove from Holdings
            if (existing.qty === qty) {
                await db.run('DELETE FROM holdings WHERE symbol = ?', [symbol]);
            } else {
                await db.run('UPDATE holdings SET qty = qty - ? WHERE symbol = ?', [qty, symbol]);
            }
        }

        // 3. Log to History
        await db.run('INSERT INTO history (type, symbol, name, qty, price, total, date) VALUES (?, ?, ?, ?, ?, ?, ?)', 
            [type, symbol, symbol, qty, price, total, new Date().toISOString()]);

        res.json({ success: true, message: 'Order Executed Successfully' });
    } catch (err) {
        console.error('Trade Execution Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- LEADERBOARD ---
app.get('/api/leaderboard', async (req, res) => {
    try {
        const board = await db.all("SELECT * FROM leaderboard ORDER BY profitPerc DESC");
        res.json(board);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- CHALLENGES ---
app.get('/api/challenges', async (req, res) => {
    try {
        const data = await db.all("SELECT * FROM challenges");
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
