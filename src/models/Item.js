import mongoose from "mongoose";

const valueSchema = new mongoose.Schema({
    vendor: {
        country: String,
        name: String
    },
    buy_price: Number,
    sell_price: Number,
    market_price: Number
}, { _id: false });

const baseStatsSchema = new mongoose.Schema({
    damage: Number,
    accuracy: Number,
    armor: Number
}, { _id: false });

const detailsSchema = new mongoose.Schema({
    category: String,
    stealth_level: Number,
    base_stats: baseStatsSchema,
    ammo: mongoose.Schema.Types.Mixed,
    mods: [mongoose.Schema.Types.Mixed]
}, { _id: false });

const itemSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    name: String,
    description: String,
    effect: mongoose.Schema.Types.Mixed,
    requirement: mongoose.Schema.Types.Mixed,
    image: String,
    type: String,
    sub_type: String,
    is_masked: Boolean,
    is_tradable: Boolean,
    is_found_in_city: Boolean,
    value: valueSchema,
    circulation: Number,
    details: detailsSchema
});

export default mongoose.model("Item", itemSchema);
