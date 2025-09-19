/* Author: 
   Event: Sprint 1 
   LatestUpdate: 
   Description: 
*/

import express from "express";
import pool from "../db.js";  // your supabase/Postgres pool

const router = express.Router();

/**
 * GET /api/chats/:donationid
 * Fetch existing chat for a donation
 */
router.get("/:donationid", async (req, res) => {
  const { donationid } = req.params;
  try {
    const client = await pool.connect();
    const result = await client.query(
      "SELECT * FROM chatdb WHERE donationid = $1 ORDER BY message_timestamp ASC",
      [donationid]
    );
    client.release();

    if (result.rows.length === 0) {
      return res.json({ messages: [] });
    }

    // convert DB row to usable format
    const chats = result.rows.map(row => ({
      senderid: row.senderid,
      receiverid: row.receiverid,
      text: row.chathistory,
      timestamp: row.message_timestamp
    }));

    res.json({ messages: chats });
  } catch (err) {
    console.error("Error fetching chats:", err);
    res.status(500).json({ error: "Database error" });
  }
});

/**
 * POST /api/chats/:donationid
 * Send a new message
 */
router.post("/:donationid", async (req, res) => {
  const { donationid } = req.params;
  const { senderid, receiverid, text } = req.body;

  if (!text || !senderid || !receiverid) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const client = await pool.connect();
    const query = `
      INSERT INTO chatdb (donationid, senderid, receiverid, chathistory)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const result = await client.query(query, [donationid, senderid, receiverid, text]);
    client.release();

    res.json({ message: result.rows[0] });
  } catch (err) {
    console.error("Error inserting chat:", err);
    res.status(500).json({ error: "Database insert error" });
  }
});

export default router;
