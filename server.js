const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve the portfolio's static files.
app.use(express.static(__dirname));

// Express 5 requires a named wildcard for the SPA fallback.
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`HUS BETA is running on port ${PORT}`);
});
