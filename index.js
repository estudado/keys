const express = require("express");
const fs = require("fs");
const crypto = require("crypto");
const axios = require("axios");
const session = require("express-session");
const app = express();

app.set("trust proxy", 1); // necessário atrás de proxy (ex: Render)

app.use(session({
  secret: process.env.SESSION_SECRET || "segredo_admin_superforte",
  name: "sessionId",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 1000, // 1 hora
    sameSite: "lax",
  }
}));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const DATA_FILE = "keys.json";

if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");

const VALIDITY_DURATION = 10 * 60 * 1000; // 10 minutos

function gerarKey() {
  return crypto.randomBytes(20).toString("hex");
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", (_req, res) => {
  res.send("Sistema de Keys: Acesse /go?hwid=SEU_HWID");
});

app.get("/go", async (req, res) => {
  // fluxo original do encurtador omitido por brevidade
  res.send("Fluxo de /go conforme seu código anterior");
});

app.get("/validate", async (req, res) => {
  const { hash, hwid } = req.query;
  if (!hash || !hwid) return res.status(400).send("MISSING");

  try {
    const resp = await axios.get(`https://work.ink/_api/v2/token/isValid/${hash}?deleteToken=1`);
    if (!resp.data.valid) return res.send("INVALID");

    const keysData = JSON.parse(fs.readFileSync(DATA_FILE));
    let entry = keysData.find(k => k.hwid === hwid);
    if (!entry) {
      entry = { hwid, key: gerarKey(), timestamp: Date.now() };
      keysData.push(entry);
      fs.writeFileSync(DATA_FILE, JSON.stringify(keysData, null, 2));
    }
    return res.send(entry.key);
  } catch (err) {
    console.error("Erro validate:", err);
    return res.status(500).send("ERROR");
  }
});

// LOGIN ADMIN
app.get("/admin", (req, res) => {
  if (req.session.loggedIn) return res.redirect("/admin/dashboard");
  res.send(`<form method="POST" action="/admin/login">
    <input type="password" name="senha" placeholder="Senha admin" required />
    <button type="submit">Entrar</button>
  </form>`);
});

app.post("/admin/login", (req, res) => {
  if (req.body.senha === ADMIN_PASSWORD) {
    req.session.loggedIn = true;
    return res.redirect("/admin/dashboard");
  }
  res.send("Senha incorreta.");
});

// DASHBOARD ADMIN
app.get("/admin/dashboard", (req, res) => {
  if (!req.session.loggedIn) return res.redirect("/admin");
  const keys = JSON.parse(fs.readFileSync(DATA_FILE));
  const htmlList = keys.map(k =>
    `<li>${k.hwid}: ${k.key} ${k.permanente ? "(PERM)" : ""}</li>`
  ).join("");
  res.send(`<h1>Admin - Keys</h1><ul>${htmlList}</ul>
    <form method="POST" action="/admin/create"><input name="hwid" placeholder="HWID" required/><button>Criar</button></form>
    <form method="POST" action="/admin/create-perm"><input name="hwid" placeholder="HWID" required/><button>Criar PERM</button></form>
    <form method="POST" action="/admin/delete"><input name="hwid" placeholder="HWID" required/><button>Deletar</button></form>`);
});

// AÇÕES ADMIN
app.post("/admin/create", (req, res) => {
  if (!req.session.loggedIn) return res.redirect("/admin");
  const { hwid } = req.body;
  const data = JSON.parse(fs.readFileSync(DATA_FILE));
  if (data.find(k => k.hwid === hwid)) return res.send("Já existe.");
  data.push({ hwid, key: gerarKey(), timestamp: Date.now() });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  res.redirect("/admin/dashboard");
});

app.post("/admin/create-perm", (req, res) => {
  if (!req.session.loggedIn) return res.redirect("/admin");
  const { hwid } = req.body;
  const data = JSON.parse(fs.readFileSync(DATA_FILE));
  if (data.find(k => k.hwid === hwid)) return res.send("Já existe.");
  data.push({ hwid, key: gerarKey(), permanente: true, timestamp: Date.now() });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  res.redirect("/admin/dashboard");
});

app.post("/admin/delete", (req, res) => {
  if (!req.session.loggedIn) return res.redirect("/admin");
  const { hwid } = req.body;
  let data = JSON.parse(fs.readFileSync(DATA_FILE));
  data = data.filter(k => k.hwid !== hwid);
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  res.redirect("/admin/dashboard");
});

// ROTA PARA O EXECUTOR VERIFICAR
app.get("/admin/check/:key", (req, res) => {
  if (!req.session.loggedIn) return res.status(403).send("FORBIDDEN");
  const { key } = req.params;
  const { hwid } = req.query;
  if (!key || !hwid) return res.send("MISSING");

  const data = JSON.parse(fs.readFileSync(DATA_FILE));
  const entry = data.find(k => k.key === key);
  if (!entry) return res.send("INVALID");
  if (entry.hwid && entry.hwid !== hwid) return res.send("USED_BY_OTHER");
  if (!entry.permanente && (Date.now() - entry.timestamp > VALIDITY_DURATION)) return res.send("EXPIRED");

  entry.hwid = hwid;
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  res.send("VALID");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));
