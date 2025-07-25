const express = require("express");
const fs = require("fs");
const crypto = require("crypto");
const session = require("express-session");
const axios = require("axios");
const app = express();

app.set("trust proxy", 1);

app.use(session({
  secret: process.env.SESSION_SECRET || "segredo_admin_superforte",
  name: "sessionId",
  resave: false,
  saveUninitialized: false,
  cookie: {
    path: "/",
    httpOnly: true,
    secure: false,
    maxAge: 60 * 60 * 1000,
    sameSite: "lax",
  }
}));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const DATA_FILE = "keys.json";
const VALIDITY_DURATION = 24 * 60 * 60 * 1000; // 24h

if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

function saveKeys(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// 🔐 ROTA: transforma token do Workink em key final
app.get("/validate", async (req, res) => {
  const { hash, hwid } = req.query;
  if (!hash || !hwid) return res.status(400).send("MISSING");

  try {
    const response = await axios.get(`https://work.ink/_api/v2/token/isValid/${hash}?deleteToken=1`);
    if (!response.data.valid) return res.send("INVALID");

    const keys = JSON.parse(fs.readFileSync(DATA_FILE));

    // Se o token já foi usado como key, reenvia
    if (keys.find(k => k.key === hash)) return res.send(hash);

    const entry = {
      hwid,
      key: hash, // usa o token como key final
      timestamp: Date.now(),
      permanente: false,
      activatedAt: null
    };

    keys.push(entry);
    saveKeys(keys);
    return res.send(hash);
  } catch (err) {
    console.error("Erro validate:", err.message);
    return res.status(500).send("ERROR");
  }
});

// 🔐 ROTA: validação da key final usada no executor
app.get("/admin/check/:key", (req, res) => {
  const { key } = req.params;
  const { hwid } = req.query;
  if (!key) return res.send("MISSING");

  const data = JSON.parse(fs.readFileSync(DATA_FILE));
  const entry = data.find(k => k.key === key);
  if (!entry) return res.send("INVALID");

  // Salva hwid se ainda não estiver associado (opcional)
  if (!entry.hwid && hwid) {
    entry.hwid = hwid;
    entry.activatedAt = Date.now();
    saveKeys(data);
  }

  // REMOVE o bloqueio por HWID
  // if (entry.hwid !== hwid) return res.send("USED_BY_OTHER");

  // Verifica expiração (exceto permanente)
  if (!entry.permanente && entry.activatedAt && Date.now() - entry.activatedAt > VALIDITY_DURATION)
    return res.send("EXPIRED");

  return res.send("VALID");
});

// 🛠 Painel admin (opcional)
app.get("/admin", (req, res) => {
  if (req.session.loggedIn) return res.redirect("/admin/dashboard");
  res.send(`
    <form method="POST" action="/admin/login">
      <input type="password" name="senha" placeholder="Senha admin" required/>
      <button>Entrar</button>
    </form>
  `);
});

app.post("/admin/login", (req, res) => {
  if (req.body.senha === ADMIN_PASSWORD) {
    req.session.loggedIn = true;
    return res.sendStatus(200);
  }
  return res.sendStatus(401);
});

app.get("/admin/dashboard", (req, res) => {
  if (!req.session.loggedIn) return res.redirect("/admin");

  const keys = JSON.parse(fs.readFileSync(DATA_FILE));
  const lista = keys.map(k =>
    `<li>${k.hwid || "?"}: ${k.key} ${k.permanente ? "(PERM)" : ""}</li>`
  ).join("");

  res.send(`
    <h1>Admin - Keys</h1>
    <ul>${lista}</ul>
    <form method="POST" action="/admin/delete">
      <input name="key" placeholder="Key/token para deletar" required/>
      <button>Deletar</button>
    </form>
  `);
});

// Deletar key por token
app.post("/admin/delete", (req, res) => {
  if (!req.session.loggedIn) return res.sendStatus(403);
  const { key } = req.body;

  let data = JSON.parse(fs.readFileSync(DATA_FILE));
  data = data.filter(k => k.key !== key);
  saveKeys(data);
  return res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("✅ Server rodando na porta", PORT));
