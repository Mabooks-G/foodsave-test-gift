import express from "express";
import db from "../db.js";

const router = express.Router();

// Create or reuse chat
router.post("/chat/new", async (req, res) => {
  const { senderid, receiverid } = req.body;
  console.log("📩 /chat/new called:", { senderid, receiverid });

  if (!senderid || !receiverid) {
    return res.status(400).json({ error: "senderid and receiverid required" });
  }

  try {
    // Try to find existing chat (donationid used as composite key)
    const donationKey = `${senderid}-${receiverid}`;
    const { rows: existing } = await db.query(
      `SELECT * FROM chatdb WHERE donationid = $1 LIMIT 1`,
      [donationKey]
    );

    if (existing.length > 0) {
      console.log("✅ Found existing chat:", existing[0]);
      existing[0].chathistory = existing[0].chathistory ? JSON.parse(existing[0].chathistory) : [];
      return res.json({ chat: existing[0], existed: true });
    }

    // Otherwise insert a new chat
    const { rows: newChat } = await db.query(
      `INSERT INTO chatdb (timestamp, donationid, chathistory, icon, senderid, readreceipts, delivered)
       VALUES (NOW(), $1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        donationKey,
        JSON.stringify([]), // empty chat history
        receiverid,         // store partner id in icon for now
        senderid,
        false,
        false
      ]
    );

    console.log("🆕 Created new chat:", newChat[0]);
    newChat[0].chathistory = [];
    res.json({ chat: newChat[0], created: true });
  } catch (err) {
    console.error("❌ Error creating chat:", err);
    res.status(500).json({ error: "Failed to create chat" });
  }
});


//  Get chat by ID
router.get("/chat/:chatid", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM chatdb WHERE chatid = $1`,
      [req.params.chatid]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Chat not found" });

    const chat = rows[0];
    chat.chathistory = chat.chathistory ? JSON.parse(chat.chathistory) : [];
    res.json(chat);
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({ error: "Failed to fetch chat" });
  }
});

//  Append message
router.get("/chat/:chatid", async (req, res) => {
  try {
    const chatid = parseInt(req.params.chatid, 10);
    if (isNaN(chatid)) {
      return res.status(400).json({ error: "Invalid chatid" });
    }

    const { rows } = await db.query(`SELECT * FROM chatdb WHERE chatid = $1`, [chatid]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Chat not found" });
    }

    const chat = rows[0];
    try {
      chat.chathistory = chat.chathistory ? JSON.parse(chat.chathistory) : [];
    } catch {
      chat.chathistory = [];
    }

    res.json(chat);
  } catch (err) {
    console.error("❌ Fetch error:", err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
});

export default router;



