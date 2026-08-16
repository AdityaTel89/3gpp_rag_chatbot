import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import apiRoutes from "./routes/api";

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// CORS Middleware with full open access & preflight
app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Origin", "Accept"],
    credentials: false
}));

app.use(express.json({ limit: "10mb" }));

// Routes
app.use("/api", apiRoutes);

// Base route for sanity check
app.get("/", (req, res) => {
    res.json({ message: "3GPP RAG Chatbot API is running", status: "ok" });
});

// Global error handler to guarantee JSON response and CORS headers
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error("[server] Unhandled Error:", err);
    res.status(500).json({
        error: "Internal Server Error",
        message: err?.message || "An unexpected error occurred"
    });
});

// Start the server
app.listen(port, () => {
    console.log(`[server] Server is running on http://localhost:${port}`);
});

