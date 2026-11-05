const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const { serverError } = require('../utils/serverError');

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
  } = req.body;

  if (!sender_email || !recipient_email || !occurred_at) {
    return res.status(400).json({
      error: 'sender_email, recipient_email, and occurred_at are required'
    });
  }

  const lookupEmail = direction === 'sent' ? recipient_email : sender_email;

  // DB check constraint allows inbound/outbound (not sent/received)
  const dbDirection =
    direction === 'sent' ? 'outbound' : direction === 'received' ? 'inbound' : direction;

  const { data: member, error: memberError } = await supabase
    .from('members')
    .select('id, first_name, last_name, email')
    .eq('email', lookupEmail)
    .maybeSingle();

  if (memberError) {
    return serverError(res, 'emailWebhook.memberLookup', memberError);
  }

  if (!member) {
    console.log('[emailWebhook] No matching member — ignoring', lookupEmail);
    return res.status(200).json({ status: 'ignored', message: 'No matching member found' });
  }

  const memberName = `${member.first_name} ${member.last_name}`.trim();

  const interactionSummary = summary || subject || 'Email interaction';
  const { error: interactionError } = await supabase
    .from('interactions')
    .insert({
      member_id: member.id,
      interaction_type: 'email',
      summary: interactionSummary,
      occurred_at,
      logged_by: 'Gmail monitor',
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
    return serverError(res, 'emailWebhook.insertInteraction', interactionError);
  }

  await supabase
    .from('members')
    .update({ last_updated: new Date().toISOString() })
    .eq('id', member.id);

  const directionLabel = direction === 'sent' ? 'Sent to' : 'Received from';
  const otherParty = direction === 'sent' ? recipient_email : sender_email;
  const { error: notificationError } = await supabase
    .from('notifications')
    .insert({
      type: 'profile_updated',
      title: 'Email interaction logged',
      body: `${directionLabel} ${otherParty} (${memberName}): ${interactionSummary}`,
      member_id: member.id,
      member_name: memberName,
      is_read: false
    });

  if (notificationError) {
    console.error('[emailWebhook.insertNotification] failed', notificationError.code || 'unknown');
  }

  return res.status(201).json({ status: 'logged' });
});

module.exports = router;
