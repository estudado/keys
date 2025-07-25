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
    secure: false, // Mude para true se usar HTTPS (recomendado)
    maxAge: 60 * 60 * 1000, // 1 hora de sessão admin
    sameSite: "lax",
  }
}));

// --- CONSTANTES E INICIALIZAÇÃO ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const DATA_FILE = "keys.json";
const VALIDITY_DURATION = 24 * 60 * 60 * 1000; // 24 horas de validade da chave

// Garante que o arquivo de chaves exista
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}

// --- FUNÇÕES AUXILIARES ---
function getKeys() {
  return JSON.parse(fs.readFileSync(DATA_FILE));
}

function saveKeys(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// --- ROTAS DA API DE CHAVES ---

/**
 * ROTA: Transforma o token do Work.ink em uma chave final para o usuário.
 * A chave é criada sem HWID neste momento.
 */
app.get("/validate", async (req, res) => {
  const { hash } = req.query;
  if (!hash) {
    return res.status(400).send("MISSING_HASH");
  }

  try {
    // Valida o token no Work.ink e solicita que ele seja deletado após o uso
    const response = await axios.get(`https://work.ink/_api/v2/token/isValid/${hash}?deleteToken=1`);
    if (!response.data.valid) {
      return res.status(401).send("INVALID_TOKEN");
    }

    const keys = getKeys();
    const keyExists = keys.find(k => k.key === hash);

    // Se a chave já foi gerada, apenas a retorna para o usuário
    if (keyExists) {
      return res.send(keyExists.key);
    }

    // Cria a nova entrada de chave, ainda sem HWID
    const newKeyEntry = {
      key: hash, // O token do Work.ink se torna a chave final
      hwid: null, // O HWID será vinculado no primeiro uso
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

/**
 * ROTA: Valida a chave no executor e vincula o HWID no primeiro uso.
 * Esta é a principal rota de verificação.
 */
app.get("/check", (req, res) => {
  const { key, hwid } = req.query;
  if (!key || !hwid) {
    return res.status(400).send("MISSING_PARAMS");
  }

  const keys = getKeys();
  const keyEntry = keys.find(k => k.key === key);

  if (!keyEntry) {
    return res.status(404).send("INVALID_KEY");
  }

  // Lógica de vinculação: Se a chave ainda não tem HWID, vincula agora.
  if (!keyEntry.hwid) {
    keyEntry.hwid = hwid;
    keyEntry.activatedAt = Date.now(); // O tempo de validade começa a contar agora
    saveKeys(keys);
    console.log(`Chave ${key} vinculada ao HWID ${hwid}`);
    return res.send("VALID"); // Retorna válido no primeiro uso
  }

  // Verificação de segurança: A chave já está vinculada a um HWID diferente?
  if (keyEntry.hwid !== hwid) {
    return res.status(403).send("HWID_MISMATCH");
  }

  // Verificação de expiração (ignora se for uma chave permanente)
  if (!keyEntry.permanente && Date.now() - keyEntry.activatedAt > VALIDITY_DURATION) {
    return res.status(403).send("EXPIRED_KEY");
  }

  // Se todas as verificações passaram, a chave é válida
  return res.send("VALID");
});


// --- ROTAS DO PAINEL DE ADMINISTRAÇÃO ---

app.get("/admin", (req, res) => {
  if (req.session.loggedIn) {
    return res.redirect("/admin/dashboard");
  }
  // Página de login simples
  res.send(`
    <style>body { font-family: sans-serif; background-color: #f4f4f4; display: flex; justify-content: center; align-items: center; height: 100vh; } form { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); } input { display: block; margin-bottom: 1rem; padding: 0.5rem; width: 200px; } button { padding: 0.5rem 1rem; cursor: pointer; }</style>
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
  if (!req.session.loggedIn) {
    return res.redirect("/admin");
  }
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
    <style>body{font-family:sans-serif;margin:2rem} table{width:100%;border-collapse:collapse} th,td{border:1px solid #ddd;padding:8px;text-align:left} th{background-color:#f2f2f2}</style>
    <h1>Painel de Chaves</h1>
    <table>
      <thead><tr><th>Chave</th><th>HWID Vinculado</th><th>Ativada em</th><th>Permanente</th></tr></thead>
      <tbody>${keyListHtml}</tbody>
    </table>
    <hr>
    <h2>Deletar Chave</h2>
    <form method="POST" action="/admin/delete">
      <input name="key" placeholder="Key para deletar" required style="padding: 0.5rem; width: 300px;"/>
      <button type="submit">Deletar</button>
    </form>
  `);
});

app.post("/admin/delete", (req, res) => {
  if (!req.session.loggedIn) {
    return res.status(403).redirect("/admin");
  }
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

// --- INICIALIZAÇÃO DO SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});```
