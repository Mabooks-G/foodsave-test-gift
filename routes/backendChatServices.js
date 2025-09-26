import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

/* Author: Lethabo Mazui
   Event: Sprint 1
   LatestUpdate: Initial Supabase client setup
   Description: Configures Supabase client with environment variables
*/
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, {
  db: { schema: 'public' },
  global: { headers: { 'x-my-custom-header': 'debug' } },
});

/* Author: Lethabo Mazui
   Event: Sprint 1
   LatestUpdate: Added pre-warm query to reduce latency
   Description: Performs a lightweight query on stakeholderdb to pre-warm the Supabase connection
*/
(async () => {
  await supabase.from('stakeholderdb').select('stakeholderid').limit(1);
})();

/* Author: Lethabo Mazui
   Event: Sprint 1
   LatestUpdate: Utility function for mapping IDs to consistent emojis
   Description: Generates a stable emoji based on a hashed ID
*/
function emojiForId(id) {
  const foodEmojis = ['🍏','🍞','🍳','🍇','🍉','🫐','🥕','🍔'];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return foodEmojis[Math.abs(hash) % foodEmojis.length];
}

/* Author: Lethabo Mazui
   Event: Sprint 1
   LatestUpdate: Created reusable helper
   Description: Retrieves the Socket.IO instance from the Express app
*/
const getIO = (req) => req.app.get("io");

/* Author: Lethabo Mazui
   Event: Sprint 1
   LatestUpdate: Added donor/charity message seeding
   Description: Ensures donor and charity users both have initial chat records for a donation
*/
async function ensureMessageExists(donationid, donorid, charityid) {
  try {
    // Check if any chats already exist for this donation
    const { data: existingChats, error: existingErr } = await supabase
      .from('chatdb')
      .select('senderid')
      .eq('donationid', donationid);

    if (existingErr) throw existingErr;

    // Flags for whether donor/charity already exist in chat records
    const hasDonor = existingChats?.some(chat => chat.senderid === donorid);
    const hasCharity = existingChats?.some(chat => chat.senderid === charityid);

    // Generate icon and timestamp (timestamp hardcoded +2h offset for now)
    const icon = emojiForId(donationid);
    const now = new Date();
    const utc2 = new Date(now.getTime() + 2*60*60*1000);
    const timestamp = utc2.toISOString();

    let inserts = [];
    if (!hasDonor) {
      inserts.push({ donationid, senderid: donorid, message_timestamp: timestamp, chathistory: "", icon, readreceipts: false, delivered: false });
    }
    if (!hasCharity) {
      inserts.push({ donationid, senderid: charityid, message_timestamp: timestamp, chathistory: "", icon, readreceipts: false, delivered: false });
    }

    // Insert missing entries if needed
    if (inserts.length > 0) {
      await supabase.from('chatdb').insert(inserts).select();
      return inserts;
    }

    return null;
  } catch {
    return null;
  }
}

/* Author: Lethabo Mazui
   Event: Sprint 1
   LatestUpdate: Integrated ensureMessageExists to auto-seed
   Description: Polls approved donations every 5 seconds to make sure chat records exist
*/
async function pollApprovedDonations() {
  try {
    const { data: approvedDonations } = await supabase
      .from('donationdb')
      .select('donationid, stakeholderid, charityid')
      .eq('donationstatus', 'approved');

    // Skip if no approved donations found
    if (!approvedDonations?.length) return;

    // For each donation, ensure donor/charity entries exist
    await Promise.all(
      approvedDonations.map(async donation => {
        await ensureMessageExists(donation.donationid, donation.stakeholderid, donation.charityid);
      })
    );
  } catch {}
}
setInterval(() => pollApprovedDonations(), 5000);

/* Author: Lethabo Mazui
   Event: Sprint 1
   LatestUpdate: Added debugging endpoint
   Description: Fetches all chats linked to a stakeholder for debugging purposes
*/
router.post('/debugChats', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Missing email' });

    // Look up stakeholder by email
    const { data: stakeholderData, error: stakeholderErr } = await supabase
      .from('stakeholderdb')
      .select('*')
      .eq('email', email)
      .single();

    if (stakeholderErr && stakeholderErr.code !== 'PGRST116') 
      return res.status(500).json({ error: stakeholderErr.message });
    if (!stakeholderData) return res.status(404).json({ msg: 'No stakeholder found' });

    const stakeholderid = stakeholderData.stakeholderid;

    // Get all donation IDs linked to this stakeholder
    const { data: foodItems, error: foodErr } = await supabase
      .from('fooditemdb')
      .select('donationid')
      .eq('stakeholderid', stakeholderid);

    if (foodErr) throw foodErr;
    if (!foodItems.length) return res.json({ stakeholderid, linkedDonations: [], chats: [] });

    const donationids = foodItems.map(f => f.donationid);

    // Fetch donation records that are approved
    const { data: donationRecords, error: donationErr } = await supabase
      .from('donationdb')
      .select('*')
      .in('donationid', donationids)
      .eq('donationstatus', 'approved');

    if (donationErr) throw donationErr;

    const linkedDonations = donationRecords.map(d => ({
      donationid: d.donationid,
      donorid: stakeholderid,
      charityid: d.charityid,
      status: d.donationstatus,
    }));

    // Fetch all chats linked to those donation IDs
    const { data: chats, error: chatErr } = await supabase
      .from('chatdb')
      .select('*')
      .in('donationid', linkedDonations.map(d => d.donationid))
      .order('message_timestamp', { ascending: true });

    if (chatErr) throw chatErr;

    res.json({ stakeholderid, linkedDonations, chats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Author: Lethabo Mazui
   Event: Sprint 1
   LatestUpdate: Added stakeholder lookup by email
   Description: Returns stakeholderid for a given email
*/
router.post('/getStakeholderId', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Missing email' });

    const { data, error } = await supabase
      .from('stakeholderdb')
      .select('stakeholderid')
      .eq('email', email)
      .single();

    if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Stakeholder not found' });

    res.json({ stakeholderid: data.stakeholderid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//for donations notifications
export async function getStakeholderIdFromEmail(email) {
  const { data, error } = await supabase
    .from('stakeholderdb')
    .select('stakeholderid')
    .eq('email', email)
    .single();

  if (error || !data) return null;
  return data.stakeholderid;
}
/* Author: Lethabo Mazui
   Event: Sprint 1
   LatestUpdate: Integrated timestamp filtering
   Description: Fetches all messages for a user (ciphertext + IV returned as stored)
*/
router.post('/getUserChats', async (req, res) => {
  try {
    const { email, since } = req.body;
    if (!email) return res.status(400).json({ error: 'Missing email' });

    // Look up stakeholder
    const { data: stakeholderData } = await supabase
      .from('stakeholderdb')
      .select('stakeholderid')
      .eq('email', email)
      .single();
    if (!stakeholderData) return res.status(404).json({ error: 'User not found' });

    const userid = stakeholderData.stakeholderid;

    // Find donations where user is donor
    const { data: donorItems } = await supabase
      .from('fooditemdb')
      .select('donationid')
      .eq('stakeholderid', userid);
    const donorDonationIDs = donorItems?.map(f => f.donationid) || [];

    // Find donations where user is donor or charity
    const { data: charityDonations } = await supabase
      .from('donationdb')
      .select('donationid')
      .or(`stakeholderid.eq.${userid},charityid.eq.${userid}`)
      .eq('donationstatus', 'approved');
    const charityDonationIDs = charityDonations?.map(d => d.donationid) || [];

    const allDonationIDs = [...new Set([...donorDonationIDs, ...charityDonationIDs])];
    if (!allDonationIDs.length) return res.json([]);

    // Fetch all chat messages since provided timestamp (or all if not provided)
    const { data: messages } = await supabase
      .from('chatdb')
      .select('*')
      .in('donationid', allDonationIDs)
      .gte('message_timestamp', since || '1970-01-01T00:00:00Z')
      .order('message_timestamp', { ascending: true });

    const safeMessages = Array.isArray(messages) ? messages : [];

    // Map stakeholder IDs to names
    const { data: stakeholders } = await supabase
      .from('stakeholderdb')
      .select('stakeholderid, name');
    const nameMap = Object.fromEntries(stakeholders.map(s => [s.stakeholderid, s.name]));

    // Do not decrypt here. Return ciphertext and IV as stored
    const formatted = safeMessages.map(msg => {
      const isOutgoing = msg.senderid === userid;
      const recipientId = isOutgoing ? msg.charityid : msg.senderid;
      const recipientName = nameMap[recipientId] || 'Unknown';

      return {
        chatid: msg.chatid,
        donationid: msg.donationid,
        senderid: msg.senderid,
        senderName: nameMap[msg.senderid] || 'Unknown',
        charityid: msg.charityid,
        charityName: nameMap[msg.charityid] || 'Unknown',
        recipientId,
        recipientName,
        message_timestamp: msg.message_timestamp || msg.timestamp,
        chathistory: msg.chathistory, // ciphertext
        iv: msg.iv || null,
        icon: msg.icon,
        readreceipts: msg.readreceipts,
        delivered: msg.delivered,
        isOutgoing,
      };
    });

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Author: Lethabo Mazui
   Event: Sprint 1
   LatestUpdate: Added frontend timestamp support
   Description: Inserts new encrypted chat message into chatdb
*/
router.post('/updateChatHistory', async (req, res) => {
  try {
    const { donationid, senderid, chathistory, iv, message_timestamp } = req.body;

    if (!donationid || !senderid || !chathistory || !iv) {
      return res.status(400).json({ error: 'Missing required params: donationid, senderid, chathistory, iv' });
    }

    // Use frontend timestamp if provided, otherwise fallback to UTC now
    const timestampToUse =  new Date().toISOString();

    // Default status flags
    const delivered = false;
    const readreceipts = false;
    const icon = emojiForId(donationid);

    // Insert into chatdb
    const { data, error } = await supabase
      .from('chatdb')
      .insert([
        {
          icon,
          donationid,
          senderid,
          chathistory,
          iv,
          message_timestamp: timestampToUse,
          delivered,
          readreceipts
        }
      ])
      .select(); // return inserted row

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.json(data[0]);
  } catch (err) {
    console.error('updateChatHistory error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


/* Author: Lethabo Mazui
   Event: Sprint 1
   LatestUpdate: Added Socket.IO emit for read receipts
   Description: Marks messages as read for a donation (excluding current user sender)
*/
router.post('/markChatRead', async (req, res) => {
  try {
    const { donationid, currentUserId } = req.body;
    if (!donationid || !currentUserId) return res.status(400).json({ error: 'Missing donationid or currentUserId' });

    // Update all chat messages as read where sender is not the current user
    const { data, error } = await supabase
      .from('chatdb')
      .update({ readreceipts: true })
      .eq('donationid', donationid)
      .neq('senderid', currentUserId)
      .select();

    if (error) throw error;

    // Emit read notification
    const io = getIO(req);
    if (io) io.emit('messageRead', { donationid, senderId: currentUserId });

    res.json({ success: true, updated: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Author: Lethabo Mazui
   Event: Sprint 1
   LatestUpdate: Added Socket.IO emit for delivery receipts
   Description: Marks messages as delivered for a donation (excluding sender)
*/
router.post('/markDelivered', async (req, res) => {
  try {
    const { donationid, userId } = req.body;
    if (!donationid || !userId) return res.status(400).json({ error: 'Missing donationid or userId' });

    // Update delivered flag on all messages not sent by this user
    const { data, error } = await supabase
      .from('chatdb')
      .update({ delivered: true })
      .eq('donationid', donationid)
      .neq('senderid', userId)
      .select();

    if (error) throw error;

    // Emit delivery notification for each updated chat
    const io = getIO(req);
    if (io && data?.length) {
      data.forEach(chat => {
        io.emit('messageDelivered', { chatid: chat.chatid, donationid, recipientId: userId });
      });
    }

    res.json({ success: true, updated: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
