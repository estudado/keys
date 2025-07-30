const express = require("express");
const fs = require("fs");
const session = require("express-session");
const axios = require("axios");
const { v4: uuidv4 } = require('uuid');

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
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 1000,
    sameSite: "lax",
  }
}));

// --- CONSTANTES E INICIALIZAÇÃO ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const DATA_FILE = "/var/data/keys.json";

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}

// --- FUNÇÕES AUXILIARES ---
function getKeys() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE));
  } catch (error) {
    console.error("Erro ao ler o arquivo de chaves:", error);
    return [];
  }
}

function saveKeys(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// --- ROTAS DA API ---
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
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
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

app.get("/admin/check/:key", (req, res) => {
  const { key } = req.params;
  const { hwid } = req.query;

  if (!key || !hwid) return res.status(400).send("MISSING_PARAMS");

  const keys = getKeys();
  const keyEntry = keys.find(k => k.key === key);

  if (!keyEntry) return res.status(200).send("INVALID_KEY");

  if (!keyEntry.hwid) {
    keyEntry.hwid = hwid;
    keyEntry.activatedAt = Date.now();
    saveKeys(keys);
    console.log(`Chave ${key} vinculada ao HWID ${hwid}`);
  }

  if (keyEntry.hwid !== hwid) return res.status(403).send("HWID_MISMATCH");

  if (!keyEntry.permanente && keyEntry.expiresAt && Date.now() > keyEntry.expiresAt) {
    console.log(`Tentativa de uso da chave expirada: ${key}`);
    return res.status(403).send("EXPIRED_KEY");
  }

  return res.send("VALID");
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
  const keyListHtml = keys.map(k => {
    const dateTimeOptions = { timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' };
    let expiresText = k.permanente ? "Permanente" : (k.expiresAt ? new Date(k.expiresAt).toLocaleString('pt-BR', dateTimeOptions) : "N/A");
    const activatedAtText = k.activatedAt ? new Date(k.activatedAt).toLocaleString('pt-BR', dateTimeOptions) : "N/A";

    return `<tr>
      <td>${k.key}</td>
      <td>${k.hwid || "Não vinculado"}</td>
      <td>${activatedAtText}</td>
      <td>${expiresText}</td>
    </tr>`
  }).join("");

  res.send(`
    <style>body{font-family:sans-serif;margin:2rem} table{width:100%;border-collapse:collapse; margin-bottom: 2rem;} th,td{border:1px solid #ddd;padding:8px;text-align:left} th{background-color:#f2f2f2} form{margin-top:1rem; padding: 1rem; border: 1px solid #ccc; border-radius: 5px;} .form-container { display: flex; gap: 2rem; } input { padding: 0.5rem; width: 300px; margin-right: 1rem; } button { padding: 0.5rem 1rem; cursor: pointer; }</style>
    <h1>Painel de Chaves</h1>
    <a href="/admin/logout">Sair</a>
    <table>
      <thead><tr><th>Chave</th><th>HWID Vinculado</th><th>Ativada em</th><th>Expira em</th></tr></thead>
      <tbody>${keyListHtml}</tbody>
    </table>

    <div class="form-container">
        <div>
            <h2>Criar/Adicionar Chave</h2>
            <form method="POST" action="/admin/create">
              <input name="key" type="text" placeholder="Insira a chave desejada (ex: chave da Quorum)" required />
              <input name="dias" type="number" placeholder="Dias de validade (0 para permanente)" required />
              <button type="submit">Adicionar Chave</button>
            </form>
        </div>
        <div>
            <h2>Deletar Chave</h2>
            <form method="POST" action="/admin/delete">
              <input name="key" placeholder="Key para deletar" required />
              <button type="submit">Deletar</button>
            </form>
        </div>
    </div>
  `);
});

app.post("/admin/create", (req, res) => {
    if (!req.session.loggedIn) return res.status(403).redirect("/admin");
    
    const { key, dias } = req.body;
    const diasValidade = parseInt(dias, 10);

    if (!key || isNaN(diasValidade)) {
        return res.status(400).send("Chave ou número de dias inválido.");
    }

    const keys = getKeys();
    
    if (keys.some(k => k.key === key)) {
        return res.status(409).send("ERRO: Esta chave já existe no sistema.");
    }

    const newKeyEntry = {
        key: key,
        hwid: null,
        activatedAt: null,
        createdAt: Date.now(),
        permanente: diasValidade === 0,
        expiresAt: diasValidade > 0 ? Date.now() + diasValidade * 24 * 60 * 60 * 1000 : null,
    };

    keys.push(newKeyEntry);
    saveKeys(keys);

    console.log(`Chave "${key}" adicionada pelo admin com ${diasValidade > 0 ? `${diasValidade} dias` : 'validade permanente'}.`);
    return res.redirect("/admin/dashboard");
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
      console.error("Erro ao destruir sessão:", err);
      return res.redirect("/admin/dashboard");
    }
    res.clearCookie("sessionId");
    res.redirect("/admin");
  });
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});
