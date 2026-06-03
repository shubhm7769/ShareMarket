const yahooFinance = require('yahoo-finance2').default;

async function test() {
    try {
        console.log("Fetching trending...");
        const trending = await yahooFinance.trendingSymbols('IN');
        console.log("Trending:", trending.quotes.map(q => q.symbol).slice(0, 5));

        console.log("Fetching gainers...");
        const gainers = await yahooFinance.screener({ scrIds: 'day_gainers', count: 5 });
        console.log("Gainers:", gainers.quotes.map(q => q.symbol));
        
    } catch (e) {
        console.error("Error:", e);
    }
}
test();
