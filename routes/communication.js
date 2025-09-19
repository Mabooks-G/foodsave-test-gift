/* Author: 
   Event: Sprint 1 
   LatestUpdate: 
   Description: 
*/

// routes/communication.js
import express from "express";
import pool from "../db.js";

const router = express.Router();

/**
 * GET /api/communication/:donationid
 * Returns messages for a donation (ordered by timestamp)
 */
router.get("/:donationid", async (req, res) => {
  const { donationid } = req.params;
  try {
    const client = await pool.connect();
    const q = `
      SELECT senderid, receiverid, chathistory AS text, message_timestamp
      FROM chatdb
      WHERE donationid = $1
      ORDER BY message_timestamp ASC
    `;
    const result = await client.query(q, [donationid]);
    client.release();

    const messages = result.rows.map((r) => ({
      senderid: r.senderid,
      receiverid: r.receiverid,
      text: r.text,
      timestamp: r.message_timestamp,
    }));

    return res.json({ messages });
  } catch (err) {
    console.error("Error fetching chats:", err);
    return res.status(500).json({ error: "Database error" });
  }
});

/**
 * POST /api/communication/:donationid
 * Body: { senderid, receiverid, text }
 */
router.post("/:donationid", async (req, res) => {
  const { donationid } = req.params;
  const { senderid, receiverid, text } = req.body;

  if (!text || !senderid || !receiverid) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const client = await pool.connect();
    const q = `
      INSERT INTO chatdb (donationid, senderid, receiverid, chathistory, message_timestamp)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING senderid, receiverid, chathistory AS text, message_timestamp
    `;
    const result = await client.query(q, [donationid, senderid, receiverid, text]);
    client.release();

    return res.json({ message: result.rows[0] });
  } catch (err) {
    console.error("Error inserting chat:", err);
    return res.status(500).json({ error: "Database insert error" });
  }
});

export default router;


