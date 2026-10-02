// =============================================
//  SHORTIFY – server.js
//  Simple URL Shortener backend
//  Tech: Node.js + Express + PostgreSQL (pg)
// =============================================

const express = require('express');
require('dotenv').config();
const { Pool } = require('pg');
const path = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// Production settings
app.disable('x-powered-by');
app.set('trust proxy', 1); // Trust only the first hop (closest reverse proxy/load balancer)

// -----------------------------------------------
// 1. Connect to PostgreSQL database (Neon)
// -----------------------------------------------
if (!process.env.DATABASE_URL) {
  console.error('FATAL ERROR: DATABASE_URL environment variable is not set.');
  process.exit(1);
}

// Neon PostgreSQL requires SSL connections
const isLocalhost = process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalhost ? false : { rejectUnauthorized: false }
});

pool.connect((err) => {
  if (err) {
    console.error('Could not connect to PostgreSQL database:', err.message);
  } else {
    console.log('Connected to PostgreSQL database.');
  }
});

// -----------------------------------------------
// 2. Create tables if they don't exist
//    - urls      : stores original URL + short code
//    - clicks    : stores one row per visit to a short URL
// -----------------------------------------------
pool.query(`
  CREATE TABLE IF NOT EXISTS urls (
    id           SERIAL PRIMARY KEY,
    original_url TEXT    NOT NULL,
    short_code   TEXT    NOT NULL UNIQUE,
    created_at   TEXT    NOT NULL
  );
  ALTER TABLE urls ADD COLUMN IF NOT EXISTS expires_at TEXT;
`).catch(err => console.error('urls table error:', err.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS clicks (
    id         SERIAL PRIMARY KEY,
    short_code TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    referrer   TEXT,
    clicked_at TEXT NOT NULL
  )
`).catch(err => console.error('clicks table error:', err.message));

// -----------------------------------------------
// 3. Middleware
// -----------------------------------------------
app.use(express.json());                                    // Parse JSON bodies
app.use(express.static(path.join(__dirname, 'public')));   // Serve frontend

// -----------------------------------------------
// 4. Helper: Generate a random 6-character short code
// -----------------------------------------------
function generateShortCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// -----------------------------------------------
// 5. Helper: Parse browser + OS from User-Agent string
// -----------------------------------------------
function parseBrowserOS(ua) {
  if (!ua) return 'Unknown';

  // Detect OS
  let os = 'Unknown OS';
  if (/Windows/i.test(ua))        os = 'Windows';
  else if (/iPhone/i.test(ua))    os = 'iPhone';
  else if (/iPad/i.test(ua))      os = 'iPad';
  else if (/Android/i.test(ua))   os = 'Android';
  else if (/Mac OS X/i.test(ua))  os = 'Mac';
  else if (/Linux/i.test(ua))     os = 'Linux';

  // Detect Browser (order matters – check Edge/OPR before Chrome)
  let browser = 'Unknown Browser';
  if (/Edg\//i.test(ua))          browser = 'Edge';
  else if (/OPR\//i.test(ua))     browser = 'Opera';
  else if (/Firefox/i.test(ua))   browser = 'Firefox';
  else if (/Chrome/i.test(ua))    browser = 'Chrome';
  else if (/Safari/i.test(ua))    browser = 'Safari';

  return `${browser} / ${os}`;
}

// -----------------------------------------------
// 6. Helper: Mask an IP address for the UI
// -----------------------------------------------
function maskIP(ip) {
  if (!ip) return 'Unknown';
  const ipv4 = ip.replace(/^::ffff:/, '');
  const parts = ipv4.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.xxx.xxx.xxx`;
  }
  return ip.split(':')[0] + ':xxxx:xxxx:xxxx';
}

// -----------------------------------------------
// 6.5 GET /health  – Health check for production
// -----------------------------------------------
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// -----------------------------------------------
// 7. POST /shorten  – Create a short URL (unchanged)
// -----------------------------------------------
app.post('/shorten', (req, res) => {
  const { originalURL, expiresIn } = req.body;

  // Validate: URL must not be empty
  if (!originalURL || originalURL.trim() === '') {
    return res.status(400).json({ error: 'URL cannot be empty.' });
  }

  // Validate: URL must be a valid format
  try {
    new URL(originalURL);
  } catch {
    return res.status(400).json({ error: 'Invalid URL. Make sure it starts with http:// or https://' });
  }

  const shortCode = generateShortCode();
  const createdAt = new Date().toISOString();
  
  let expiresAt = null;
  if (expiresIn && expiresIn !== 'never') {
    const hours = parseInt(expiresIn, 10);
    if (!isNaN(hours)) {
      expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    }
  }

  // Save to database
  const sql = 'INSERT INTO urls (original_url, short_code, created_at, expires_at) VALUES ($1, $2, $3, $4)';
  pool.query(sql, [originalURL, shortCode, createdAt, expiresAt], function (err) {
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    
    if (err) {
      if (err.code === '23505') { // PostgreSQL unique constraint violation error code
        const newCode = generateShortCode();
        pool.query(sql, [originalURL, newCode, createdAt, expiresAt], function (err2) {
          if (err2) return res.status(500).json({ error: 'Database error. Please try again.' });
          return res.json({ shortURL: `${baseUrl}/${newCode}` });
        });
      } else {
        return res.status(500).json({ error: 'Database error. Please try again.' });
      }
    } else {
      return res.json({ shortURL: `${baseUrl}/${shortCode}` });
    }
  });
});

// -----------------------------------------------
// 8. GET /stats/:shortCode  – Return click statistics
// -----------------------------------------------
app.get('/stats/:shortCode', (req, res) => {
  const { shortCode } = req.params;

  // First, check the short code exists
  pool.query('SELECT short_code FROM urls WHERE short_code = $1', [shortCode], (err, urlRes) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    if (urlRes.rowCount === 0) return res.status(404).json({ error: 'Short code not found.' });

    // Count total clicks
    pool.query('SELECT COUNT(*) AS total FROM clicks WHERE short_code = $1', [shortCode], (err2, countRes) => {
      if (err2) return res.status(500).json({ error: 'Database error.' });

      // Get latest 20 clicks
      pool.query(
        'SELECT ip_address, user_agent, referrer, clicked_at FROM clicks WHERE short_code = $1 ORDER BY clicked_at DESC LIMIT 20',
        [shortCode],
        (err3, rowsRes) => {
          if (err3) return res.status(500).json({ error: 'Database error.' });

          // Format each click for the frontend
          const clicks = rowsRes.rows.map(row => ({
            time:      row.clicked_at,
            device:    parseBrowserOS(row.user_agent),
            referrer:  row.referrer || 'Direct',
            ip:        maskIP(row.ip_address)
          }));

          return res.json({
            shortCode,
            totalClicks: parseInt(countRes.rows[0].total, 10), // COUNT returns a bigint string in node-pg
            clicks
          });
        }
      );
    });
  });
});

// -----------------------------------------------
// 9. GET /:shortCode  – Redirect + record click
// -----------------------------------------------
app.get('/:shortCode', (req, res) => {
  const { shortCode } = req.params;

  pool.query('SELECT original_url, expires_at FROM urls WHERE short_code = $1', [shortCode], (err, rowRes) => {
    if (err) {
      return res.status(500).send('Database error.');
    }

    const show404 = (reason) => {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>Not Found – Shortify</title>
          <style>
            body { font-family: sans-serif; background: #0f0f1a; color: #e0e0f0;
                   display: flex; flex-direction: column; align-items: center;
                   justify-content: center; height: 100vh; gap: 12px; margin: 0; }
            h2   { color: #f87171; font-size: 1.8rem; }
            p    { color: #94a3b8; }
            a    { color: #60a5fa; text-decoration: none; }
            a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <h2>404 – Short URL ${reason}</h2>
          <p>The short code "<strong>${shortCode}</strong>" is invalid or expired.</p>
          <a href="/">← Go back to Shortify</a>
        </body>
        </html>
      `);
    };

    if (rowRes.rowCount === 0) {
      return show404('Not Found');
    }

    const { original_url, expires_at } = rowRes.rows[0];

    // Check expiration
    if (expires_at && new Date() > new Date(expires_at)) {
      return show404('Expired');
    }
    // --- Record the click in the clicks table ---
    const ip        = req.ip;
    const userAgent = req.headers['user-agent'] || null;
    const referrer  = req.headers['referer'] || null;
    const clickedAt = new Date().toISOString();

    pool.query(
      'INSERT INTO clicks (short_code, ip_address, user_agent, referrer, clicked_at) VALUES ($1, $2, $3, $4, $5)',
      [shortCode, ip, userAgent, referrer, clickedAt],
      (insertErr) => {
        if (insertErr) console.error('Click insert error:', insertErr.message);
        // Redirect regardless of whether the click was recorded
        return res.redirect(original_url);
      }
    );
  });
});

// -----------------------------------------------
// 10. Start the server (or export for Vercel)
// -----------------------------------------------
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Shortify is running on port ${PORT}`);
  });
}

// Export the Express app for Vercel serverless deployment
module.exports = app;
