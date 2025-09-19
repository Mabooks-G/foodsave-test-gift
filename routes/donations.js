// routes/donations.js
import express from "express";
import pool from "../db.js";

const router = express.Router();

/**
 * GET /api/donations/:donationid
 * Fetch a single donation by its ID
 */
router.get("/:donationid", async (req, res) => {
  const { donationid } = req.params;
  try {
    const client = await pool.connect();
    const result = await client.query(
      "SELECT donationid, donationstatus, stakeholderid, charityid, donation_items FROM donationdb WHERE donationid = $1",
      [donationid]
    );
    client.release();

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Donation not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching donation:", err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
