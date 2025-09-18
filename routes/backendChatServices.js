import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

router.get('/ping', (req, res) => {
  console.log('✅ /supabase/ping route was called');
  res.json({ msg: 'pong' });
});

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, {
  db: { schema: 'public' },
  global: { headers: { 'x-my-custom-header': 'debug' } },
});

console.log('🔹 Supabase URL:', supabaseUrl);
console.log('🔹 Supabase Key:', supabaseKey ? '[REDACTED]' : '❌ MISSING');

// Pre-warm Supabase connection
(async () => {
  try {
    console.log('⏳ Warming up Supabase connection...');
    const { error } = await supabase.from('stakeholderdb').select('stakeholderid').limit(1);
    if (error) console.error('❌ Warm-up query failed:', error);
    else console.log('✅ Supabase connection warmed up.');
  } catch (err) {
    console.error('❌ Warm-up crash:', err);
  }
})();

// Food emoji pool
const foodEmojis = ['🍏','🍞','🍳','🍇','🍉','🫐','🥕','🍔'];

// ----------------------------
// Helper: assign emoji to user if not already
// ----------------------------
async function ensureUserEmoji(userId) {
  const { data, error } = await supabase
    .from('useremojis')
    .select('userId, emoji')
    .eq('userId', userId)
    .single();

  if (error && error.code !== 'PGRST116') console.error('❌ Error fetching user emoji:', error);
  if (data) return data.emoji;

  const assignedEmoji = foodEmojis[userId.charCodeAt(0) % foodEmojis.length];

  const { error: insertErr } = await supabase
    .from('useremojis')
    .insert({ userId, emoji: assignedEmoji });

  if (insertErr) console.error('❌ Error inserting user emoji:', insertErr);

  return assignedEmoji;
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

    if (stakeholderErr && stakeholderErr.code !== 'PGRST116') return res.status(500).json({ error: stakeholderErr.message });
    if (!stakeholderData) return res.status(404).json({ msg: 'No stakeholder found' });

    const stakeholderid = stakeholderData.stakeholderid;

    const { data: foodItems, error: foodErr } = await supabase
      .from('fooditemdb')
      .select('donationid')
      .eq('stakeholderid', stakeholderid);

    if (foodErr) throw foodErr;
    if (!foodItems.length) return res.json({ stakeholderid, linkedDonations: [], chats: [] });

    const donationIDs = foodItems.map(f => f.donationid);

    const { data: donationRecords, error: donationErr } = await supabase
      .from('donationdb')
      .select('*')
      .in('donationid', donationIDs)
      .eq('donationstatus', 'approved');

    if (donationErr) throw donationErr;

    const linkedDonations = donationRecords.map(d => ({
      donationid: d.donationid,
      donorid: stakeholderid,
      charityid: d.stakeholderid,
      status: d.donationstatus,
    }));

    const { data: chats, error: chatErr } = await supabase
      .from('chatdb')
      .select('*')
      .in('donationid', linkedDonations.map(d => d.donationid));

    if (chatErr) throw chatErr;

    res.json({ stakeholderid, linkedDonations, chats });
  } catch (err) {
    console.error('❌ Debug route error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------
// Automatic chat creation
// ----------------------------
async function ensureChatExists(donationid, donorid, charityid) {
  const { data: existingChat } = await supabase
    .from('chatdb')
    .select('*')
    .eq('donationid', donationid)
    .single();

  if (existingChat) return existingChat;

  await ensureUserEmoji(donorid);
  await ensureUserEmoji(charityid);

  const { data: newChat, error } = await supabase
    .from('chatdb')
    .insert([{
      donationid,
      timestamp: new Date().toISOString(),
      chathistory: [],
      icon: null,
      senderID: donorid,
      readReceipts: [],
      delivered: [],
    }])
    .select()
    .single();

  if (error) throw error;
  console.log('✅ Created new chat for donation:', donationid);
  return newChat;
}

// ----------------------------
// Background poller for approved donations
// ----------------------------
let lastPollTime = new Date().toISOString();

async function pollApprovedDonations() {
  try {
    // Fetch newly approved donations since last poll
    const { data: newApproved, error } = await supabase
      .from('donationdb')
      .select('donationid, stakeholderid')
      .eq('donationstatus', 'approved')
      .gt('updated_at', lastPollTime); // assumes donationdb has `updated_at`

    if (error) {
      console.error('❌ Polling error:', error);
      return;
    }

    if (newApproved && newApproved.length) {
      console.log(`⏱ Found ${newApproved.length} new approved donations`);
      for (let donation of newApproved) {
        // Find donor from fooditemdb
        const { data: foodItems } = await supabase
          .from('fooditemdb')
          .select('stakeholderid')
          .eq('donationid', donation.donationid)
          .limit(1);

        if (foodItems && foodItems.length) {
          const donorid = foodItems[0].stakeholderid;
          await ensureChatExists(donation.donationid, donorid, donation.stakeholderid);
        }
      }
    }

    lastPollTime = new Date().toISOString();
  } catch (err) {
    console.error('❌ Polling crash:', err);
  }
}

// Start poller every 5 seconds (adjust interval as needed)
setInterval(pollApprovedDonations, 5000);

// ----------------------------
// Optimized getUserChats (two-way view)
// ----------------------------
router.post('/getUserChats', async (req, res) => {
  try {
    const { userId, since } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    // Donor-side donations
    const { data: donorItems } = await supabase
      .from('fooditemdb')
      .select('donationid')
      .eq('stakeholderid', userId);
    const donorDonationIDs = donorItems ? donorItems.map(f => f.donationid) : [];

    // Charity-side donations
    const { data: charityDonations } = await supabase
      .from('donationdb')
      .select('donationid, stakeholderid')
      .eq('stakeholderid', userId)
      .eq('donationstatus', 'approved');
    const charityDonationIDs = charityDonations ? charityDonations.map(d => d.donationid) : [];

    const allDonationIDs = [...new Set([...donorDonationIDs, ...charityDonationIDs])];
    if (!allDonationIDs.length) return res.json([]);

    // Ensure chats exist for approved donations
    const { data: approvedDonations } = await supabase
      .from('donationdb')
      .select('donationid, stakeholderid')
      .in('donationid', allDonationIDs)
      .eq('donationstatus', 'approved');

    for (let donation of approvedDonations) {
      await ensureChatExists(donation.donationid, donation.stakeholderid, userId);
    }

    // Fetch chats where user is participant
    const { data: chatData, error: chatErr } = await supabase
      .from('chatdb')
      .select('*')
      .or(`senderID.eq.${userId},recipientID.eq.${userId}`)
      .gte('timestamp', since || '1970-01-01T00:00:00Z'); // incremental support

    if (chatErr) throw chatErr;
    if (!chatData.length) return res.json([]);

    // Batch fetch emojis
    const participantIds = Array.from(new Set(chatData.flatMap(c => [c.senderID, c.recipientID])));
    const { data: emojis } = await supabase
      .from('useremojis')
      .select('userId, emoji')
      .in('userId', participantIds);

    const emojiMap = {};
    participantIds.forEach(id => {
      const record = emojis.find(e => e.userId === id);
      emojiMap[id] = record ? record.emoji : foodEmojis[id.charCodeAt(0) % foodEmojis.length];
    });

    // Map emojis and normalize chat history
    for (let chat of chatData) {
      chat.senderEmoji = emojiMap[chat.senderID];
      chat.recipientEmoji = emojiMap[chat.recipientID];
      chat.chathistory = chat.chathistory.map(msg => ({
        ...msg,
        delivered: true,
        read: msg.read || false,
      }));
    }

    res.json(chatData);

  } catch (err) {
    console.error('❌ Error fetching user chats:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
