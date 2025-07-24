const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const app = express();
const db = new Database('keys.db');

// Criação da tabela
db.prepare(`
  CREATE TABLE IF NOT EXISTS keys (
    key TEXT PRIMARY KEY,
    hwid TEXT,
    usedAt INTEGER
  )
`).run();

// Gera key aleatória
function gerarKey() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let key = '';
  for (let i = 0; i < 40; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

// Middleware opcional para logs
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Rota para gerar nova key
app.get('/', (req, res) => {
  const referer = req.headers.referer || '';
  const src = req.query.src || '';

  const isFromLinkvertise = referer.includes('linkvertise.com');
  const isFromLootlabs = referer.includes('loot-link.com') || src === 'lootlabs';

  if (!isFromLinkvertise && !isFromLootlabs) {
    return res.status(403).send(`
      <html>
        <body style="font-family:sans-serif;text-align:center;padding-top:100px;">
          <h1>Acesso Negado</h1>
          <p>Você precisa acessar este link através do Linkvertise ou LootLabs.</p>
        </body>
      </html>
    `);
  }

  const newKey = gerarKey();
  db.prepare("INSERT INTO keys (key, hwid, usedAt) VALUES (?, NULL, NULL)").run(newKey);

  res.send(`
    <html>
      <head><title>Sua Key</title></head>
      <body style="font-family:sans-serif;text-align:center;padding-top:100px;">
        <h1>Sua key exclusiva:</h1>
        <p style="font-size:22px;font-weight:bold;font-family:monospace">${newKey}</p>
        <p>Use no seu programa. A key é válida por 24h após o primeiro uso e apenas em 1 computador.</p>
      </body>
    </html>
  `);
});

// Rota para verificar a key
app.get('/check/:key', (req, res) => {
  const key = req.params.key.trim().toLowerCase();
  const hwid = (req.query.hwid || "").trim();

  if (!key || !hwid) return res.send("MISSING");

  const row = db.prepare("SELECT * FROM keys WHERE key = ?").get(key);
  const now = Date.now();

  if (!row) return res.send("INVALID");

  if (!row.hwid) {
    db.prepare("UPDATE keys SET hwid = ?, usedAt = ? WHERE key = ?").run(hwid, now, key);
    return res.send("VALID");
  }

  if (row.hwid === hwid) {
    const elapsed = now - row.usedAt;
    if (elapsed <= 24 * 60 * 60 * 1000) return res.send("VALID");
    return res.send("EXPIRED");
  }

  return res.send("USED_BY_OTHER");
});

// Inicia servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
