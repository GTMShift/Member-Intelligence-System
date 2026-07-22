const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// EMAIL WEBHOOK — log Gmail interactions against members
router.post('/', async (req, res) => {
  const {
    sender_email,
    recipient_email,
    subject,
    summary,
    direction,
    occurred_at,
    thread_id,
    logged_by
  } = req.body;

  console.log('[emailWebhook] Incoming request', {
    sender_email,
    recipient_email,
    subject,
    direction,
    occurred_at,
    thread_id
  });

  if (!sender_email || !recipient_email || !occurred_at) {
    console.log('[emailWebhook] Missing required fields');
    return res.status(400).json({
      error: 'sender_email, recipient_email, and occurred_at are required'
    });
  }

  const lookupEmail = direction === 'sent' ? recipient_email : sender_email;
  console.log('[emailWebhook] Looking up member by email:', lookupEmail);

  // DB check constraint allows inbound/outbound (not sent/received)
  const dbDirection =
    direction === 'sent' ? 'outbound' : direction === 'received' ? 'inbound' : direction;

  const { data: member, error: memberError } = await supabase
    .from('members')
    .select('id, first_name, last_name, email')
    .eq('email', lookupEmail)
    .maybeSingle();

  if (memberError) {
    console.log('[emailWebhook] Member lookup failed:', memberError.message);
    return res.status(500).json({ error: memberError.message });
  }

  if (member) {
    const memberName = `${member.first_name} ${member.last_name}`.trim();
    console.log('[emailWebhook] Member found:', member.id, memberName);

    const interactionSummary = summary || subject || 'Email interaction';
    const { error: interactionError } = await supabase
      .from('interactions')
      .insert({
        member_id: member.id,
        interaction_type: 'email',
        summary: interactionSummary,
        occurred_at,
        logged_by: logged_by || 'Claude email plugin',
        direction: dbDirection,
        metadata: {
          subject,
          sender_email,
          recipient_email,
          thread_id,
          direction
        }
      });

    if (interactionError) {
      console.log('[emailWebhook] Failed to insert interaction:', interactionError.message);
      return res.status(500).json({ error: interactionError.message });
    }

    console.log('[emailWebhook] Interaction logged for member:', member.id);
    return res.status(201).json({
      status: 'logged',
      member_id: member.id,
      member_name: memberName
    });
  }

  console.log('[emailWebhook] No matching member — flagging for admin review');

  const notificationBody =
    `Email from ${sender_email} could not be matched to a member. Subject: ${subject}. Flagged for review.`;

  const { error: notificationError } = await supabase
    .from('notifications')
    .insert({
      type: 'new_signup',
      title: 'Unmatched email contact',
      body: notificationBody,
      member_id: null,
      is_read: false
    });

  if (notificationError) {
    console.log('[emailWebhook] Failed to insert notification:', notificationError.message);
    return res.status(500).json({ error: notificationError.message });
  }

  console.log('[emailWebhook] Notification created for unmatched email:', lookupEmail);
  return res.status(200).json({
    status: 'flagged',
    message: 'No matching member found — flagged for admin review',
    unmatched_email: lookupEmail
  });
});

module.exports = router;
