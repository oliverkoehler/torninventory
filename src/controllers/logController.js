import Log from '../models/Logs.js';
import Item from "../models/Item.js";
import Snapshot from "../models/Snapshot.js";

export const createLog = async (log) => {
    try {
        return await Log.updateOne(
            { id: log.id }, // oder eindeutiges Feld, z.B. 'timestamp'
            { $setOnInsert: log },
            { upsert: true }
        );
    } catch (e) {
        console.log(e);
    }
};

const BUY_CATS = [1225, 1112];
const SELL_CATS = [1226, 1113];

export async function calculateInventory() {
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    // Snapshot holen
    const latestSnapshot = await Snapshot.findOne().sort({ timestamp: -1 }).lean();
    if (!latestSnapshot) return {};

    const snapshotQtys = latestSnapshot.items || {};
    const snapshotTimestamp = latestSnapshot.timestamp;

    // Logs für avgBuy/avgSell (letzte 30 Tage)
    const logs30Days = await Log.find({ timestamp: { $gte: last30Days } }).lean();

    const buySellStats = {}; // für avgBuy/avgSell

    for (const log of logs30Days) {
        const catId = log.details?.id;
        if (![...BUY_CATS, ...SELL_CATS].includes(catId)) continue;

        for (const item of log.data.items) {
            if (!buySellStats[item.id]) {
                buySellStats[item.id] = { totalBuy: 0, buyCount: 0, totalSell: 0, sellCount: 0 };
            }

            const entry = buySellStats[item.id];

            if (BUY_CATS.includes(catId)) {
                entry.totalBuy += log.data.cost_each * item.qty;
                entry.buyCount += item.qty;
            } else if (SELL_CATS.includes(catId)) {
                entry.totalSell += log.data.cost_each * item.qty;
                entry.sellCount += item.qty;
            }
        }
    }

    // Logs nach Snapshot für qty
    const logsAfterSnapshot = logs30Days.filter(log => log.timestamp >= snapshotTimestamp);
    const qtyChanges = {};

    for (const log of logsAfterSnapshot) {
        const catId = log.details?.id;
        if (![...BUY_CATS, ...SELL_CATS].includes(catId)) continue;

        for (const item of log.data.items) {
            if (!qtyChanges[item.id]) qtyChanges[item.id] = 0;
            if (BUY_CATS.includes(catId)) qtyChanges[item.id] += item.qty;
            if (SELL_CATS.includes(catId)) qtyChanges[item.id] -= item.qty;
        }
    }

    // Items DB für name/marketPrice
    const items = await Item.find().lean();

    const result = {};

    // Alle relevanten IDs sammeln (aus Snapshot, qtyChanges, buySellStats)
    const allItemIds = new Set([
        ...Object.keys(snapshotQtys),
        ...Object.keys(qtyChanges),
        ...Object.keys(buySellStats),
    ]);

    for (const id of allItemIds) {
        const stats = buySellStats[id] || { totalBuy: 0, buyCount: 0, totalSell: 0, sellCount: 0 };
        const dbItem = items.find(i => i.id === Number(id));

        const baseQty = snapshotQtys[id] || 0;
        const qty = baseQty + (qtyChanges[id] || 0);

        // Nur aufnehmen, wenn qty > 0
        if (qty > 0) {
            result[id] = {
                qty,
                avgBuy: stats.buyCount ? stats.totalBuy / stats.buyCount : 0,
                avgSell: stats.sellCount ? stats.totalSell / stats.sellCount : 0,
                marketPrice: dbItem?.value?.market_price || null,
                name: dbItem?.name || `Item ${id}`
            };
        }
    }

    return result;
}
