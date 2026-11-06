const express = require('express');
const supabase = require('../supabaseClient');
const requireAdmin = require('../middleware/requireAdmin');

const router = express.Router();

router.get('/', requireAdmin, async (req, res) => {
  const { status } = req.query;
  const allowedStatuses = ['pending', 'approved', 'rejected'];

  if (status && !allowedStatuses.includes(status)) {
    return res.status(400).json({
      error: 'Status must be pending, approved, or rejected',
    });
  }

  let query = supabase
    .from('join_us_applications')
    .select(`
      id,
      first_name,
      last_name,
      email_address,
      linkedin,
      phone_number,
      company,
      job_title,
      status,
      created_at,
      reviewed_by,
      reviewed_at
    `)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data: applications, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ applications });
});

router.post('/:applicationId/approve', requireAdmin, async (req, res) => {
  const { applicationId } = req.params;

  const { data: application, error: fetchError } = await supabase
    .from('join_us_applications')
    .select('id, status')
    .eq('id', applicationId)
    .maybeSingle();

  if (fetchError) {
    return res.status(500).json({ error: fetchError.message });
  }

  if (!application) {
    return res.status(404).json({ error: 'Application not found' });
  }

  if (application.status !== 'pending') {
    return res.status(409).json({ error: 'Only pending applications can be approved' });
  }

  const { data: approvedApplication, error: approveError } = await supabase
    .from('join_us_applications')
    .update({status: 'approved', reviewed_by: req.user.id, reviewed_at: new Date().toISOString(),})
    .eq('id', applicationId)
    .select('id, status, member_id')
    .single();

  if (approveError) {
    if (approveError.message.includes('Ambiguous member match')) {
      return res.status(409).json({
        error: 'Approval needs admin review because the email and LinkedIn match different members.',
      });
    }

  return res.status(500).json({ error: approveError.message });
}

  return res.json({ application: approvedApplication });
});

router.post('/:applicationId/reject', requireAdmin, async (req, res) => {
  const { applicationId } = req.params;

  const { data: application, error: fetchError } = await supabase
    .from('join_us_applications')
    .select('id, status')
    .eq('id', applicationId)
    .maybeSingle();

  if (fetchError) {
    return res.status(500).json({ error: fetchError.message });
  }

  if (!application) {
    return res.status(404).json({ error: 'Application not found' });
  }

  if (application.status !== 'pending') {
    return res.status(409).json({ error: 'Only pending applications can be rejected' });
  }

  const { data: rejectedApplication, error: rejectError } = await supabase
    .from('join_us_applications')
    .update({status: 'rejected', reviewed_by: req.user.id, reviewed_at: new Date().toISOString(),})
    .eq('id', applicationId)
    .select('id, status')
    .single();

  if (rejectError) {
    return res.status(500).json({ error: rejectError.message });
  }

  return res.json({ application: rejectedApplication });
});

module.exports = router;