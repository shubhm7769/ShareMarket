const fs = require('fs');
const https = require('https');
const path = require('path');

const targetFile = path.join(__dirname, '..', 'stocks.json');

// Existing stocks to preserve
let existingStocks = [];
try {
    existingStocks = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
} catch (e) {
    console.error("Could not read existing stocks. Starting fresh.");
}

const existingSymbols = new Set(existingStocks.map(s => s.symbol));

const url = 'https://raw.githubusercontent.com/akashgiri/stocks-list/master/nse-listed-stocks.json';

console.log("Fetching real stocks list...");

https.get(url, (res) => {
    let data = '';
    
    if (res.statusCode !== 200) {
        console.error(`Failed to fetch stocks. Status Code: ${res.statusCode}`);
        process.exit(1);
    }

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const rawStocks = JSON.parse(data);
            const newStocks = [];
            
            // rawStocks is an object: { "Company Name": "SYMBOL", ... }
            for (const [name, symbolRaw] of Object.entries(rawStocks)) {
                // Ensure it has .NS suffix for Yahoo Finance
                const symbol = symbolRaw.endsWith('.NS') ? symbolRaw : `${symbolRaw}.NS`;
                
                if (!existingSymbols.has(symbol)) {
                    newStocks.push({
                        symbol: symbol,
                        name: name,
                        sector: "Equities" // Default sector
                    });
                    existingSymbols.add(symbol);
                }
            }
            
            // Merge existing with new
            const combined = [...existingStocks, ...newStocks];
            
            // Take up to 600 to meet the user's request, ensuring existing stocks are kept
            const finalStocks = combined.slice(0, Math.max(600, existingStocks.length + 418));
            
            fs.writeFileSync(targetFile, JSON.stringify(finalStocks, null, 4));
            console.log(`Successfully added stocks! Total stocks now: ${finalStocks.length}`);
            console.log("Please restart your server (npm start) for changes to take effect.");
            
        } catch (e) {
            console.error("Error parsing JSON data: ", e.message);
        }
    });
}).on('error', (err) => {
    console.error('Error fetching data:', err.message);
});
