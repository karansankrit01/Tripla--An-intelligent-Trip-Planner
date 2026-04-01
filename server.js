import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import handler from './api/chat.js';

// Load environment variables from .env file if it exists
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Parse JSON bodies (just like Vercel automatically does)
app.use(express.json());

// Serve the frontend static files (HTML, CSS, JS) from the root directory
app.use(express.static(__dirname));

// Route the specific API call to the Vercel-style handler inside /api/
app.post('/api/chat', async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Any other GET request serves the main HTML file
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'tripla.html'));
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Server is running locally!`);
  console.log(`👉 Go to: http://localhost:${PORT}\n`);
});
