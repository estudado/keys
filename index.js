const express = require("express");
const fs = require("fs");
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const DATA_FILE = "keys.json";
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");

// Rota de verificação com correção de first-use
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
    if (!entry.usedAt) {
      entry.usedAt = now;
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
      return res.send("VALID");
    }

    const elapsed = now - entry.usedAt;
    if (elapsed <= 24 * 60 * 60 * 1000) return res.send("VALID");
    else return res.send("EXPIRED");
  }

  return res.send("USED_BY_OTHER");
});

app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});
