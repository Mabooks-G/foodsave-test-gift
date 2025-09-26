/* Author: Kemo Mokoena
   Event: Sprint 1
   LatestUpdate: 2025/09/21
   Description: Backend for Notifications component
   Returns: Stuff from the database server queries
*/
import express from "express"; // Import Express framework
import pool from "../db.js";   // Import DB connection pool
import { getLoggedInUser } from "./auth.js"; // Import helper function for user authentication

const router = express.Router(); // Create a new Express router

// Middleware to ensure user is logged in before accessing routes
function ensureLoggedIn(req, res, next) {
  const email = req.query.email || req.body.email; // Get email from query or body
  if (!email) return res.status(401).json({ error: "Missing email for authentication" }); // 401 if missing

  const user = getLoggedInUser(email); // Look up user by email
  if (!user) return res.status(401).json({ error: "Unauthorized" }); // 401 if user not found

  req.user = user; // Attach user info to request for use in routes
  next(); // Proceed to next middleware or route
}

// Helper function to calculate expiry status and warning level
function getExpiryStatus(expiryDate) {
  const today = new Date();         // Current date
  const expDate = new Date(expiryDate); // Convert expiryDate string to Date object

  // Strip time for day-only comparison
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const expMidnight = new Date(expDate.getFullYear(), expDate.getMonth(), expDate.getDate());

  const diffTime = expMidnight - todayMidnight; // Difference in milliseconds
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Convert to days

  // Determine expiry status and corresponding CSS class
  if (diffDays <= 0)
    return { expiryStatus: `Expired ${Math.abs(diffDays)} day(s) ago`, status: "expired" };
  if (diffDays <= 3)
    return { expiryStatus: `Expires in ${diffDays} day(s)`, status: "warning" };
  return { expiryStatus: `Expires in ${diffDays} days`, status: "good" };
}

// GET /api/inventory
router.get("/inventory", ensureLoggedIn, async (req, res) => {
  const stakeholderID = req.user.stakeholderID;
  try {
    const result = await pool.query(
      "SELECT fooditemid, name, quantity FROM fooditemdb WHERE stakeholderid = $1 ORDER BY fooditemid ASC",
      [stakeholderID]
    );

    const allItems = result.rows.map(item => `${item.quantity} ${item.name}`);
    res.json(allItems);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});


// Route: GET /api/notifications
// Fetch notifications for the logged-in user
router.get("/", ensureLoggedIn, async (req, res) => {
  const days = parseInt(req.query.days) || 2; // Number of days to filter notifications

  const stakeholderID = req.user.stakeholderID; // Get logged-in user's ID

  try {
    // Fetch all food items for the user from the database
    const result = await pool.query(
      "SELECT fooditemid, name, expirydate, quantity, \"notificationRead\" FROM fooditemdb WHERE stakeholderid = $1 ORDER BY fooditemid ASC",
      [stakeholderID]
    );

    console.log("Fetched rows from DB:", result.rows); // Log for debugging

    // Map DB rows to notification objects with status info
    const notifications = result.rows.map(item => {
      const { expiryStatus, status } = getExpiryStatus(item.expirydate);

      const today = new Date();
      const expDate = new Date(item.expirydate);
      const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const expMidnight = new Date(expDate.getFullYear(), expDate.getMonth(), expDate.getDate());
      const diffDays = Math.ceil((expMidnight - todayMidnight) / (1000 * 60 * 60 * 24));

      return {
        id: item.fooditemid,             // Unique ID for notification
        name: `${item.quantity} ${item.name}`, // Display quantity + name
        expiryStatus,                    // Human-readable expiry message
        status,                          // Status for UI (expired/warning/good)
        diffDays,                        // Days remaining
        notificationRead: item.notificationRead // Whether notification is read
      };
    }).filter(item => item.diffDays <= days); // Only include notifications expiring in <= days

    res.json(notifications); // Send as JSON response
  } catch (error) {
    console.error("Error fetching notifications:", error.message); // Log errors
    res.status(500).json({ error: "Database error" }); // Send 500 for DB errors
  }
});

// Route: PUT /api/notifications/:id/read
// Mark a specific notification as read
router.put("/:id/read", ensureLoggedIn, async (req, res) => {
  const stakeholderID = req.user.stakeholderID;
  const { id } = req.params;

  if (isNaN(id)) { // Validate numeric ID
    return res.status(404).json({ error: "Notification not found" });
  }

  console.log("Marking as read:", id, "for stakeholder:", stakeholderID);

  try {
    // Update notificationRead to true in DB
    const result = await pool.query(
      "UPDATE fooditemdb SET \"notificationRead\" = true WHERE fooditemid = $1 AND stakeholderid = $2 RETURNING *",
      [id, stakeholderID]
    );

    if (result.rowCount === 0) { // If no rows updated, notification doesn't exist
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ success: true }); // Success response
  } catch (error) {
    console.error("Error updating notification:", error.message);
    res.status(500).json({ error: "Database error" });
  }
});

// Route: PUT /api/notifications/:id/delete
// Soft delete a notification (mark as deleted)
router.put("/:id/delete", ensureLoggedIn, async (req, res) => {
  const stakeholderID = req.user.stakeholderID;
  const { id } = req.params;

  if (isNaN(id)) { // Validate numeric ID
    return res.status(400).json({ error: "Invalid notification ID" });
  }

  try {
    // Update notificationDeleted to true
    const result = await pool.query(
      'UPDATE fooditemdb SET \"notificationDeleted\" = true WHERE fooditemid = $1 AND stakeholderid = $2 RETURNING *',
      [id, stakeholderID]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Notification not found or not owned by user" });
    }

    // Return success along with updated row
    res.json({ success: true, updated: result.rows[0] });
  } catch (error) {
    console.error("Error updating notification:", error.message);
    res.status(500).json({ error: "Database error" });
  }
});

export default router; // Export router for use in main Express app
