import dotenv from 'dotenv'
dotenv.config()
import express from 'express'
import bodyParser from 'body-parser'
import cron from 'node-cron'
import db from './config/db.js'
import axios from 'axios'
import Log from './models/Logs.js'
import mongoose from "mongoose";

import {
    calculateInventory,
    createLog
} from './controllers/logController.js'
import { fetchAndStoreItems } from './controllers/itemController.js'
import { createSnapshot } from './controllers/snapshotController.js'

await db()

const app = express()
app.use(bodyParser.json())

// ---------- Helper: Logs holen ----------
const getLogs = async () => {
    const logCats = [1225, 1226, 1112, 1113]
    for (let cat of logCats) {
        try {
            const res = await axios.get(
                `https://api.torn.com/v2/user/log?log=${cat}`,
                {
                    headers: { Authorization: `ApiKey ${process.env.TORN_API_KEY}` }
                }
            )

            if (res.data.error) {
                console.log('❌ Torn API Error:', res.data.error)
                continue
            }

            for (const log of res.data.log) {
                await createLog(log)
            }
        } catch (err) {
            console.error('❌ Fehler beim Abrufen von Logs:', err.message)
        }
    }

    console.log('✅ Logs updated successfully.')
}

// ---------- Express Routes ----------

// GET /inventory → aktuelles Inventar berechnen
app.get('/inventory', async (req, res) => {
    try {
        const inv = await calculateInventory()
        res.json(inv)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Fehler beim Berechnen des Inventars' })
    }
})

// POST /logs → Logs abrufen & speichern
app.post('/logs', async (req, res) => {
    try {
        await getLogs()
        res.json({ message: 'Logs updated successfully' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Fehler beim Aktualisieren der Logs' })
    }
})

// POST /inventory → neuen Snapshot speichern
app.post('/inventory', async (req, res) => {
    try {
        const items = req.body // erwartet { "286": 1, "287": 15 }
        await createSnapshot(items)
        res.json({ message: 'Snapshot gespeichert' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Fehler beim Erstellen des Snapshots' })
    }
})

// ---------- Cronjobs ----------

// Jede Minute → Logs abrufen
cron.schedule('* * * * *', async () => {
    console.log('⏱ Running getLogs() via cron...')
    await getLogs()
})

// Jeden Tag um 03:00 UTC → Items aktualisieren
cron.schedule('0 3 * * *', async () => {
    console.log('⏱ Running fetchAndStoreItems() via cron...')
    await fetchAndStoreItems()
})

// ---------- Daily Profit (FIFO, 30 Tage, heute zuerst) ----------
app.get("/daily-profit", async (req, res) => {
    try {
        const last30Days = new Date();
        last30Days.setDate(last30Days.getDate() - 30);

        // Alle relevanten Logs abrufen
        const logs = await Log.find({
            timestamp: { $gte: last30Days },
            "details.id": { $in: [1225, 1226, 1112, 1113] }
        }).sort({ timestamp: 1 }); // aufsteigend für FIFO

        // Käufe nach ItemId gruppieren (FIFO Queue)
        const buyQueues = {};
        const profitPerDay = {};

        for (const log of logs) {
            const itemId = log.data.items[0]?.id;
            const qty = log.data.items[0]?.qty;
            const cost = log.data.cost_each;

            if (!itemId || !qty || !cost) continue;

            const date = log.timestamp.toISOString().split("T")[0];

            // Buy Logs → in Queue + als negative Ausgabe verbuchen
            if ([1225, 1112].includes(log.details.id)) {
                if (!buyQueues[itemId]) buyQueues[itemId] = [];
                buyQueues[itemId].push({ qty, price: cost });
            }

            // Sell Logs → FIFO Matching
            if ([1226, 1113].includes(log.details.id)) {
                let remainingQty = qty;
                const queue = buyQueues[itemId] || [];

                while (remainingQty > 0 && queue.length > 0) {
                    const buy = queue[0];
                    const usedQty = Math.min(remainingQty, buy.qty);
                    const profit = usedQty * (cost - buy.price);

                    if (!profitPerDay[date]) profitPerDay[date] = 0;
                    profitPerDay[date] += profit;

                    buy.qty -= usedQty;
                    if (buy.qty <= 0) queue.shift();

                    remainingQty -= usedQty;
                }
            }
        }

        // Alle letzten 30 Tage durchgehen → fehlende Tage mit 0 auffüllen
        const today = new Date();
        for (let i = 0; i < 30; i++) {
            const d = new Date();
            d.setDate(today.getDate() - i);
            const dateKey = d.toISOString().split("T")[0];
            if (!profitPerDay[dateKey]) profitPerDay[dateKey] = 0;
        }

        // nach Datum absteigend sortieren
        const sortedDates = Object.keys(profitPerDay).sort((a, b) => b.localeCompare(a));
        const sortedProfits = {};
        for (const d of sortedDates) sortedProfits[d] = profitPerDay[d];

        res.json(sortedProfits);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Fehler beim Berechnen des Daily Profit" });
    }
});

// ---------- Item-Statistiken ----------
app.get("/item-stats", async (req, res) => {
    try {
        const logs = await Log.find({
            "details.id": { $in: [1225, 1226, 1112, 1113] }
        }).sort({ timestamp: 1 });

        const itemStats = {};
        const buyQueues = {};

        for (const log of logs) {
            const itemId = log.data.items[0]?.id;
            const qty = log.data.items[0]?.qty;
            const cost = log.data.cost_each;
            const type = log.details.id;

            if (!itemId || !qty || !cost) continue;
            if (!itemStats[itemId]) {
                itemStats[itemId] = {
                    itemId,
                    boughtQty: 0,
                    soldQty: 0,
                    buyCount: 0,
                    sellCount: 0,
                    totalBuySpent: 0,
                    totalSellRevenue: 0,
                    fifoProfit: 0
                };
                buyQueues[itemId] = [];
            }

            // ---------- Buy ----------
            if ([1225, 1112].includes(type)) {
                itemStats[itemId].boughtQty += qty;
                itemStats[itemId].buyCount += 1;
                itemStats[itemId].totalBuySpent += qty * cost;
                buyQueues[itemId].push({ qty, price: cost });
            }

            // ---------- Sell ----------
            if ([1226, 1113].includes(type)) {
                itemStats[itemId].soldQty += qty;
                itemStats[itemId].sellCount += 1;
                itemStats[itemId].totalSellRevenue += qty * cost;

                let remainingQty = qty;
                const queue = buyQueues[itemId];
                while (remainingQty > 0 && queue.length > 0) {
                    const buy = queue[0];
                    const usedQty = Math.min(remainingQty, buy.qty);
                    const profit = usedQty * (cost - buy.price);
                    itemStats[itemId].fifoProfit += profit;

                    buy.qty -= usedQty;
                    if (buy.qty <= 0) queue.shift();
                    remainingQty -= usedQty;
                }
            }
        }

        // Durchschnittspreise berechnen
        for (const id of Object.keys(itemStats)) {
            const s = itemStats[id];
            s.avgBuyPrice = s.boughtQty ? s.totalBuySpent / s.boughtQty : 0;
            s.avgSellPrice = s.soldQty ? s.totalSellRevenue / s.soldQty : 0;
            s.avgProfitPerItem = s.soldQty ? s.fifoProfit / s.soldQty : 0;
        }

        // ---------- Item-Namen nachziehen ----------
        const items = await mongoose.model("Item").find({
            id: { $in: Object.keys(itemStats).map(Number) }
        }).lean();

        const itemMap = Object.fromEntries(items.map(i => [i.id, i.name]));

        const result = Object.fromEntries(
            Object.entries(itemStats).map(([id, stats]) => [
                id,
                { name: itemMap[Number(id)] || "Unknown", ...stats }
            ])
        );

        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Fehler beim Berechnen der Item-Statistiken" });
    }
});




// ---------- Server Start ----------
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`)
})
