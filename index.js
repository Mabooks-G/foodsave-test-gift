// index.js (or server.js)
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./db.js";

import authRoutes from "./routes/auth.js";
import notificationRoutes from "./routes/notification.js";
import usersRoutes from "./routes/users.js";
import bulkUploadRoutes from "./routes/bulkUpload.js";
import communicationRoutes from "./routes/communication.js";
import donationRoutes from "./routes/donations.js";   // ✅ new

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/bulkupload", bulkUploadRoutes);
app.use("/api/communication", communicationRoutes);
app.use("/api/donations", donationRoutes);            // ✅ added

// Root
app.get("/", (req, res) => {
  res.send("Server is running! Donations route active at /api/donations/:id");
});

// Start
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
