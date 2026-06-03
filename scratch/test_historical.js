const yahooFinance = require('yahoo-finance2').default;

async function test() {
    try {
        const symbol = 'RELIANCE.NS';
        const period1 = new Date();
        period1.setDate(period1.getDate() - 30);
        
        const results = await yahooFinance.historical(symbol, {
            period1: period1.toISOString().split('T')[0],
            interval: '1d'
        }, { validateResult: false });
        
        console.log(JSON.stringify(results.slice(0, 2), null, 2));
    } catch (err) {
        console.error(err);
    }
}

test();
