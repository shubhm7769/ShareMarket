const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

// Removed duplicate declaration

async function initDb() {
    const db = await open({
        filename: path.join(__dirname, 'portfolio.db'),
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS holdings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT,
            name TEXT NOT NULL,
            qty REAL NOT NULL,
            cost REAL NOT NULL,
            ltp REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS wallet (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            balance REAL DEFAULT 100000
        );

        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            symbol TEXT,
            name TEXT NOT NULL,
            qty REAL NOT NULL,
            price REAL NOT NULL,
            total REAL NOT NULL,
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );


        CREATE TABLE IF NOT EXISTS profile (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            username TEXT DEFAULT 'Shubham Kumar',
            bio TEXT DEFAULT 'Pro Account',
            avatar TEXT DEFAULT 'SK'
        );

        CREATE TABLE IF NOT EXISTS positions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT,
            name TEXT NOT NULL,
            qty REAL NOT NULL,
            avgPrice REAL NOT NULL,
            ltp REAL NOT NULL,
            pnl REAL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS leaderboard (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            avatar TEXT,
            profitPerc REAL NOT NULL,
            trades INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS challenges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            goal REAL NOT NULL,
            current REAL DEFAULT 0,
            daysRemaining INTEGER NOT NULL,
            status TEXT DEFAULT 'Active'
        );

        CREATE TABLE IF NOT EXISTS portfolio_history (
            date DATE PRIMARY KEY,
            net_worth REAL NOT NULL,
            pnl REAL NOT NULL
        );
    `);

    // Seed New Tables
    await db.exec(`
        INSERT OR IGNORE INTO leaderboard (id, username, avatar, profitPerc, trades) VALUES (1, 'Rakesh J.', 'RJ', 245.5, 120);
        INSERT OR IGNORE INTO leaderboard (id, username, avatar, profitPerc, trades) VALUES (2, 'Radha K.', 'RK', 182.1, 85);
        INSERT OR IGNORE INTO leaderboard (id, username, avatar, profitPerc, trades) VALUES (3, 'Shubham', 'SK', 156.4, 45);
        INSERT OR IGNORE INTO leaderboard (id, username, avatar, profitPerc, trades) VALUES (4, 'Vijay K.', 'VK', 94.2, 210);

        INSERT OR IGNORE INTO challenges (id, title, goal, current, daysRemaining) VALUES (1, '₹10k Profit Sprint', 10000, 4500, 12);
        INSERT OR IGNORE INTO challenges (id, title, goal, current, daysRemaining) VALUES (2, 'Accuracy King', 100, 75, 5);
    `);

    // --- SELF-HEALING: Add missing columns if database was created with an older schema ---
    try {
        const holdingsCols = await db.all("PRAGMA table_info(holdings)");
        if (!holdingsCols.some(c => c.name === 'symbol')) {
            console.log("🛠️ Repairing database: Adding 'symbol' column to 'holdings'...");
            await db.exec("ALTER TABLE holdings ADD COLUMN symbol TEXT");
        }

        const historyCols = await db.all("PRAGMA table_info(history)");
        if (!historyCols.some(c => c.name === 'symbol')) {
            console.log("🛠️ Repairing database: Adding 'symbol' column to 'history'...");
            await db.exec("ALTER TABLE history ADD COLUMN symbol TEXT");
        }
    } catch (err) {
        console.error("❌ Database Repair Failed:", err.message);
    }

    // --- SELF-HEALING: Add new table if it doesn't exist (just in case the above didn't catch it)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS portfolio_history (
            date DATE PRIMARY KEY,
            net_worth REAL NOT NULL,
            pnl REAL NOT NULL
        );
    `);

    // Seed Data (using INSERT OR IGNORE to prevent duplicates)
    await db.exec(`
        INSERT OR IGNORE INTO wallet (id, balance) VALUES (1, 150000.50);
        INSERT OR IGNORE INTO profile (id, username, bio, avatar) VALUES (1, 'Shubham Kumar', 'Pro Account', 'SK');
        
        -- Seed Dummy Data for Holdings
        INSERT OR IGNORE INTO holdings (id, symbol, name, qty, cost, ltp) VALUES (1, 'RELIANCE.NS', 'Reliance Industries Ltd', 100, 2850.40, 2920.00);
        INSERT OR IGNORE INTO holdings (id, symbol, name, qty, cost, ltp) VALUES (2, 'TCS.NS', 'Tata Consultancy Services', 50, 3920.15, 4010.50);
        INSERT OR IGNORE INTO holdings (id, symbol, name, qty, cost, ltp) VALUES (3, 'INFY.NS', 'Infosys Ltd', 80, 1450.00, 1420.00);
        INSERT OR IGNORE INTO holdings (id, symbol, name, qty, cost, ltp) VALUES (4, 'ZOMATO.NS', 'Zomato Ltd', 500, 160.00, 188.40);
        INSERT OR IGNORE INTO holdings (id, symbol, name, qty, cost, ltp) VALUES (5, 'HDFCBANK.NS', 'HDFC Bank Ltd', 200, 1420.00, 1510.00);
        INSERT OR IGNORE INTO holdings (id, symbol, name, qty, cost, ltp) VALUES (6, 'BTC-USD', 'Bitcoin', 0.05, 5200000.00, 5800000.00);
        INSERT OR IGNORE INTO holdings (id, symbol, name, qty, cost, ltp) VALUES (7, 'ETH-USD', 'Ethereum', 0.5, 280000.00, 295000.00);
        
        -- Seed Dummy Data for History
        INSERT OR IGNORE INTO history (id, type, symbol, name, qty, price, total, date) VALUES (10, 'DEPOSIT', NULL, 'Capital Infusion', 1, 500000.00, 500000.00, datetime('now', '-10 days'));
        INSERT OR IGNORE INTO history (id, type, symbol, name, qty, price, total, date) VALUES (11, 'BUY', 'RELIANCE.NS', 'Reliance Industries Ltd', 100, 2850.40, 285040.00, datetime('now', '-5 days'));
        INSERT OR IGNORE INTO history (id, type, symbol, name, qty, price, total, date) VALUES (12, 'BUY', 'TCS.NS', 'Tata Consultancy Services', 50, 3920.15, 196007.50, datetime('now', '-4 days'));
        INSERT OR IGNORE INTO history (id, type, symbol, name, qty, price, total, date) VALUES (13, 'SELL', 'ZOMATO.NS', 'Zomato Ltd', 1000, 185.30, 185300.00, datetime('now', '-2 days'));
        INSERT OR IGNORE INTO history (id, type, symbol, name, qty, price, total, date) VALUES (14, 'BUY', 'INFY.NS', 'Infosys Ltd', 80, 1450.00, 116000.00, datetime('now', '-1 days'));

        -- Seed Dummy Data for Positions (Intraday)
        INSERT OR IGNORE INTO positions (id, symbol, name, qty, avgPrice, ltp, pnl) VALUES (1, 'SBIN.NS', 'State Bank of India', 500, 780.20, 792.40, 6100.00);
        INSERT OR IGNORE INTO positions (id, symbol, name, qty, avgPrice, ltp, pnl) VALUES (2, 'TATAMOTORS.NS', 'Tata Motors Ltd', 100, 980.00, 1012.50, 3250.00);
        INSERT OR IGNORE INTO positions (id, symbol, name, qty, avgPrice, ltp, pnl) VALUES (3, 'ADANIENT.NS', 'Adani Enterprises Ltd', 50, 3120.00, 3155.00, 1750.00);
    `);


    return db;
}

module.exports = { initDb };
