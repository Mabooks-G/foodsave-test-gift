import express from "express";
import cors from "cors"; // ← YOU STILL NEED THIS IMPORT!
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import notificationRoutes from "./routes/notification.js";
import usersRoutes from "./routes/users.js";
import bulkUploadRoutes from "./routes/bulkUpload.js";
import chatServices from './routes/backendChatServices.js';
import communicationRoutes from "./routes/communication.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// SIMPLE CORS FIX - Just this one line (but you need the import above!)
app.use(cors()); // ← This allows ALL origins

app.use(express.json());

// Your routes
app.use("/api/auth", authRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/bulkupload", bulkUploadRoutes);
app.use('/supabase', chatServices);
app.use("/api/communication", communicationRoutes);

app.get("/", (req, res) => {
  res.send("Server is running! CORS configured for development");
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    message: "CORS allows all origins for development"
  });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`CORS configured: ALL origins allowed (development mode)`);
});



