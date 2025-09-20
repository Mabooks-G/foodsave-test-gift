import express from "express";
import pool from "../db.js";
import { getLoggedInUser } from "./auth.js"; // import helper from auth.js

const router = express.Router();

// Middleware to ensure the user is logged in
function ensureLoggedIn(req, res, next) {
  const email = req.query.email || req.body.email;
  if (!email) return res.status(401).json({ error: "Missing email for authentication" });

  const user = getLoggedInUser(email);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  req.user = user; // attach user info to request
  next();
}

function getExpiryStatus(expiryDate) {
  const today = new Date();
  const expDate = new Date(expiryDate); // Works if expiryDate is already Date or timestamp string

  // Remove time portion for difference calculation
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const expMidnight = new Date(expDate.getFullYear(), expDate.getMonth(), expDate.getDate());

  const diffTime = expMidnight - todayMidnight;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) - 1; // -1 to count full days only

  if (diffDays <= 0)
    return { expiryStatus: `Expired ${Math.abs(diffDays)} days ago`, status: "expired" };
  if (diffDays <= 3)
    return { expiryStatus: `Expires in ${diffDays} days`, status: "warning" };
  return { expiryStatus: `Expires in ${diffDays} days`, status: "good" };
}

// GET /api/notifications
router.get("/", ensureLoggedIn, async (req, res) => {
  const stakeholderID = req.user.stakeholderID; // get the logged-in user's ID
  
  try {
    const result = await pool.query(
  "SELECT fooditemid, name, expirydate, quantity FROM fooditemdb WHERE stakeholderid = $1 ORDER BY fooditemid ASC",
  //"SELECT fooditemid, name, expirydate, quantity FROM fooditemdb WHERE stakeholderid = $1 AND \"notificationRead\" = false ORDER BY fooditemid ASC",
  [stakeholderID]
);


     console.log("Fetched rows from DB:", result.rows); // <-- add this

    const notifications = result.rows.map(item => {
      const { expiryStatus, status } = getExpiryStatus(item.expirydate);

      // calculate days left
        const today = new Date();
        const expDate = new Date(item.expirydate);
        const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const expMidnight = new Date(expDate.getFullYear(), expDate.getMonth(), expDate.getDate());
        const diffDays = Math.ceil((expMidnight - todayMidnight) / (1000 * 60 * 60 * 24)) - 1;

      return {
        id: item.fooditemid,
        name: `${item.quantity} ${item.name}`,
        expiryStatus,
        status,
        diffDays, // add this field
       // notificationRead: item.notificationRead // ✅ add this
      };
    }).filter(item => item.diffDays <= 2); // ✅ only items expiring in 2 days

    res.json(notifications);
  } catch (error) {
    console.error("Error fetching notifications:", error.message);
    res.status(500).json({ error: "Database error" });
  }
});

// PUT /api/notifications/:id/read
router.put("/:id/read", ensureLoggedIn, async (req, res) => {
  const stakeholderID = req.user.stakeholderID;
  const { id } = req.params;

  console.log("Marking as read:", id, "for stakeholder:", stakeholderID);


  try {
    const result = await pool.query(
      "UPDATE fooditemdb SET \"notificationRead\" = true WHERE fooditemid = $1 AND stakeholderid = $2 RETURNING *",
      [id, stakeholderID]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error updating notification:", error.message);
    res.status(500).json({ error: "Database error" });
  }
});


export default router;

