const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  const { lat, lon } = req.query;
  const latitude = lat || '34.05';   // Default Los Angeles
  const longitude = lon || '-118.24';

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto&forecast_days=4`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Weather fetch failed' });
  }
});

module.exports = router;
