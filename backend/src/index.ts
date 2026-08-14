import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import apiRoutes from "./routes/api";

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api", apiRoutes);

// Base route for sanity check
app.get("/", (req, res) => {
    res.json({ message: "3GPP RAG Chatbot API is running" });
});

// Start the server
app.listen(port, () => {
    console.log(`[server] Server is running on http://localhost:${port}`);
});
