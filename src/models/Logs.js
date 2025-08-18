import * as mongoose from "mongoose";

const dataSchema = new mongoose.Schema({
    seller: Number,
    items: [
        {
            id: Number,
            uid: Number,
            qty: Number
        }
    ],
    cost_each: Number,
    cost_total: Number
})

const logSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    timestamp: {
        type: Date,
        set: (val) => new Date(val * 1000) // Torn gibt Sekunden, JS Date braucht Millisekunden
    },
    details: Object,
    data: dataSchema,
    params: Object
});

export default mongoose.model("Log", logSchema);