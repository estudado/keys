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
    path: "/",              // cookie válido em todas as rotas  
    httpOnly: true,
    secure: false,          // defina true se usar HTTPS
    maxAge: 60 * 60 * 1000,
    sameSite: "lax",
  }
}));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const DATA_FILE = "keys.json";
const VALIDITY_DURATION = 10 * 60 * 1000;

if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");

function gerarKey() {
  return crypto.randomBytes(20).toString("hex");
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Rota pública básica
app.get("/", (_req, res) => {
  res.send("Sistema de Keys: Utilize /go?hwid=SEU_HWID ou /validate");
});

// Rota validate (via work.ink)
app.get("/validate", async (req, res) => {
  const { hash, hwid } = req.query;
  if (!hash || !hwid) return res.status(400).send("MISSING");
  try {
    const resp = await axios.get(`https://work.ink/_api/v2/token/isValid/${hash}?deleteToken=1`);
    if (!resp.data.valid) return res.send("INVALID");

    const keys = JSON.parse(fs.readFileSync(DATA_FILE));
    let entry = keys.find(k => k.hwid === hwid && !k.consumed);
    if (!entry) {
      entry = { hwid, key: gerarKey(), timestamp: Date.now(), consumed: false };
      keys.push(entry);
      fs.writeFileSync(DATA_FILE, JSON.stringify(keys, null, 2));
    }
    return res.send(entry.key);
  } catch (err) {
    console.error("Erro validate:", err);
    return res.status(500).send("ERROR");
  }
});

// Login admin
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

// Dashboard admin
app.get("/admin/dashboard", (req, res) => {
  if (!req.session.loggedIn) return res.redirect("/admin");
  const keys = JSON.parse(fs.readFileSync(DATA_FILE));
  const lista = keys.map(k =>
    `<li>${k.hwid}: ${k.key} ${k.permanente ? "(PERM)" : ""}</li>`
  ).join("");
  res.send(`
    <h1>Admin - Keys</h1><ul>${lista}</ul>
    <form method="POST" action="/admin/create"><input name="hwid" placeholder="HWID" required/><button>Criar Key</button></form>
    <form method="POST" action="/admin/create-perm"><input name="hwid" placeholder="HWID" required/><button>Criar PERM</button></form>
    <form method="POST" action="/admin/delete"><input name="hwid" placeholder="HWID" required/><button>Deletar</button></form>
  `);
});

// Criação key normal retorna JSON
app.post("/admin/create", (req, res) => {
  if (!req.session.loggedIn) return res.sendStatus(403);
  const { hwid } = req.body;
  const data = JSON.parse(fs.readFileSync(DATA_FILE));
  if (data.find(k => k.hwid === hwid)) return res.status(409).send("Já existe");
  const key = gerarKey();
  const entry = { hwid, key, timestamp: Date.now() };
  data.push(entry);
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  console.log("Key criada:", entry);
  return res.json(entry);
});

// Criação key permanente retorna JSON
app.post("/admin/create-perm", (req, res) => {
  if (!req.session.loggedIn) return res.sendStatus(403);
  const { hwid } = req.body;
  const data = JSON.parse(fs.readFileSync(DATA_FILE));
  if (data.find(k => k.hwid === hwid)) return res.status(409).send("Já existe");
  const key = gerarKey();
  const entry = { hwid, key, permanente: true, timestamp: Date.now() };
  data.push(entry);
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  console.log("Key PERM criada:", entry);
  return res.json(entry);
});

// Deletar key
app.post("/admin/delete", (req, res) => {
  if (!req.session.loggedIn) return res.sendStatus(403);
  const { hwid } = req.body;
  let data = JSON.parse(fs.readFileSync(DATA_FILE));
  data = data.filter(k => k.hwid !== hwid);
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  return res.sendStatus(200);
});

// Executor verifica key
const VALIDITY_DURATION = 24 * 60 * 60 * 1000; // 24 horas

app.get('/admin/check/:key', (req, res) => {
  const { key } = req.params;
  const { hwid } = req.query;
  if (!key || !hwid) return res.send('MISSING');

  const data = JSON.parse(fs.readFileSync(DATA_FILE));
  const entry = data.find(k => k.key === key);
  if (!entry) return res.send('INVALID');

  if (entry.hwid === undefined) {
    entry.hwid = hwid;
    entry.activatedAt = Date.now();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  }

  if (entry.hwid !== hwid) {
    return res.send('USED_BY_OTHER');
  }

  if (!entry.permanente && (Date.now() - entry.activatedAt > VALIDITY_DURATION)) {
    return res.send('EXPIRED');
  }

  res.send('VALID');
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));
