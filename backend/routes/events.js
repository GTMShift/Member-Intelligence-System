const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const { isValidEnum } = require('../utils/validate');

const VALID_RSVP_STATUSES = ['registered', 'attended', 'no_show', 'canceled'];

// CREATE EVENT
router.post('/', async (req, res) => {
  const { luma_event_id, event_name, event_date, event_type, capacity, location } = req.body;

  if (!event_name || !event_date || !event_type) {
    return res.status(400).json({ error: 'event_name, event_date, and event_type are required' });
  }

  // Duplicate detection via luma_event_id
  if (luma_event_id) {
    const { data: existing } = await supabase
      .from('events')
      .select('id')
      .eq('luma_event_id', luma_event_id)
      .single();

    if (existing) return res.status(409).json({ error: 'An event with this luma_event_id already exists' });
  }

  const { data, error } = await supabase
    .from('events')
    .insert({ luma_event_id, event_name, event_date, event_type, capacity, location })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// GET EVENT
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('events')
    .select()
    .eq('id', id)
    .single();

  if (error) return res.status(404).json({ error: 'Event not found' });
  res.json(data);
});

// GET ALL EVENTS
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('events')
    .select()
    .order('event_date', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// SIGN UP MEMBER FOR EVENT
router.post('/:id/signup', async (req, res) => {
  const { id } = req.params;
  const { member_id, rsvp_status, signup_date, event_goal, approval_status } = req.body;

  if (!member_id || !rsvp_status) {
    return res.status(400).json({ error: 'member_id and rsvp_status are required' });
  }

  if (!isValidEnum(rsvp_status, VALID_RSVP_STATUSES)) {
    return res.status(400).json({ error: `Invalid rsvp_status. Must be one of: ${VALID_RSVP_STATUSES.join(', ')}` });
  }

  // Check event exists
  const { data: event } = await supabase
    .from('events')
    .select('id')
    .eq('id', id)
    .single();

  if (!event) return res.status(404).json({ error: 'Event not found' });

  // Check member exists
  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('id', member_id)
    .single();

  if (!member) return res.status(404).json({ error: 'Member not found' });

  // Duplicate signup detection
  const { data: existingSignup } = await supabase
    .from('event_signups')
    .select('id')
    .eq('member_id', member_id)
    .eq('event_id', id)
    .single();

  if (existingSignup) return res.status(409).json({ error: 'Member is already signed up for this event' });

  const { data, error } = await supabase
    .from('event_signups')
    .insert({ event_id: id, member_id, rsvp_status, signup_date, event_goal, approval_status })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// GET ALL SIGNUPS FOR AN EVENT
router.get('/:id/signups', async (req, res) => {
  const { id } = req.params;

  // Check event exists
  const { data: event } = await supabase
    .from('events')
    .select('id')
    .eq('id', id)
    .single();

  if (!event) return res.status(404).json({ error: 'Event not found' });

  const { data, error } = await supabase
    .from('event_signups')
    .select()
    .eq('event_id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// UPDATE SIGNUP STATUS
router.put('/:id/signup/:signupId', async (req, res) => {
  const { signupId } = req.params;
  const { rsvp_status, event_goal, approval_status } = req.body;

  if (rsvp_status && !isValidEnum(rsvp_status, VALID_RSVP_STATUSES)) {
    return res.status(400).json({ error: `Invalid rsvp_status. Must be one of: ${VALID_RSVP_STATUSES.join(', ')}` });
  }

  // Check signup exists
  const { data: existing } = await supabase
    .from('event_signups')
    .select('id')
    .eq('id', signupId)
    .single();

  if (!existing) return res.status(404).json({ error: 'Signup not found' });

  const { error } = await supabase
    .from('event_signups')
    .update({ rsvp_status, event_goal, approval_status })
    .eq('id', signupId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Signup updated', signup_id: signupId });
});

module.exports = router;
