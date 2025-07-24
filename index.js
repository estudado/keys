const express = require("express");
const fs = require("fs");
const app = express();

const DATA_FILE = "keys.json";
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");

function gerarKey() {
  const caracteres = "abcdefghijklmnopqrstuvwxyz0123456789";
  let key = "";
  for (let i = 0; i < 40; i++) {
    key += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
  }
  return key;
}

app.get("/go", (req, res) => {
  const hwid = req.query.hwid;
  if (!hwid) return res.status(400).send("HWID ausente.");
  res.redirect(`/?src=linkvertise&hwid=${encodeURIComponent(hwid)}`);
});

app.get("/", (req, res) => {
  try {
    const referer = req.headers.referer || "";
    const src = req.query.src || "";
    const hwid = (req.query.hwid || "").trim();

    const isFromLinkvertise = referer.includes("linkvertise.com") || src === "linkvertise";
    const isFromLootlabs = referer.includes("loot-link.com") || src === "lootlabs";

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

    if (!hwid) {
      return res.status(400).send("HWID é obrigatório para gerar a key.");
    }

    const now = Date.now();
    const data = JSON.parse(fs.readFileSync(DATA_FILE));
    const ultimaGeracao = data.find(e => e.hwid === hwid && e.generatedAt);

    if (ultimaGeracao && now - ultimaGeracao.generatedAt < 24 * 60 * 60 * 1000) {
      const restante = Math.ceil((24 * 60 * 60 * 1000 - (now - ultimaGeracao.generatedAt)) / (60 * 1000));
      return res.send(`
        <html>
          <body style="font-family:sans-serif;text-align:center;padding-top:100px;">
            <h1>Limite diário atingido</h1>
            <p>Você já gerou uma key hoje. Tente novamente em aproximadamente ${restante} minutos.</p>
          </body>
        </html>
      `);
    }

    const newKey = gerarKey();
    data.push({ key: newKey, hwid: hwid, usedAt: null, generatedAt: now });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

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
  } catch (err) {
    console.error("Erro na rota /:", err);
    res.status(500).send("Erro interno no servidor.");
  }
});

app.get("/check/:key", (req, res) => {
  const key = req.params.key.trim().toLowerCase();
  const hwid = (req.query.hwid || "").trim();

  if (!key || !hwid) return res.send("MISSING");

  let data = JSON.parse(fs.readFileSync(DATA_FILE));
  const entry = data.find(k => k.key === key);

  if (!entry) return res.send("INVALID");

  const now = Date.now();

  if (!entry.hwid) {
    entry.hwid = hwid;
    entry.usedAt = now;
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return res.send("VALID");
  }

  if (entry.hwid === hwid) {
    const elapsed = now - entry.usedAt;
    if (elapsed <= 24 * 60 * 60 * 1000) return res.send("VALID");
    else return res.send("EXPIRED");
  }

  return res.send("USED_BY_OTHER");
});

app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});
