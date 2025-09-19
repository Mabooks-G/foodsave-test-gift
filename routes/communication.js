/* Author: 
   Event: Sprint 1 
   LatestUpdate: 
   Description: 
*/

// routes/communication.js
import express from "express";
import pool from "../db.js";

const router = express.Router();

// helper: encode messages array into string
function encodeMessages(messages) {
  let encoded = "{";
  let i = 0;
  while (i < messages.length) {
    const msg = messages[i];
    encoded += `[${msg.sender},[${msg.text}]]`;
    if (i < messages.length - 1) encoded += ",";
    i++;
  }
  encoded += "}";
  return encoded;
}

// helper: decode string into messages array
function decodeMessages(encoded) {
  const messages = [];
  if (!encoded) return messages;

  // remove { }
  let str = encoded.trim();
  if (str.startsWith("{")) str = str.slice(1);
  if (str.endsWith("}")) str = str.slice(0, -1);

  // split by "],"
  const parts = str.split("],");
  let i = 0;
  while (i < parts.length) {
    let segment = parts[i].trim();
    if (!segment.endsWith("]")) segment += "]";
    // format: [sender,[text]]
    const match = segment.match(/\[(.*?),\[(.*)\]\]/);
    if (match) {
      messages.push({
        sender: match[1],
        text: match[2],
        timestamp: new Date().toISOString(), // synthetic timestamp
      });
    }
    i++;
  }
  return messages;
}

/**
 * GET /api/communication/:donationid
 */
router.get("/:donationid", async (req, res) => {
  const { donationid } = req.params;
  try {
    const client = await pool.connect();
    const result = await client.query(
      "SELECT chathistory FROM chatdb WHERE donationid = $1",
      [donationid]
    );
    client.release();

    if (result.rows.length === 0) return res.json({ messages: [] });

    const encoded = result.rows[0].chathistory;
    const messages = decodeMessages(encoded);
    res.json({ messages });
  } catch (err) {
    console.error("Error fetching chat:", err);
    res.status(500).json({ error: "Database error" });
  }
});

/**
 * POST /api/communication/:donationid
 * Body: { senderid, text }
 */
router.post("/:donationid", async (req, res) => {
  const { donationid } = req.params;
  const { senderid, text } = req.body;

  if (!senderid || !text) {
    return res.status(400).json({ error: "Missing senderid or text" });
  }

  try {
    const client = await pool.connect();

    // fetch old conversation
    const check = await client.query(
      "SELECT chathistory FROM chatdb WHERE donationid = $1",
      [donationid]
    );

    let messages = [];
    if (check.rows.length > 0 && check.rows[0].chathistory) {
      messages = decodeMessages(check.rows[0].chathistory);
    }

    // append new message
    messages.push({
      sender: senderid,
      text,
      timestamp: new Date().toISOString(),
    });

    const encoded = encodeMessages(messages);

    if (check.rows.length === 0) {
      await client.query(
        "INSERT INTO chatdb (donationid, chathistory) VALUES ($1, $2)",
        [donationid, encoded]
      );
    } else {
      await client.query(
        "UPDATE chatdb SET chathistory = $2 WHERE donationid = $1",
        [donationid, encoded]
      );
    }

    client.release();
    res.json({ messages });
  } catch (err) {
    console.error("Error updating chat:", err);
    res.status(500).json({ error: "Database update error" });
  }
});

export default router;
