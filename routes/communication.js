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
 * Return chat as an array of { sender, receiver, text, timestamp }
 */
router.get("/:donationid", async (req, res) => {
  const { donationid } = req.params;

  try {
    const client = await pool.connect();
    const result = await client.query(
      `
      SELECT senderid, receiverid, chathistory AS text, message_timestamp
      FROM chatdb
      WHERE donationid = $1
      ORDER BY message_timestamp ASC
      `,
      [donationid]
    );
    client.release();

    const messages = result.rows.map((row) => ({
      sender: row.senderid,
      receiver: row.receiverid,
      text: row.text,
      timestamp: row.message_timestamp,
    }));

    res.json({ messages });
  } catch (err) {
    console.error("Error fetching chats:", err);
    res.status(500).json({ error: "Database error while fetching chats" });
  }
});

/**
 * POST /api/communication/:donationid
 * Body: { senderid, receiverid, text }
 */
router.post("/:donationid", async (req, res) => {
  const { donationid } = req.params;
  const { senderid, receiverid, text } = req.body;

  if (!senderid || !receiverid || !text) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const client = await pool.connect();
    const result = await client.query(
      `
      INSERT INTO chatdb (donationid, senderid, receiverid, chathistory, message_timestamp)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING senderid, receiverid, chathistory AS text, message_timestamp
      `,
      [donationid, senderid, receiverid, text]
    );
    client.release();

    // Return updated chat array
    res.json({
      message: {
        sender: result.rows[0].senderid,
        receiver: result.rows[0].receiverid,
        text: result.rows[0].text,
        timestamp: result.rows[0].message_timestamp,
      },
    });
  } catch (err) {
    console.error("Error inserting chat:", err);
    res.status(500).json({ error: "Database insert error" });
  }
});

export default router;
