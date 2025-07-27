const express = require("express");
const fs = require("fs");
const session = require("express-session");
const axios = require("axios");

const app = express();

// --- CONFIGURAÇÕES ---
app.set("trust proxy", 1);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || "segredo_admin_superforte_321",
  name: "sessionId",
  resave: false,
  saveUninitialized: false,
  cookie: {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // Use cookies seguros em produção (HTTPS)
    maxAge: 60 * 60 * 1000, // 1 hora de sessão admin
    sameSite: "lax",
  }
}));

// --- CONSTANTES E INICIALIZAÇÃO ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const DATA_FILE = "/var/data/keys.json";
const VALIDITY_DURATION = 24 * 60 * 60 * 1000; // 24 horas

// Garante que o arquivo de chaves exista na inicialização
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}

// --- FUNÇÕES AUXILIARES ---
function getKeys() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE));
  } catch (error) {
    console.error("Erro ao ler o arquivo de chaves:", error);
    return []; // Retorna um array vazio em caso de erro
  }
}

function saveKeys(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// --- ROTAS DA API ---

// Valida token do Work.ink e cria a chave
app.get("/validate", async (req, res) => {
  const { hash } = req.query;
  if (!hash) return res.status(400).send("MISSING_HASH");

  try {
    const response = await axios.get(`https://work.ink/_api/v2/token/isValid/${hash}?deleteToken=1`);
    if (!response.data || !response.data.valid) {
      return res.status(401).send("INVALID_TOKEN");
    }

    const keys = getKeys();
    if (keys.find(k => k.key === hash)) {
      return res.send(hash);
    }

    const newKeyEntry = {
      key: hash,
      hwid: null,
      activatedAt: null,
      createdAt: Date.now(),
      permanente: false,
    };

    keys.push(newKeyEntry);
    saveKeys(keys);
    return res.send(newKeyEntry.key);

  } catch (error) {
    console.error("Erro na rota /validate:", error.message);
    return res.status(500).send("INTERNAL_ERROR");
  }
});

// --- ROTAS DO PAINEL ADMIN ---

app.get("/admin", (req, res) => {
  if (req.session.loggedIn) return res.redirect("/admin/dashboard");
  res.send(`
    <style>body { font-family: sans-serif; background-color: #f4f4f4; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; } form { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); } input { display: block; margin-bottom: 1rem; padding: 0.5rem; width: 200px; } button { padding: 0.5rem 1rem; cursor: pointer; }</style>
    <form method="POST" action="/admin/login">
      <h2>Login Admin</h2>
      <input type="password" name="senha" placeholder="Senha" required/>
      <button type="submit">Entrar</button>
    </form>
  `);
});

app.post("/admin/login", (req, res) => {
  if (req.body.senha === ADMIN_PASSWORD) {
    req.session.loggedIn = true;
    return res.redirect("/admin/dashboard");
  }
  return res.status(401).send("Senha incorreta.");
});

app.get("/admin/dashboard", (req, res) => {
  if (!req.session.loggedIn) return res.redirect("/admin");
  const keys = getKeys();
  const keyListHtml = keys.map(k =>
    `<tr>
      <td>${k.key}</td>
      <td>${k.hwid || "Não vinculado"}</td>
      <td>${k.activatedAt ? new Date(k.activatedAt).toLocaleString() : "N/A"}</td>
      <td>${k.permanente ? "Sim" : "Não"}</td>
    </tr>`
  ).join("");

  res.send(`
    <style>body{font-family:sans-serif;margin:2rem} table{width:100%;border-collapse:collapse} th,td{border:1px solid #ddd;padding:8px;text-align:left} th{background-color:#f2f2f2} form{margin-top:2rem}</style>
    <h1>Painel de Chaves</h1>
    <a href="/admin/logout">Sair</a>
    <table>
      <thead><tr><th>Chave</th><th>HWID Vinculado</th><th>Ativada em</th><th>Permanente</th></tr></thead>
      <tbody>${keyListHtml}</tbody>
    </table>
    <h2>Deletar Chave</h2>
    <form method="POST" action="/admin/delete">
      <input name="key" placeholder="Key para deletar" required style="padding: 0.5rem; width: 300px;"/>
      <button type="submit">Deletar</button>
    </form>
  `);
});

app.post("/admin/delete", (req, res) => {
  if (!req.session.loggedIn) return res.status(403).redirect("/admin");
  const { key } = req.body;
  let keys = getKeys();
  const initialLength = keys.length;
  keys = keys.filter(k => k.key !== key);

  if (keys.length < initialLength) {
    saveKeys(keys);
    console.log(`Chave ${key} deletada pelo admin.`);
  }
  return res.redirect("/admin/dashboard");
});

app.get("/admin/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.redirect("/admin/dashboard");
    }
    res.clearCookie("sessionId");
    res.redirect("/admin");
  });
});

app.get("/admin/check/:key", (req, res) => { 
  
  // Pega a chave dos parâmetros da URL
  const { key } = req.params; 
  
  // Pega o HWID da query string
  const { hwid } = req.query;

  // Resto da lógica (permanece igual)
  if (!key || !hwid) return res.status(400).send("MISSING_PARAMS");

  const keys = getKeys();
  const keyEntry = keys.find(k => k.key === key);

  if (!keyEntry) return res.status(200).send("INVALID_KEY");

  if (!keyEntry.hwid) {
    keyEntry.hwid = hwid;
    keyEntry.activatedAt = Date.now();
    saveKeys(keys);
    console.log(`Chave ${key} vinculada ao HWID ${hwid}`);
    return res.send("VALID");
  }

  if (keyEntry.hwid !== hwid) return res.status(403).send("HWID_MISMATCH");

  if (!keyEntry.permanente && (Date.now() - keyEntry.activatedAt > VALIDITY_DURATION)) {
    return res.status(403).send("EXPIRED_KEY");
  }

  return res.send("VALID");
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});
