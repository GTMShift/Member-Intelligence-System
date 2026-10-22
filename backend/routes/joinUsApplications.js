const express = require('express');
const supabase = require('../supabaseClient');
const requireAdmin = require('../middleware/requireAdmin');

const router = express.Router();

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