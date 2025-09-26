/* Event: Sprint 1
   LatestUpdate: 2025/09/21
   Description: Main server entry point with API route configuration
*/

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import notificationRoutes from "./routes/notification.js";

import usersRoutes from "./routes/users.js"; // NEW
import bulkUploadRoutes from "./routes/bulkUpload.js";
import chatService from "./routes/backendChatServices.js"; // NEW
import DandCnotifications from "./routes/dandc_notifications.js"; // NEW


dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Configure CORS for frontend communication
const FRONTEND_URL = process.env.FRONTEND_URL;
console.log("CORS allowed origin:", FRONTEND_URL);

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());// Parse JSON request bodies

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/users", usersRoutes); // NEW
app.use("/api/bulkupload", bulkUploadRoutes);
app.use("/supabase", chatService); // NEW
app.use("/api/dandc_notifications", DandCnotifications);

// Root endpoint for health check
app.get("/", (req, res) => {
  res.send("Server is running! Users routes active at /api/users");
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});