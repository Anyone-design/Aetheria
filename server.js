// ==========================================================================
// AETHERIA REST API & STATIC SERVER
// Zero-dependency Full-Stack Server using Node.js v24 Built-In SQLite & Crypto
// ==========================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'aetheria.db');

// --- 1. Database Initialization ---
const db = new DatabaseSync(DB_PATH);

// Enable WAL mode and foreign keys for high performance and integrity
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    theme TEXT DEFAULT 'neon-cyan',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS missions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    done INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notes (
    user_id INTEGER PRIMARY KEY,
    content TEXT DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Persistent HMAC Signing Secret across server reboots
let secretRow = db.prepare('SELECT value FROM config WHERE key = ?').get('jwt_secret');
let JWT_SECRET;
if (!secretRow) {
  JWT_SECRET = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('jwt_secret', JWT_SECRET);
} else {
  JWT_SECRET = secretRow.value;
}

// --- 2. Cryptographic Security & Auth Helpers ---
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, storedHash) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
}

function generateToken(userId) {
  const payload = Buffer.from(JSON.stringify({ userId, iat: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data;
  } catch (e) {
    return null;
  }
}

function getAuthenticatedUser(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  const tokenData = verifyToken(token);
  if (!tokenData || !tokenData.userId) return null;
  return db.prepare('SELECT id, name, email, theme, created_at FROM users WHERE id = ?').get(tokenData.userId) || null;
}

// --- 3. HTTP Request & Response Utilities ---
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) { // 1MB payload limit
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// --- 4. Main HTTP Router ---
const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;
  const method = req.method;

  // Handle CORS Pre-flight Options
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // ========================================================================
  // REST API ROUTES (/api/...)
  // ========================================================================

  // --- Auth: Register ---
  if (method === 'POST' && pathname === '/api/auth/register') {
    const body = await parseJsonBody(req);
    const { name, email, password } = body;

    if (!email || !password) {
      return sendJson(res, 400, { error: 'Email and password are required.' });
    }
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanName = (name && String(name).trim()) ? String(name).trim() : cleanEmail.split('@')[0];

    if (password.length < 6) {
      return sendJson(res, 400, { error: 'Password must be at least 6 characters.' });
    }

    // Check existing email
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existing) {
      return sendJson(res, 409, { error: 'This email is already registered.' });
    }

    // Hash Password securely
    const { salt, hash } = hashPassword(password);
    const insertUser = db.prepare('INSERT INTO users (name, email, password_hash, salt) VALUES (?, ?, ?, ?)');
    const result = insertUser.run(cleanName, cleanEmail, hash, salt);
    const userId = Number(result.lastInsertRowid);

    // Seed 3 starter missions
    const insertMission = db.prepare('INSERT INTO missions (user_id, text, done) VALUES (?, ?, ?)');
    insertMission.run(userId, 'Explore the animated command center', 1);
    insertMission.run(userId, 'Set a priority goal for 2027', 0);
    insertMission.run(userId, 'Test scratchpad auto-save', 0);

    // Seed empty note
    db.prepare('INSERT INTO notes (user_id, content) VALUES (?, ?)').run(userId, '');

    const token = generateToken(userId);
    return sendJson(res, 201, {
      token,
      user: { id: userId, name: cleanName, email: cleanEmail, theme: 'neon-cyan' }
    });
  }

  // --- Auth: Login ---
  if (method === 'POST' && pathname === '/api/auth/login') {
    const body = await parseJsonBody(req);
    const { email, password } = body;

    if (!email || !password) {
      return sendJson(res, 400, { error: 'Email and password are required.' });
    }
    const cleanEmail = String(email).trim().toLowerCase();

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
    if (!user) {
      return sendJson(res, 401, { error: 'Invalid email or password.' });
    }

    const isValid = verifyPassword(password, user.salt, user.password_hash);
    if (!isValid) {
      return sendJson(res, 401, { error: 'Invalid email or password.' });
    }

    const token = generateToken(user.id);
    return sendJson(res, 200, {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        theme: user.theme || 'neon-cyan'
      }
    });
  }

  // --- Auth: Get Current Profile (/api/auth/me) ---
  if (method === 'GET' && pathname === '/api/auth/me') {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized session.' });
    return sendJson(res, 200, { user });
  }

  // --- Auth: Update Theme ---
  if (method === 'PUT' && pathname === '/api/auth/theme') {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized session.' });
    const body = await parseJsonBody(req);
    const theme = String(body.theme || 'neon-cyan');
    db.prepare('UPDATE users SET theme = ? WHERE id = ?').run(theme, user.id);
    return sendJson(res, 200, { success: true, theme });
  }

  // --- Missions: List All ---
  if (method === 'GET' && pathname === '/api/missions') {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized session.' });
    const rows = db.prepare('SELECT id, text, done, created_at FROM missions WHERE user_id = ? ORDER BY id DESC').all(user.id);
    const missions = rows.map(r => ({
      id: r.id,
      text: r.text,
      done: Boolean(r.done),
      createdAt: r.created_at
    }));
    return sendJson(res, 200, { missions });
  }

  // --- Missions: Create ---
  if (method === 'POST' && pathname === '/api/missions') {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized session.' });
    const body = await parseJsonBody(req);
    const text = (body.text && String(body.text).trim()) ? String(body.text).trim() : '';
    if (!text) {
      return sendJson(res, 400, { error: 'Mission text cannot be empty.' });
    }
    const insertRes = db.prepare('INSERT INTO missions (user_id, text, done) VALUES (?, ?, 0)').run(user.id, text);
    return sendJson(res, 201, {
      mission: {
        id: Number(insertRes.lastInsertRowid),
        text,
        done: false
      }
    });
  }

  // --- Missions: Toggle Done Status ---
  if (method === 'PATCH' && pathname.startsWith('/api/missions/')) {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized session.' });
    const missionId = Number(pathname.split('/')[3]);
    if (!missionId) return sendJson(res, 400, { error: 'Invalid mission ID.' });
    const body = await parseJsonBody(req);
    const doneVal = body.done ? 1 : 0;
    const resUpdate = db.prepare('UPDATE missions SET done = ? WHERE id = ? AND user_id = ?').run(doneVal, missionId, user.id);
    if (resUpdate.changes === 0) {
      return sendJson(res, 404, { error: 'Mission not found.' });
    }
    return sendJson(res, 200, { success: true, id: missionId, done: Boolean(doneVal) });
  }

  // --- Missions: Delete ---
  if (method === 'DELETE' && pathname.startsWith('/api/missions/')) {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized session.' });
    const missionId = Number(pathname.split('/')[3]);
    if (!missionId) return sendJson(res, 400, { error: 'Invalid mission ID.' });
    const resDel = db.prepare('DELETE FROM missions WHERE id = ? AND user_id = ?').run(missionId, user.id);
    if (resDel.changes === 0) {
      return sendJson(res, 404, { error: 'Mission not found.' });
    }
    return sendJson(res, 200, { success: true, id: missionId });
  }

  // --- Scratchpad: Get Content ---
  if (method === 'GET' && pathname === '/api/scratchpad') {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized session.' });
    const row = db.prepare('SELECT content FROM notes WHERE user_id = ?').get(user.id);
    return sendJson(res, 200, { content: row ? row.content : '' });
  }

  // --- Scratchpad: Update / Save ---
  if (method === 'PUT' && pathname === '/api/scratchpad') {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized session.' });
    const body = await parseJsonBody(req);
    const content = typeof body.content === 'string' ? body.content : '';
    db.prepare(`
      INSERT INTO notes (user_id, content, updated_at) 
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP
    `).run(user.id, content);
    return sendJson(res, 200, { success: true });
  }

  // ========================================================================
  // STATIC FILE HANDLER
  // ========================================================================
  let reqPath = pathname === '/' ? '/index.html' : pathname;
  // Prevent directory traversal
  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, safePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n🌌 Aetheria Backend & Database Engine Online`);
  console.log(`📡 REST API & Client running at: http://localhost:${PORT}`);
  console.log(`🗄️ SQLite Database File: ${DB_PATH}\n`);
});
