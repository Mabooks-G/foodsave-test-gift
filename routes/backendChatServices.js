import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// ----------------------------
// Supabase client
// ----------------------------
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, {
  db: { schema: 'public' },
  global: { headers: { 'x-my-custom-header': 'debug' } },
});

// Pre-warm Supabase connection
(async () => {
  await supabase.from('stakeholderdb').select('stakeholderid').limit(1);
})();

// ----------------------------
// Emoji helper
// ----------------------------
function emojiForId(id) {
  const foodEmojis = ['🍏','🍞','🍳','🍇','🍉','🫐','🥕','🍔'];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return foodEmojis[Math.abs(hash) % foodEmojis.length];
}

// ----------------------------
// Debug route
// ----------------------------
router.post('/debugChats', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Missing email' });

    const { data: stakeholderData, error: stakeholderErr } = await supabase
      .from('stakeholderdb')
      .select('*')
      .eq('email', email)
      .single();

    if (stakeholderErr && stakeholderErr.code !== 'PGRST116') 
      return res.status(500).json({ error: stakeholderErr.message });
    if (!stakeholderData) return res.status(404).json({ msg: 'No stakeholder found' });

    const stakeholderid = stakeholderData.stakeholderid;

    const { data: foodItems, error: foodErr } = await supabase
      .from('fooditemdb')
      .select('donationid')
      .eq('stakeholderid', stakeholderid);

    if (foodErr) throw foodErr;
    if (!foodItems.length) return res.json({ stakeholderid, linkedDonations: [], chats: [] });

    const donationids = foodItems.map(f => f.donationid);

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

// ----------------------------
// Get stakeholder ID by email
// ----------------------------
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

// ----------------------------
// Ensure both donor + charity seeded in chatdb
// ----------------------------
async function ensureMessageExists(donationid, donorid, charityid) {
  try {
    const { data: existingChats, error: existingErr } = await supabase
      .from('chatdb')
      .select('senderid')
      .eq('donationid', donationid);

    if (existingErr) throw existingErr;

    const hasDonor = existingChats?.some(chat => chat.senderid === donorid);
    const hasCharity = existingChats?.some(chat => chat.senderid === charityid);

    const icon = emojiForId(donationid);
    const timestamp = new Date().toISOString();

    let inserts = [];
    if (!hasDonor) inserts.push({ donationid, senderid: donorid, message_timestamp: timestamp, chathistory: "", icon, readreceipts: false, delivered: false });
    if (!hasCharity) inserts.push({ donationid, senderid: charityid, message_timestamp: timestamp, chathistory: "", icon, readreceipts: false, delivered: false });

    if (inserts.length > 0) {
      await supabase.from('chatdb').insert(inserts).select();
      return inserts;
    }

    return null;
  } catch {
    return null;
  }
}

// ----------------------------
// Poll approved donations
// ----------------------------
async function pollApprovedDonations() {
  try {
    const { data: approvedDonations } = await supabase
      .from('donationdb')
      .select('donationid, stakeholderid, charityid')
      .eq('donationstatus', 'approved');

    if (!approvedDonations?.length) return;

    await Promise.all(
      approvedDonations.map(async donation => {
        await ensureMessageExists(donation.donationid, donation.stakeholderid, donation.charityid);
      })
    );
  } catch {}
}

setInterval(() => pollApprovedDonations(), 5000);

// ----------------------------
// Fetch all messages for a user
// ----------------------------
router.post('/getUserChats', async (req, res) => {
  try {
    const { email, since } = req.body;
    if (!email) return res.status(400).json({ error: 'Missing email' });

    const { data: stakeholderData } = await supabase
      .from('stakeholderdb')
      .select('stakeholderid')
      .eq('email', email)
      .single();
    if (!stakeholderData) return res.status(404).json({ error: 'User not found' });

    const userid = stakeholderData.stakeholderid;

    const { data: donorItems } = await supabase
      .from('fooditemdb')
      .select('donationid')
      .eq('stakeholderid', userid);
    const donorDonationIDs = donorItems?.map(f => f.donationid) || [];

    const { data: charityDonations } = await supabase
      .from('donationdb')
      .select('donationid')
      .or(`stakeholderid.eq.${userid},charityid.eq.${userid}`)
      .eq('donationstatus', 'approved');
    const charityDonationIDs = charityDonations?.map(d => d.donationid) || [];

    const allDonationIDs = [...new Set([...donorDonationIDs, ...charityDonationIDs])];
    if (!allDonationIDs.length) return res.json([]);

    const { data: messages } = await supabase
      .from('chatdb')
      .select('*')
      .in('donationid', allDonationIDs)
      .gte('message_timestamp', since || '1970-01-01T00:00:00Z')
      .order('message_timestamp', { ascending: true });

    const safeMessages = Array.isArray(messages) ? messages : [];

    const stakeholderIds = [
      ...new Set(safeMessages.flatMap(m => [m.senderid, m.charityid].filter(Boolean)))
    ];

    const { data: stakeholders } = await supabase
      .from('stakeholderdb')
      .select('stakeholderid, name');
    const nameMap = Object.fromEntries(stakeholders.map(s => [s.stakeholderid, s.name]));

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
        chathistory: msg.chathistory,
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

// ----------------------------
// Get Socket.IO instance
// ----------------------------
const getIO = (req) => req.app.get("io");

// ----------------------------
// Add new message
// ----------------------------
router.post('/updateChatHistory', async (req, res) => {
  try {
    console.log('Received body:', req.body);
    
    // CHANGE THESE PARAMETER NAMES TO MATCH FRONTEND
    const { donationid, senderid, chathistory, iv, message_timestamp } = req.body;
    
    // UPDATE VALIDATION TO MATCH NEW PARAMETERS
    if (!donationid || !senderid || !chathistory || !iv) {
      return res.status(400).json({ error: 'Missing params' });
    }

    const icon = emojiForId(donationid);
    
    // USE THE CORRECT PARAMETER NAMES IN THE DATABASE INSERT
    const { data, error } = await supabase
      .from('chatdb')
      .insert([{ 
        donationid, 
        senderid, 
        message_timestamp: message_timestamp || new Date().toISOString(), // Use provided timestamp or current
        chathistory: chathistory, // Use chathistory instead of message
        iv: iv, // Store the IV in the database
        icon, 
        readreceipts: false, 
        delivered: false 
      }])
      .select()
      .single();

    if (error) throw error;

    // Emit newMessage event via socket if available
    const io = getIO(req);
    if (io) io.emit('newMessage', data);

    res.json(data);
  } catch (err) {
    console.error('updateChatHistory error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------
// Mark messages as read
// ----------------------------
router.post('/markChatRead', async (req, res) => {
  try {
    const { donationid, currentUserId } = req.body;
    if (!donationid || !currentUserId) {
      return res.status(400).json({ error: 'Missing donationid or currentUserId' });
    }

    const { data, error } = await supabase
      .from('chatdb')
      .update({ readreceipts: true })
      .eq('donationid', donationid)
      .neq('senderid', currentUserId)
      .select();   // ✅ returns all rows updated

    if (error) throw error;

    // Emit read event via socket
    const io = getIO(req);
    if (io) io.emit('messageRead', { donationid, senderId: currentUserId });

    res.json({ success: true, updated: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------
// Mark all messages as delivered for a donation and recipient
// ----------------------------
router.post('/markDelivered', async (req, res) => {
  try {
    const { donationid, userId } = req.body;
    if (!donationid || !userId) {
      return res.status(400).json({ error: 'Missing donationid or userId' });
    }

    // Update all messages for this donation where recipient is the user
    const { data, error } = await supabase
      .from('chatdb')
      .update({ delivered: true })
      .eq('donationid', donationid)
      .neq('senderid', userId) // only mark messages **not sent by this user**
      .select(); // returns updated rows

    if (error) throw error;

    // Emit messageDelivered event for each updated chat
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

