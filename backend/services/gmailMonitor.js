const { google } = require('googleapis');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const { getAuthClient } = require('./gmailAuth');
const supabase = require('../supabaseClient');

const POLL_INTERVAL_MS = 60_000;
const WEBHOOK_URL = 'http://localhost:3000/webhook/email';

/** Internal team addresses — sent mail to these is skipped (not member outreach). */
const INTERNAL_EMAILS = [
  'james@solutionexec.com',
  'meghan@solutionexec.com',
  'chris@solutionexec.com',
];

function isBoomerangOrSelfSent({ subject, sender_email, recipient_email, body }) {
  return (
    subject?.toLowerCase().includes('boomerang') ||
    sender_email?.toLowerCase().includes('boomerang') ||
    sender_email?.toLowerCase().includes('baydin.com') ||
    body?.toLowerCase().includes('boomerang') ||
    body?.toLowerCase().includes('baydin.com') ||
    body?.toLowerCase().includes('message moved to top of inbox by boomerang') ||
    (!!sender_email &&
      !!recipient_email &&
      sender_email.toLowerCase() === recipient_email.toLowerCase())
  );
}

function extractEmailAddress(headerValue) {
  if (!headerValue) return null;
  const match = headerValue.match(/<([^>]+)>/);
  return (match ? match[1] : headerValue).trim().toLowerCase();
}

function getHeader(headers, name) {
  const found = headers?.find(
    (header) => header.name?.toLowerCase() === name.toLowerCase(),
  );
  return found?.value || null;
}

function decodeBase64Url(data) {
  if (!data) return '';
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function extractBodyFromPart(part) {
  if (!part) return { text: '', html: '' };

  let text = '';
  let html = '';

  if (part.mimeType === 'text/plain' && part.body?.data) {
    text += decodeBase64Url(part.body.data);
  }

  if (part.mimeType === 'text/html' && part.body?.data) {
    html += decodeBase64Url(part.body.data);
  }

  if (Array.isArray(part.parts)) {
    for (const child of part.parts) {
      const nested = extractBodyFromPart(child);
      text += nested.text;
      html += nested.html;
    }
  }

  return { text, html };
}

function extractBodyText(payload) {
  const { text, html } = extractBodyFromPart(payload);
  if (text.trim()) return text.trim();
  if (html.trim()) {
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (payload?.body?.data) {
    return decodeBase64Url(payload.body.data).trim();
  }
  return '';
}

async function summarizeEmail({ subject, sender, body }) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = `Summarize this email in 2-3 sentences. Focus on the key topic and the tone of the conversation.

Then end your response with exactly one final line in this format:
Action item: <brief description of the action needed>
If there is no action item, end with:
Action item: None

Subject: ${subject}
From: ${sender}
Body: ${body}`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 250,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content?.find((block) => block.type === 'text');
  return textBlock?.text?.trim() || 'No summary available.';
}

function parseOccurredAt(message, dateHeader) {
  if (message.internalDate) {
    return new Date(Number(message.internalDate)).toISOString();
  }
  if (dateHeader) {
    const parsed = new Date(dateHeader);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

async function processMessage(gmail, messageId) {
  const { data: message } = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  const headers = message.payload?.headers || [];
  const senderHeader = getHeader(headers, 'From');
  const recipientHeader = getHeader(headers, 'To');
  const subject = getHeader(headers, 'Subject') || '(no subject)';
  const dateHeader = getHeader(headers, 'Date');

  const sender_email = extractEmailAddress(senderHeader);
  const recipient_email = extractEmailAddress(recipientHeader);
  const body = extractBodyText(message.payload);
  const occurred_at = parseOccurredAt(message, dateHeader);
  const monitorEmail = (process.env.MONITOR_EMAIL || '').trim().toLowerCase();

  // Skip Boomerang notification emails before calling Claude or the webhook
  if (
    subject?.toLowerCase().includes('boomerang') ||
    sender_email?.toLowerCase().includes('boomerang') ||
    sender_email?.toLowerCase().includes('baydin.com') ||
    body?.toLowerCase().includes('boomerang') ||
    body?.toLowerCase().includes('baydin.com') ||
    body?.toLowerCase().includes('message moved to top of inbox by boomerang') ||
    (!!sender_email &&
      !!recipient_email &&
      sender_email.toLowerCase() === recipient_email.toLowerCase())
  ) {
    console.log(`[gmailMonitor] Skipping Boomerang or self-sent email: ${subject}`);
    return;
  }

  if (!sender_email || !recipient_email) {
    throw new Error('Could not extract sender or recipient email');
  }

  const direction = sender_email === monitorEmail ? 'sent' : 'received';
  // Only match against the other party — MONITOR_EMAIL is always on the email
  // and would make every message look like a member hit if it's in `members`.
  const lookupEmail = direction === 'sent' ? recipient_email : sender_email;

  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('email', lookupEmail)
    .maybeSingle();

  if (!member) {
    console.log(
      `Skipping email — no matching member found for ${lookupEmail}`,
    );
    return; // skip this email entirely, don't call Claude, don't call webhook
  }

  const summary = await summarizeEmail({
    subject,
    sender: senderHeader || sender_email,
    body: body.slice(0, 8000),
  });

  await axios.post(WEBHOOK_URL, {
    sender_email,
    recipient_email,
    subject,
    summary,
    direction,
    occurred_at,
    thread_id: message.threadId || null,
    logged_by: 'Gmail monitor',
  });

  await supabase
    .from('processed_emails')
    .insert({ gmail_message_id: messageId });

  console.log(
    `[gmailMonitor] Processed ${direction} email ${messageId}: "${subject}"`,
  );
}

async function pollUnreadEmails(gmail) {
  const monitorEmail = process.env.MONITOR_EMAIL;
  console.log(
    `[gmailMonitor] Checking unread mail for ${monitorEmail || '(MONITOR_EMAIL not set)'}…`,
  );

  const { data } = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread',
    maxResults: 25,
  });

  const messages = data.messages || [];
  if (messages.length === 0) {
    console.log('[gmailMonitor] No unread emails');
    return;
  }

  console.log(`[gmailMonitor] Found ${messages.length} unread email(s)`);

  for (const message of messages) {
    try {
      const messageId = message.id;

      const { data: alreadyProcessed } = await supabase
        .from('processed_emails')
        .select('id')
        .eq('gmail_message_id', messageId)
        .maybeSingle();

      if (alreadyProcessed) {
        console.log(`Skipping already processed email: ${messageId}`);
        continue;
      }

      await processMessage(gmail, messageId);
    } catch (error) {
      const details =
        error.response?.data ||
        error.error ||
        error.stack ||
        error.message ||
        String(error);
      console.error(
        `[gmailMonitor] Failed to process message ${message.id}:`,
        typeof details === 'string' ? details : JSON.stringify(details, null, 2),
      );
    }
  }
}

/**
 * Process a message from James's Sent folder. Looks up the RECIPIENT in
 * members (the person James emailed). Skips silently when not a member.
 */
async function processSentMessage(gmail, messageId) {
  const { data: message } = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  const headers = message.payload?.headers || [];
  const senderHeader = getHeader(headers, 'From');
  const recipientHeader = getHeader(headers, 'To');
  const subject = getHeader(headers, 'Subject') || '(no subject)';
  const dateHeader = getHeader(headers, 'Date');

  const sender_email = extractEmailAddress(senderHeader);
  const recipient_email = extractEmailAddress(recipientHeader);
  const body = extractBodyText(message.payload);
  const occurred_at = parseOccurredAt(message, dateHeader);

  if (
    isBoomerangOrSelfSent({
      subject,
      sender_email,
      recipient_email,
      body,
    })
  ) {
    console.log(
      `[gmailMonitor] Skipping Boomerang or self-sent email: ${subject}`,
    );
    return;
  }

  if (!sender_email || !recipient_email) {
    return;
  }

  const allInternalEmails = [
    ...INTERNAL_EMAILS,
    process.env.MONITOR_EMAIL?.toLowerCase(),
  ].filter(Boolean);

  if (allInternalEmails.includes(recipient_email)) {
    console.log(
      `[gmailMonitor] Skipping internal recipient: ${recipient_email}`,
    );
    return;
  }

  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('email', recipient_email)
    .maybeSingle();

  // James sends lots of non-member email — skip silently, no review flag.
  if (!member) {
    return;
  }

  const summary = await summarizeEmail({
    subject,
    sender: senderHeader || sender_email,
    body: body.slice(0, 8000),
  });

  await axios.post(WEBHOOK_URL, {
    sender_email,
    recipient_email,
    subject,
    summary,
    direction: 'sent',
    occurred_at,
    thread_id: message.threadId || null,
    logged_by: 'Gmail monitor',
  });

  await supabase
    .from('processed_emails')
    .insert({ gmail_message_id: messageId });

  console.log(
    `[gmailMonitor] Processed sent email ${messageId}: "${subject}" → ${recipient_email}`,
  );
}

async function pollSentEmails(gmail) {
  const monitorEmail = process.env.MONITOR_EMAIL;
  console.log(
    `[gmailMonitor] Checking sent mail for ${monitorEmail || '(MONITOR_EMAIL not set)'}…`,
  );

  const { data } = await gmail.users.messages.list({
    userId: 'me',
    labelIds: ['SENT'],
    q: 'newer_than:1d',
    maxResults: 25,
  });

  const messages = data.messages || [];
  if (messages.length === 0) {
    console.log('[gmailMonitor] No recent sent emails');
    return;
  }

  console.log(`[gmailMonitor] Found ${messages.length} recent sent email(s)`);

  for (const message of messages) {
    try {
      const messageId = message.id;

      const { data: alreadyProcessed } = await supabase
        .from('processed_emails')
        .select('id')
        .eq('gmail_message_id', messageId)
        .maybeSingle();

      if (alreadyProcessed) {
        continue;
      }

      await processSentMessage(gmail, messageId);
    } catch (error) {
      const details =
        error.response?.data ||
        error.error ||
        error.stack ||
        error.message ||
        String(error);
      console.error(
        `[gmailMonitor] Failed to process sent message ${message.id}:`,
        typeof details === 'string' ? details : JSON.stringify(details, null, 2),
      );
    }
  }
}

async function startMonitoring() {
  if (!process.env.MONITOR_EMAIL) {
    console.error('[gmailMonitor] MONITOR_EMAIL is not set in the environment');
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[gmailMonitor] ANTHROPIC_API_KEY is not set in the environment');
    process.exit(1);
  }

  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  console.log(
    `[gmailMonitor] Monitoring ${process.env.MONITOR_EMAIL} every ${POLL_INTERVAL_MS / 1000}s`,
  );

  const run = async () => {
    try {
      await pollUnreadEmails(gmail);
      await pollSentEmails(gmail);
    } catch (error) {
      console.error('[gmailMonitor] Poll failed:', error.message);
    }
  };

  await run();
  setInterval(run, POLL_INTERVAL_MS);
}

module.exports = { startMonitoring };
