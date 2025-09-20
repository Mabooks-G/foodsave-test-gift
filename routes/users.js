/* Author: Bethlehem Shimelis
   Event: Sprint 1: Manually Input Food Items with Expiry dates
   LatestUpdate: Fixed POST insert with proper column casing and null handling
   Description: Handles CRUD operations on food items for logged-in stakeholders */

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

// GET all food items for the logged-in stakeholder
router.get("/fooditems", ensureLoggedIn, async (req, res) => {
  const stakeholderID = req.user.stakeholderID;

  try {
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

// POST add a new food item for the logged-in stakeholder
router.post("/fooditems", ensureLoggedIn, async (req, res) => {
  const { name, expirydate, quantity, foodcategory, donationid, Measure_per_Unit, Unit } = req.body;
  const stakeholderID = req.user.stakeholderID;

  if (!name || !expirydate || !quantity || !foodcategory || !Measure_per_Unit || !Unit) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
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

// PUT update a food item (only for the logged-in stakeholder)
router.put("/fooditems/:id", ensureLoggedIn, async (req, res) => {
  const { id } = req.params;
  const { name, expirydate, quantity, foodcategory, donationid, Measure_per_Unit, Unit } = req.body;

  try {
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

// DELETE a food item (only for the logged-in stakeholder)
router.delete("/fooditems/:id", ensureLoggedIn, async (req, res) => {
  const { id } = req.params;
  try {
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
