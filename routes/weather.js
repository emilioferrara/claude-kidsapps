const express = require('express');
const https = require('https');
const router = express.Router();

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    options.family = 4; // Force IPv4
    https.get(options, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON')); }
      });
    }).on('error', reject);
  });
}

router.get('/', async (req, res) => {
  const { lat, lon } = req.query;
  const latitude = lat || '34.05';   // Default Los Angeles
  const longitude = lon || '-118.24';

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto&forecast_days=4`;
    const data = await httpsGet(url);
    res.json(data);
  } catch (err) {
    console.error('[weather]', err.message);
    res.status(500).json({ error: 'Weather fetch failed' });
  }
});

module.exports = router;
