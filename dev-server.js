const express = require('express');
const path = require('path');
const app = express();

// Serve static files from webpack output
app.use('/js', express.static(path.join(__dirname, '.webpack/renderer/main_window')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Serve the HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '.webpack/renderer/main_window/index.html'));
});

const PORT = 3003;
app.listen(PORT, () => {
  console.log(`Development server running at http://localhost:${PORT}`);
  console.log('You can now access the app in your browser!');
});