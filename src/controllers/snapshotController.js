import Snapshot from "../models/Snapshot.js";

export const createSnapshot = async (inventory) => {
    const snapshot = new Snapshot({
        items: inventory,
        timestamp: new Date()
    });
    await snapshot.save();
    console.log("✅ Snapshot gespeichert:", snapshot._id);
    return snapshot;
};