import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import notificationRoutes from "./routes/notification.js";
import usersRoutes from "./routes/users.js"; // NEW
import bulkUploadRoutes from "./routes/bulkUpload.js";
import chatServices from './routes/backendChatServices.js';

import communicationRoutes from "./routes/communication.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/users", usersRoutes); // NEW
app.use("/api/bulkupload", bulkUploadRoutes);
app.use('/supabase', chatServices);

app.use("/api/communication", communicationRoutes);

app.get("/", (req, res) => {
  res.send("Server is running! Users routes active at /api/users");
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);

});



