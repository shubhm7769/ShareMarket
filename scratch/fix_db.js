const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function fix() {
    const db = await open({
        filename: path.join(__dirname, '..', 'portfolio.db'),
        driver: sqlite3.Database
    });

    try {
        console.log('Checking holdings table...');
        const columns = await db.all('PRAGMA table_info(holdings)');
        const hasSymbol = columns.some(c => c.name === 'symbol');
        
        if (!hasSymbol) {
            console.log('Adding symbol column to holdings table...');
            await db.exec('ALTER TABLE holdings ADD COLUMN symbol TEXT');
            console.log('Column added.');
        } else {
            console.log('Symbol column already exists.');
        }

        console.log('Checking history table...');
        const historyColumns = await db.all('PRAGMA table_info(history)');
        const historyHasSymbol = historyColumns.some(c => c.name === 'symbol');
        
        if (!historyHasSymbol) {
            console.log('Adding symbol column to history table...');
            await db.exec('ALTER TABLE history ADD COLUMN symbol TEXT');
            console.log('Column added to history.');
        } else {
            console.log('Symbol column already exists in history.');
        }

    } catch (err) {
        console.error('Error fixing database:', err);
    } finally {
        await db.close();
    }
}

fix();
