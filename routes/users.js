/* Author: Bethlehem Shimelis
   Event: Sprint 1: Manually Input Food Items with Expiry dates
   LatestUpdate: Fixed inserting with database ordering and null handling
   Description: Handles my GET, POST, PUT and DELETE operations on food items for logged-in stakeholders
   Returns: JSON responses indicating success or failure
*/

import express from "express";
import pool from "../db.js";
import { getLoggedInUser } from "./auth.js"; // import helper from auth.js

const router = express.Router();

/* Author: Bethlehem Shimelis
   Event: Sprint 1: Authentication Middleware
   LatestUpdate: Added ensureLoggedIn middleware
   Description: Ensures a user is logged in before accessing food item routes
   Returns: Attaches user info to req.user if authenticated, else returns 401
*/
function ensureLoggedIn(req, res, next) {
  // check for email
  const email = req.query.email || req.body.email;
  if (!email) return res.status(401).json({ error: "Missing email for authentication" });
// extract user
  const user = getLoggedInUser(email);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  req.user = user; // attach user information to request
  next();
}

/* Author: Bethlehem Shimelis
   Event: Sprint 1: Fetch Food Items
   LatestUpdate: Added GET for stakeholder's food items
   Description: Retrieves all food items belonging to the logged-in stakeholder
   Returns: JSON object containing an array of food items
*/
router.get("/fooditems", ensureLoggedIn, async (req, res) => {
  const stakeholderID = req.user.stakeholderID;

  try {
    // filter items from user
    const result = await pool.query(
      "SELECT * FROM fooditemdb WHERE stakeholderid=$1 ORDER BY fooditemid ASC",
      [stakeholderID]
    );
    res.json({ foodItems: result.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to fetch food items" });
  }
});

/* Author: Bethlehem Shimelis
   Event: Sprint 1: Add Food Item
   LatestUpdate: Added POST with handling of null for donations 
   Description: Adds a new food item for the logged-in stakeholder
   Returns: JSON with success message and newly added food item
*/
router.post("/fooditems", ensureLoggedIn, async (req, res) => {
  const { name, expirydate, quantity, foodcategory, donationid, Measure_per_Unit, Unit } = req.body;
  const stakeholderID = req.user.stakeholderID;

  //pre-check query before database query
  if (!name || !expirydate || !quantity || !foodcategory || !Measure_per_Unit || !Unit) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // query an insert into the DB.
    const result = await pool.query(
      `INSERT INTO fooditemdb 
        (name, expirydate, quantity, stakeholderid, foodcategory, donationid, "Measure_per_Unit", "Unit")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        name,
        expirydate,
        quantity,
        stakeholderID,
        foodcategory,
        donationid?.trim() === "" ? null : donationid,
        Measure_per_Unit,
        Unit,
      ]
    );
    res.json({ message: "Food item added", foodItem: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to add food item" });
  }
});

/* Author: Bethlehem Shimelis
   Event: Sprint 1: Update Food Item
   LatestUpdate: Added PUT to update existing food items
   Description: Updates a food item belonging to the logged-in stakeholder
   Returns: JSON with success message and updated food item, or 403 if unauthorized
*/
router.put("/fooditems/:id", ensureLoggedIn, async (req, res) => {
  const { id } = req.params;
  const { name, expirydate, quantity, foodcategory, donationid, Measure_per_Unit, Unit } = req.body;

  try {
    //query an update to DB
    const result = await pool.query(
      `UPDATE fooditemdb
       SET name=$1, expirydate=$2, quantity=$3, foodcategory=$4, donationid=$5, "Measure_per_Unit"=$6, "Unit"=$7
       WHERE fooditemid=$8 AND stakeholderid=$9 RETURNING *`,
      [name, expirydate, quantity, foodcategory, donationid?.trim() === "" ? null : donationid, Measure_per_Unit, Unit, id, req.user.stakeholderID]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: "Unauthorized to update this food item" });
    }

    res.json({ message: "Food item updated", foodItem: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to update food item" });
  }
});

/* Author: Bethlehem Shimelis
   Event: Sprint 1: Delete Food Item
   LatestUpdate: Added DELETE for stakeholder's food items
   Description: Deletes a food item belonging to the logged-in stakeholder
   Returns: JSON with success message, or 403 if unauthorized
*/
router.delete("/fooditems/:id", ensureLoggedIn, async (req, res) => {
  const { id } = req.params;
  try {
    //query delete
    const result = await pool.query(
      "DELETE FROM fooditemdb WHERE fooditemid=$1 AND stakeholderid=$2 RETURNING *",
      [id, req.user.stakeholderID]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: "Unauthorized to delete this food item" });
    }

    res.json({ message: "Food item deleted" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to delete food item" });
  }
});

export default router;
