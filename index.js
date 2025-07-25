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
  const caracteres = "abcdefghijklmnopqrstuvwxyz0123456789";
  let key = "";
  for (let i = 0; i < 40; i++) {
    key += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
  }
  return key;
}

// ROTA /go → recebe hwid, gera token e redireciona para link encurtado com token
app.get("/go", (req, res) => {
  const hwid = req.query.hwid;
  const src = req.query.src || "linkvertise";

  if (!hwid) return res.status(400).send("HWID ausente.");

  const token = crypto.randomUUID();
  tokenMap[token] = { hwid, timestamp: Date.now() };

  let encurtador = "";
  if (src === "linkvertise") {
    encurtador = "https://link-hub.net/1374242/xChXAM3IRghL";
  } else if (src === "workink") {
    encurtador = "https://workink.net/221q/r3wvdu1w";
  } else {
    return res.status(400).send("Fonte inválida.");
  }

  // Redireciona com instrução + token visível
  res.send(`
    <html>
      <head><title>Geração de Key</title></head>
      <body style="font-family:sans-serif;text-align:center;padding-top:80px;">
        <h2>1º Passo:</h2>
        <p>Conclua o encurtador abaixo para gerar sua key:</p>
        <a href="${encurtador}" target="_blank">
          <button style="font-size:18px;padding:10px 30px;">Abrir Link (${src})</button>
        </a>
        <h2>2º Passo:</h2>
        <p>Depois de terminar o encurtador, clique abaixo:</p>
        <a href="/?token=${token}">
          <button style="font-size:18px;padding:10px 30px;">Gerar Key</button>
        </a>
      </body>
    </html>
  `);
});

app.get("/admin/permakey", (req, res) => {
  const auth = req.query.auth;
  const hwid = req.query.hwid;
  const key = req.query.key;

  if (auth !== "SENHA123") return res.status(403).send("Acesso negado.");
  if (!hwid || !key) return res.status(400).send("Faltando hwid ou key.");

  const data = JSON.parse(fs.readFileSync(DATA_FILE));
  data.push({
    key: key,
    hwid: hwid,
    usedAt: null,
    generatedAt: Date.now(),
    permanent: true
  });

  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  res.send("✅ Key permanente adicionada com sucesso.");
});


// ROTA PRINCIPAL /
app.get("/", (req, res) => {
  try {
    const incomingToken = req.query.token;

    // 🔒 1. Token obrigatório
    if (!incomingToken || !tokenMap[incomingToken]) {
      return res.status(403).send(`
        <html>
          <body style="font-family:sans-serif;text-align:center;padding-top:100px;">
            <h1>❌ Acesso negado</h1>
            <p>Você deve passar pelo encurtador antes de gerar uma key.</p>
          </body>
        </html>
      `);
    }

    const hwid = tokenMap[incomingToken].hwid;

    if (!hwid) {
      return res.status(400).send("HWID ausente no token.");
    }

    const now = Date.now();
    const data = JSON.parse(fs.readFileSync(DATA_FILE));
    const ultima = data.find(e => e.hwid === hwid && e.generatedAt);

    // 🔒 2. Impedir geração múltipla por dia
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

    // 🔐 Gera e salva nova key
    const novaKey = gerarKey();
    data.push({ key: novaKey, hwid: hwid, usedAt: null, generatedAt: now });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

    // ✅ Mostra key ao usuário
    res.send(`
      <html>
        <head><title>Sua Key</title></head>
        <body style="font-family:sans-serif;text-align:center;padding-top:100px;">
          <h1>Sua key exclusiva:</h1>
          <p style="font-size:22px;font-weight:bold;font-family:monospace">${novaKey}</p>
          <p>Use no seu programa. A key é válida por 24h após o primeiro uso e vinculada ao seu computador.</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("Erro na rota /:", err);
    res.status(500).send("Erro interno no servidor.");
  }
});

// ROTA /check/:key
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

// ROTA /admin
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

  const rows = data
    .map(k => `
      <tr>
        <td>${k.key}</td>
        <td>${k.hwid}</td>
        <td>${k.generatedAt ? new Date(k.generatedAt).toLocaleString() : "-"}</td>
        <td>${k.usedAt ? new Date(k.usedAt).toLocaleString() : "-"}</td>
      </tr>
    `)
    .join("");

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
          <tr>
            <th>Key</th>
            <th>HWID</th>
            <th>Gerada em</th>
            <th>Usada em</th>
          </tr>
          ${rows}
        </table>
      </body>
    </html>
  `);
});

// /admin/create
app.post("/admin/create", (req, res) => {
  const auth = req.query.auth;
  if (auth !== "SENHA123") return res.status(403).send("Acesso negado.");

  const hwid = (req.body.hwid || "").trim();
  if (!hwid) return res.status(400).send("HWID inválido.");

  const data = JSON.parse(fs.readFileSync(DATA_FILE));
  const newKey = gerarKey();
  const now = Date.now();

  data.push({ key: newKey, hwid: hwid, usedAt: null, generatedAt: now });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

  res.redirect(`/admin?auth=${auth}`);
});

app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});
