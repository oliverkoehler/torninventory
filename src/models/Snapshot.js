import mongoose from "mongoose";

const snapshotSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now }, // wann Snapshot gemacht wurde
    items: {
        type: Map,
        of: Number // z.B. { "286": 1, "287": 15 }
    }
});

export default mongoose.model("Snapshot", snapshotSchema);