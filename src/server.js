import dotenv from 'dotenv'
dotenv.config()
import express from 'express'
import bodyParser from 'body-parser'
import cron from 'node-cron'
import db from './config/db.js'
import axios from 'axios'

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

app.get('/test', async (req, res) => {
    try {
        return await axios.get("https://weav3r.dev/api/marketplace/206")
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Fehler beim Berechnen des Inventars' })
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

// ---------- Server Start ----------
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`)
})
