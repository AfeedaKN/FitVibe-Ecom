const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("DB connected");
    } catch (error) {
        console.error("DB connection error:", error.message);
        process.exit(1); // Exit with failure status
    }
};

module.exports = connectDB;