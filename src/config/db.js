import * as mongoose from "mongoose";

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.DB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("✅ MongoDB verbunden");
    } catch (err) {
        console.error("❌ Fehler beim Verbinden:", err.message);
        process.exit(1); // Stoppe App bei Fehler
    }
};

export default connectDB;
