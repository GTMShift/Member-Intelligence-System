const express = require('express');
const axios = require('axios');
const router = express.Router();

router.get('/:enrichment_id', async (req, res) => {
  const { enrichment_id } = req.params;

  try {
    const response = await axios.get(
      `https://app.fullenrich.com/api/v1/contact/enrich/bulk/${enrichment_id}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FULLENRICH_API_KEY}`,
        },
        timeout: 15000,
      }
    );
    return res.json(response.data);
  } catch (error) {
    console.error('[enrichmentStatus.provider] failed', error.response?.status || 'unknown');
    return res.status(502).json({ error: 'Failed to fetch enrichment status' });
  }
});

module.exports = router;
