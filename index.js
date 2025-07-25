const express = require("express");
const fs = require("fs");
const crypto = require("crypto");
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const DATA_FILE = "keys.json";
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");

const tokenMap = {}; // { token: { hwid, timestamp } }

function gerarKey() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 40 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join("");
}

// 🔁 Limpa tokens com mais de 10 minutos
function limparTokensExpirados() {
  const agora = Date.now();
  for (const token in tokenMap) {
    if (agora - tokenMap[token].timestamp > 10 * 60 * 1000) {
      delete tokenMap[token];
    }
  }
}

// 🔁 ROTA /go → gera token e mostra botão para encurtador + gerar key
app.get("/go", (req, res) => {
  limparTokensExpirados();

  const hwid = req.query.hwid;
  const src = req.query.src || "linkvertise";
  if (!hwid) return res.status(400).send("HWID ausente.");

  const token = crypto.randomUUID();
  tokenMap[token] = { hwid, timestamp: Date.now() };

  const encurtador = src === "workink"
    ? "https://workink.net/221q/r3wvdu1w"
    : "https://link-hub.net/1374242/xChXAM3IRghL";

  res.send(`
    <html>
      <head><title>Validação</title></head>
      <body style="font-family:sans-serif;text-align:center;padding-top:60px;">
        <h2>Passo 1</h2>
        <p>Conclua o encurtador abaixo:</p>
        <a href="${encurtador}" target="_blank">
          <button style="font-size:18px;padding:10px 30px;margin:10px;">Abrir Link (${src})</button>
        </a>
        <hr style="margin: 40px 0;" />
        <h2>Passo 2</h2>
        <p>Depois de concluir, clique abaixo:</p>
        <form method="GET" action="/">
          <input type="hidden" name="token" value="${token}" />
          <button style="font-size:18px;padding:10px 30px;">Gerar Key</button>
        </form>
      </body>
    </html>
  `);
});

// ✅ ROTA / → só permite gerar key com token válido
app.get("/", (req, res) => {
  try {
    limparTokensExpirados();

    const incomingToken = req.query.token;
    if (!incomingToken || !tokenMap[incomingToken]) {
      return res.status(403).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding-top:100px;">
        <h1>❌ Acesso negado</h1>
        <p>Você deve passar pelo encurtador antes de gerar uma key.</p>
        </body></html>
      `);
    }

    const hwid = tokenMap[incomingToken].hwid;
    if (!hwid) return res.status(400).send("HWID ausente.");

    const now = Date.now();
    const data = JSON.parse(fs.readFileSync(DATA_FILE));
    const ultima = data.find(e => e.hwid === hwid && e.generatedAt);

    if (ultima && now - ultima.generatedAt < 24 * 60 * 60 * 1000) {
      const restante = Math.ceil((24 * 60 * 60 * 1000 - (now - ultima.generatedAt)) / (60 * 1000));
      return res.send(`
        <html>
          <body style="font-family:sans-serif;text-align:center;padding-top:100px;">
            <h1>Limite diário atingido</h1>
            <p>Você já gerou uma key hoje. Tente novamente em aproximadamente ${restante} minutos.</p>
          </body>
        </html>
      `);
    }

    const novaKey = gerarKey();
    data.push({ key: novaKey, hwid, usedAt: null, generatedAt: now });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

    res.send(`
      <html>
        <head><title>Sua Key</title></head>
        <body style="font-family:sans-serif;text-align:center;padding-top:100px;">
          <h1>Sua key exclusiva:</h1>
          <p style="font-size:22px;font-weight:bold;font-family:monospace">${novaKey}</p>
          <p>Use no seu programa. A key é válida por 24h e vinculada ao seu computador.</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("Erro na rota /:", err);
    res.status(500).send("Erro interno no servidor.");
  }
});

// ✅ ROTA /check/:key
app.get("/check/:key", (req, res) => {
  const key = req.params.key.trim().toLowerCase();
  const hwid = (req.query.hwid || "").trim();
  if (!key || !hwid) return res.send("MISSING");

  let data = JSON.parse(fs.readFileSync(DATA_FILE));
  const entry = data.find(k => k.key === key);
  if (!entry) return res.send("INVALID");

  const now = Date.now();

  if (entry.hwid === hwid) {
    if (entry.permanent === true) return res.send("VALID");

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

// ✅ Painel /admin
app.get("/admin", (req, res) => {
  const auth = req.query.auth;
  if (auth !== "SENHA123") return res.status(403).send("Acesso negado.");

  const data = JSON.parse(fs.readFileSync(DATA_FILE));
  const verificada = req.query.keyverificada;
  const resultadoVerificacao = verificada
    ? data.find(k => k.key === verificada)
      ? "✅ Key encontrada."
      : "❌ Key não encontrada."
    : "";

  const rows = data.map(k => `
    <tr>
      <td>${k.key}</td>
      <td>${k.hwid}</td>
      <td>${k.generatedAt ? new Date(k.generatedAt).toLocaleString() : "-"}</td>
      <td>${k.usedAt ? new Date(k.usedAt).toLocaleString() : "-"}</td>
    </tr>
  `).join("");

  res.send(`
    <html>
      <head>
        <title>Admin - Painel de Keys</title>
        <style>
          body { font-family:sans-serif; padding:30px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          input[type=text] { width: 400px; padding: 6px; }
        </style>
      </head>
      <body>
        <h2>Painel de Admin</h2>
        <form method="GET" action="/admin">
          <input type="hidden" name="auth" value="${auth}"/>
          <label>Verificar se a key existe:</label><br/>
          <input type="text" name="keyverificada" required />
          <button type="submit">Verificar</button>
        </form>
        <p><strong>${resultadoVerificacao}</strong></p>
        <hr/>
        <form method="POST" action="/admin/create?auth=${auth}">
          <label>Gerar key manual para HWID:</label><br/>
          <input type="text" name="hwid" required />
          <button type="submit">Criar Key</button>
        </form>
        <h3>Lista de todas as keys</h3>
        <table>
          <tr><th>Key</th><th>HWID</th><th>Gerada em</th><th>Usada em</th></tr>
          ${rows}
        </table>
      </body>
    </html>
  `);
});

// ✅ Criação manual
app.post("/admin/create", (req, res) => {
  const auth = req.query.auth;
  if (auth !== "SENHA123") return res.status(403).send("Acesso negado.");

  const hwid = (req.body.hwid || "").trim();
  if (!hwid) return res.status(400).send("HWID inválido.");

  const data = JSON.parse(fs.readFileSync(DATA_FILE));
  const newKey = gerarKey();
  const now = Date.now();

  data.push({ key: newKey, hwid, usedAt: null, generatedAt: now });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

  res.redirect(`/admin?auth=${auth}`);
});

app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});
