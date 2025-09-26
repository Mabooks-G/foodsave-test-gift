import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { getStakeholderIdFromEmail } from './backendChatServices.js';
import nodemailer from 'nodemailer';

const router = express.Router();
FRONTEND_URL=process.env.FRONTEND_URL
/* Author: Lethabo Mazui
   Event: Sprint 2
   LatestUpdate: The UI - trying to make it look pretty is hard
   Description: Handles pending and approved donation email notifications with pastel styling
   IMPORTANT: WORKS STRICTLY ON testor804@gmail.com (since this is the only email verified on Mailtrap with the .env SMTP credentials)
*/
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, {
  db: { schema: 'public' },
  global: { headers: { 'x-my-custom-header': 'debug' } },
});

// ----------------------------
// Nodemailer setup (Mailtrap)
// ----------------------------
const transporter = nodemailer.createTransport({
  host: 'live.smtp.mailtrap.io',
  port: 587,
  auth: {
    user: 'smtp@mailtrap.io',
    pass: 'a458574ac65daf5a53656400db4f294e',
  },
  secure: false,
});

// ----------------------------
// Track last email sent per donation
// ----------------------------
const lastEmailSent = new Map();
const lastApprovedEmailSent = new Map();

// ----------------------------
// Demo / test mode
// ----------------------------
const TEST_MODE = false;  // set to false for now
const PENDING_INTERVAL = TEST_MODE ? 60000 : 86400000; // 1 min vs 24h
const APPROVED_INTERVAL = TEST_MODE ? 60000 : 3600000; // 1 min vs 1h
const POLL_INTERVAL = TEST_MODE ? 60000 : 600000; // how often to poll all users: 1 min vs 10 min

// ----------------------------
// Compose HTML emails
// ----------------------------
const composePendingEmail = (userName, pendingDonations) => {
  if (!pendingDonations.length) return '';

  const rows = pendingDonations.map((d, i) => `
      <td style="padding: 10px; border: 1px solid;">Donation #${d.donationid}</td>
      <td style="padding: 10px; border: 1px solid;"> Pending action required</td>
    </tr>
  `).join('');

  return `
    <div style="font-family: Arial, sans-serif; color:#333;">
      <h2 style="color:#A8D5BA; text-align:center;">FOODSAVE HUB</h2>
      <p>Hello ${userName || 'User'},</p>
      <p>Here are your pending donations:</p>
      <table style="width:100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background-color:#A8D5BA; color:#fff;">
            <th style="padding: 10px; border: 1px solid #ccc;">Donation ID</th>
            <th style="padding: 10px; border: 1px solid #ccc;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <p style="text-align:center;">
        <a href="${FRONTEND_URL}/donations" style="display:inline-block; padding:10px 20px; background-color:#C8A2C8; color:#fff; text-decoration:none; border-radius:5px;">Go to Donations</a>
      </p>
      <p style="text-align:center;">Thank you.</p>
    </div>
  `;
};

const composeApprovedEmail = (userName, approvedDonations) => {
  if (!approvedDonations.length) return '';

  const rows = approvedDonations.map((d, i) => `
      <td style="padding: 10px; border: 1px solid;">Donation #${d.donationid}</td>
      <td style="padding: 10px; border: 1px solid;"> Chat now available</td>
    </tr>
  `).join('');

  return `
    <div style="font-family: Arial, sans-serif; color:#333;">
      <h2 style="color:#A8D5BA; text-align:center;">FOODSAVE HUB</h2>
      <p>Hello ${userName || 'User'},</p>
      <p>You have new chats available for the following donations:</p>
      <table style="width:100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background-color:#A8D5BA; color:#fff;">
            <th style="padding: 10px; border: 1px solid #ccc;">Donation ID</th>
            <th style="padding: 10px; border: 1px solid #ccc;">Chat Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <p style="text-align:center;">
        <a href="${FRONTEND_URL}/communication" style="display:inline-block; padding:10px 20px; background-color:#C8A2C8; color:#fff; text-decoration:none; border-radius:5px;">Go to Chats</a>
      </p>
      <p style="text-align:center;">Thank you.</p>
    </div>
  `;
};

// ----------------------------
// Poll functions
// ----------------------------
async function pollPendingDonations(userEmail, interval = PENDING_INTERVAL) {
  try {
    const stakeholderid = await getStakeholderIdFromEmail(userEmail);
    if (!stakeholderid) return;

    const { data: pendingDonations, error } = await supabase
      .from('donationdb')
      .select('donationid, charityid')
      .eq('donationstatus', 'pending')
      .eq('charityid', stakeholderid);

    if (error) return;

    const now = Date.now();
    const newPending = pendingDonations?.filter(d => (now - (lastEmailSent.get(d.donationid) || 0)) >= interval) || [];
    if (!newPending.length) return;

    const { data: userData, error: userError } = await supabase
      .from('stakeholderdb')
      .select('email, name')
      .eq('stakeholderid', stakeholderid)
      .single();

    if (userError || !userData?.email) return;

    transporter.sendMail({
      from: '"Donation Platform" <hello@demomailtrap.co>',
      to: userData.email,
      subject: 'Pending Donations',
      html: composePendingEmail(userData.name, newPending),
    }, () => {
      newPending.forEach(d => lastEmailSent.set(d.donationid, now));
    });

  } catch (err) {
    console.error('Error in pollPendingDonations:', err);
  }
}

async function pollApprovedDonations(userEmail, interval = APPROVED_INTERVAL) {
  try {
    const stakeholderid = await getStakeholderIdFromEmail(userEmail);
    if (!stakeholderid) return;

    const { data: approvedDonations, error } = await supabase
      .from('donationdb')
      .select('donationid, stakeholderid, charityid')
      .eq('donationstatus', 'approved')
      .or(`stakeholderid.eq.${stakeholderid},charityid.eq.${stakeholderid}`);

    if (error) return;

    const now = Date.now();
    const newApproved = approvedDonations?.filter(d => (now - (lastApprovedEmailSent.get(d.donationid) || 0)) >= interval) || [];
    if (!newApproved.length) return;

    const { data: userData, error: userError } = await supabase
      .from('stakeholderdb')
      .select('email, name')
      .eq('stakeholderid', stakeholderid)
      .single();

    if (userError || !userData?.email) return;

    transporter.sendMail({
      from: '"Donation Platform" <hello@demomailtrap.co>',
      to: userData.email,
      subject: 'New Chats Available',
      html: composeApprovedEmail(userData.name, newApproved),
    }, () => {
      newApproved.forEach(d => lastApprovedEmailSent.set(d.donationid, now));
    });

  } catch (err) {
    console.error('Error in pollApprovedDonations:', err);
  }
}

// ----------------------------
// Automatic polling for all users
// ----------------------------
async function pollAllUsers() {
  try {
    const { data: users } = await supabase.from('stakeholderdb').select('email');
    if (!users) return;

    for (const user of users) {
      if (!user.email) continue;
      await pollPendingDonations(user.email);
      await pollApprovedDonations(user.email);
    }
  } catch (err) {
    console.error('Error in pollAllUsers:', err);
  }
}

// Start automatic polling
setInterval(pollAllUsers, POLL_INTERVAL);
console.log(`[Email Polling] Automatic polling started (interval: ${POLL_INTERVAL/1000}s)`);

// ----------------------------
// Endpoint to get pending donation count
// ----------------------------

router.get('/pending-count', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    // Map email to stakeholderid
    const stakeholderid = await getStakeholderIdFromEmail(email);
    // LOG for debugging
    //console.log(`Mapping email "${email}" to stakeholder ID:`, stakeholderid);
    if (!stakeholderid) return res.json({ count: 0 });

    // Count pending donations for this stakeholder
    const { data: pendingDonations, error } = await supabase
      .from('donationdb')
      .select('donationid')
      .eq('donationstatus', 'pending')
      .eq('charityid', stakeholderid);

    if (error) {
      console.error('Error fetching pending donations:', error.message);
      return res.status(500).json({ error: 'Failed to fetch pending donations' });
    }

    res.json({ count: pendingDonations?.length || 0 });
  } catch (err) {
    console.error('Error in /pending-count:', err);
    res.status(500).json({ error: 'Server error' });
  }
});



// ----------------------------
// Manual trigger endpoints (optional)
// ----------------------------
router.get('/test-send-pending', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  await pollPendingDonations(email);
  res.json({ status: 'Pending donation emails sent (if any).', email });
});

router.get('/test-send-approved', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  await pollApprovedDonations(email);
  res.json({ status: 'Approved donation emails sent (if any).', email });
});

export default router;
