const express = require("express");
const fs = require("fs");
const crypto = require("crypto");
const axios = require("axios");
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const DATA_FILE = "keys.json";
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");

const tokenMap = {}; // { token: { hwid, timestamp, redirOk, ip, visitTime, code } }

function gerarKey() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 40 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join("");
}

function gerarCodigo() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 8 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join("");
}

function limparTokensExpirados() {
  const agora = Date.now();
  for (const token in tokenMap) {
    if (agora - tokenMap[token].timestamp > 10 * 60 * 1000) {
      delete tokenMap[token];
    }
  }
}

// GitHub config
const GITHUB_USER = "estudado";
const GITHUB_REPO = "keys";
const GITHUB_FILE_PATH = "public/code.txt";
const GITHUB_TOKEN = "ghp_SEU_TOKEN_AQUI";

app.get("/", (req, res) => {
  res.send(`<html><body style="text-align:center;padding-top:100px;font-family:sans-serif">
    <h1>Sistema de Keys</h1>
    <p>Acesse /go?hwid=SEU_HWID</p>
  </body></html>`);
});

app.get("/go", async (req, res) => {
  limparTokensExpirados();

  const hwid = req.query.hwid;
  const src = req.query.src || "linkvertise";
  if (!hwid) return res.status(400).send("HWID ausente.");

  const token = crypto.randomUUID();
  const clientIp = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
  const code = gerarCodigo();

  tokenMap[token] = { hwid, timestamp: Date.now(), redirOk: false, ip: clientIp, visitTime: null, code };

  let sha;
  try {
    const getRes = await axios.get(`https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    sha = getRes.data.sha;
  } catch (err) {
    return res.status(500).send("Erro ao buscar SHA do arquivo no GitHub.");
  }

  try {
    await axios.put(`https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`, {
      message: "Atualizar código",
      content: Buffer.from(code).toString("base64"),
      sha,
    }, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
  } catch (err) {
    return res.status(500).send("Erro ao atualizar o code.txt no GitHub.");
  }

  const encurtador = src === "workink"
    ? `https://workink.net/221q/r3wvdu1w?code=${code}`
    : `https://link-hub.net/1374242/xChXAM3IRghL?code=${code}`;

  res.send(`
    <html><body style="text-align:center;font-family:sans-serif;padding-top:60px">
      <h2>Passo 1</h2>
      <p>Conclua o encurtador:</p>
      <a href="/redir?token=${token}&src=${src}" target="_blank">
        <button style="font-size:18px;padding:10px 30px;">Abrir Encurtador</button>
      </a>
      <hr style="margin:40px 0;"/>
      <h2>Passo 2</h2>
      <p>Abra este link e copie o código:</p>
      <code>https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/main/${GITHUB_FILE_PATH}</code>
      <form method="POST" action="/submit-code" style="margin-top:30px">
        <input type="hidden" name="token" value="${token}" />
        <input type="text" name="code" placeholder="Código" required />
        <button style="font-size:18px;padding:10px 30px;">Enviar Código</button>
      </form>
    </body></html>
  `);
});

app.get("/redir", (req, res) => {
  const token = req.query.token;
  const src = req.query.src || "linkvertise";
  const clientIp = req.headers["x-forwarded-for"] || req.connection.remoteAddress;

  if (!tokenMap[token]) return res.status(400).send("Token inválido.");

  tokenMap[token].redirOk = true;
  tokenMap[token].visitTime = Date.now();
  tokenMap[token].ip = clientIp;

  const code = tokenMap[token].code;
  const encurtador = src === "workink"
    ? `https://workink.net/221q/r3wvdu1w?code=${code}`
    : `https://link-hub.net/1374242/xChXAM3IRghL?code=${code}`;

  res.redirect(encurtador);
});

app.get("/submit-code", (req, res) => {
  res.send(`<html><body style="text-align:center;font-family:sans-serif;padding-top:100px">
    <h1>⚠️ Acesso inválido</h1>
    <p>Você foi redirecionado incorretamente.</p>
    <p>Acesse <code>/go?hwid=SEU_HWID</code></p>
  </body></html>`);
});

app.post("/submit-code", (req, res) => {
  const incomingToken = req.body.token;
  const submittedCode = req.body.code;
  const clientIp = req.headers["x-forwarded-for"] || req.connection.remoteAddress;

  if (!incomingToken || !tokenMap[incomingToken]) {
    return res.status(403).send("Token inválido ou expirado.");
  }

  const tokenData = tokenMap[incomingToken];
  if (!tokenData.redirOk) return res.status(403).send("Você precisa passar pelo encurtador antes.");
  if (tokenData.ip !== clientIp) return res.status(403).send("IP não corresponde.");
  if (tokenData.code !== submittedCode) return res.status(403).send("Código incorreto.");

  res.send(`<html><body style="text-align:center;font-family:sans-serif;padding-top:100px">
    <h1>✅ Código validado!</h1>
    <a href="/getkey?token=${incomingToken}"><button style="font-size:18px;padding:10px 30px">Gerar Key</button></a>
  </body></html>`);
});

app.get("/getkey", (req, res) => {
  try {
    limparTokensExpirados();
    const incomingToken = req.query.token;
    const clientIp = req.headers["x-forwarded-for"] || req.connection.remoteAddress;

    if (!incomingToken || !tokenMap[incomingToken]) {
      return res.status(403).send("Token inválido ou expirado.");
    }

    const tokenData = tokenMap[incomingToken];
    if (!tokenData.redirOk || !tokenData.code) {
      return res.status(403).send("Código não validado.");
    }

    const hwid = tokenData.hwid;
    if (!hwid) return res.status(400).send("HWID ausente.");

    const now = Date.now();
    const data = JSON.parse(fs.readFileSync(DATA_FILE));
    const ultima = data.find(e => e.hwid === hwid && e.generatedAt);

    if (ultima && now - ultima.generatedAt < 24 * 60 * 60 * 1000) {
      const restante = Math.ceil((24 * 60 * 60 * 1000 - (now - ultima.generatedAt)) / (60 * 1000));
      return res.send(`<html><body style="text-align:center;font-family:sans-serif;padding-top:100px">
        <h1>⏳ Limite diário atingido</h1>
        <p>Tente novamente em ${restante} minutos.</p>
      </body></html>`);
    }

    const novaKey = gerarKey();
    data.push({ key: novaKey, hwid, usedAt: null, generatedAt: now });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    delete tokenMap[incomingToken];

    res.send(`<html><body style="text-align:center;font-family:sans-serif;padding-top:100px">
      <h1>Sua key:</h1>
      <p style="font-size:22px;font-weight:bold;font-family:monospace">${novaKey}</p>
      <p>Válida por 24h</p>
    </body></html>`);
  } catch (err) {
    console.error("Erro /getkey:", err);
    res.status(500).send("Erro interno");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
