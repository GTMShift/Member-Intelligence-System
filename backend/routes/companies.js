const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// CREATE COMPANY
router.post('/', async (req, res) => {
  const { name, linkedin_url, domain, size, industry, sub_industry, overview, company_type, revenue, tags } = req.body;

  if (!name) return res.status(400).json({ error: 'name is required' });

  // Duplicate detection
  if (domain) {
    const { data: existing } = await supabase
      .from('companies')
      .select('id')
      .eq('domain', domain)
      .single();

    if (existing) return res.status(409).json({ error: 'A company with this domain already exists' });
  }

  const { data, error } = await supabase
    .from('companies')
    .insert({ name, linkedin_url, domain, size, industry, sub_industry, overview, company_type, revenue, tags })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// GET COMPANY
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('companies')
    .select()
    .eq('id', id)
    .single();

  if (error) return res.status(404).json({ error: 'Company not found' });
  res.json(data);
});

// UPDATE COMPANY
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, linkedin_url, domain, size, industry, sub_industry, overview, company_type, revenue, tags } = req.body;

  // Check company exists
  const { data: existing } = await supabase
    .from('companies')
    .select('id')
    .eq('id', id)
    .single();

  if (!existing) return res.status(404).json({ error: 'Company not found' });

  const { error } = await supabase
    .from('companies')
    .update({ name, linkedin_url, domain, size, industry, sub_industry, overview, company_type, revenue, tags })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Company updated', company_id: id });
});

module.exports = router;
