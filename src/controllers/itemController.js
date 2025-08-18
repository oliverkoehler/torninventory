import axios from "axios";
import Item from "../models/Item.js";

export const fetchAndStoreItems = async () => {
    try {
        const res = await axios.get("https://api.torn.com/v2/torn/items?sort=ASC", {
            headers: {
                "Authorization": "ApiKey jesZLehFg5xJlfAA",
                "accept": "application/json"
            }
        });

        if (!res.data.items) return;

        const items = Object.values(res.data.items); // API liefert Items als Object mit Keys = IDs

        for (const item of items) {
            // upsert: falls schon vorhanden -> aktualisieren, sonst einfügen
            await Item.updateOne(
                { id: item.id },
                { $set: item },
                { upsert: true }
            );
        }

        console.log("✅ Items erfolgreich in DB gespeichert!");
    } catch (err) {
        console.error("Fehler beim Abrufen oder Speichern der Items:", err);
    }
};
