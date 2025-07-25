const express = require("express");
const fs = require("fs");
const crypto = require("crypto");
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

app.get("/go", (req, res) => {
  limparTokensExpirados();

  const hwid = req.query.hwid;
  const src = req.query.src || "linkvertise";
  if (!hwid) return res.status(400).send("HWID ausente.");

  const token = crypto.randomUUID();
  const clientIp = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
  const code = gerarCodigo();

  tokenMap[token] = { hwid, timestamp: Date.now(), redirOk: false, ip: clientIp, visitTime: null, code };

  const encurtador = src === "workink"
    ? `https://workink.net/221q/r3wvdu1w?code=${code}` // Adiciona o código ao encurtador
    : `https://link-hub.net/1374242/xChXAM3IRghL?code=${code}`; // Adiciona o código ao encurtador

  res.send(`
    <html>
      <head><title>Validação</title></head>
      <body style="font-family:sans-serif;text-align:center;padding-top:60px;">
        <h2>Passo 1</h2>
        <p>Conclua o encurtador abaixo para gerar sua key:</p>
        <a href="/redir?token=${token}&src=${src}" target="_blank">
          <button style="font-size:18px;padding:10px 30px;margin:10px;">Abrir Link (${src})</button>
        </a>
        <hr style="margin: 40px 0;" />
        <h2>Passo 2</h2>
        <p>Depois de concluir o encurtador, insira o código obtido:</p>
        <form method="POST" action="/submit-code">
          <input type="hidden" name="token" value="${token}" />
          <input type="text" name="code" placeholder="Insira o código aqui" required />
          <button style="font-size:18px;padding:10px 30px;">Enviar Código</button>
        </form>
      </body>
    </html>
  `);
});

// Rota intermediária para redirecionar ao encurtador
app.get("/redir", (req, res) => {
  const token = req.query.token;
  const src = req.query.src || "linkvertise";
  const clientIp = req.headers["x-forwarded-for"] || req.connection.remoteAddress;

  if (!tokenMap[token]) return res.status(400).send("Token inválido.");

  // Marca que o usuário passou pela rota de redirecionamento
  tokenMap[token].redirOk = true;
  tokenMap[token].visitTime = Date.now(); // Registra o momento de visita
  tokenMap[token].ip = clientIp; // Atualiza o IP

  const code = tokenMap[token].code; // Recupera o código associado ao token
  const encurtador = src === "workink"
    ? `https://workink.net/221q/r3wvdu1w?code=${code}`
    : `https://link-hub.net/1374242/xChXAM3IRghL?code=${code}`;

  res.redirect(encurtador);
});

// Rota para validar o código do encurtador
app.post("/submit-code", (req, res) => {
  const incomingToken = req.body.token;
  const submittedCode = req.body.code;
  const clientIp = req.headers["x-forwarded-for"] || req.connection.remoteAddress;

  if (!incomingToken || !tokenMap[incomingToken]) {
    return res.status(403).send("Token inválido ou expirado.");
  }

  const tokenData = tokenMap[incomingToken];

  // Verifica se o token já foi validado
  if (!tokenData.redirOk) {
    return res.status(403).send("Você precisa passar pelo encurtador antes de enviar o código.");
  }

  // Verifica o IP do usuário
  if (tokenData.ip !== clientIp) {
    return res.status(403).send("O IP atual não corresponde ao IP registrado durante o redirecionamento.");
  }

  // Verifica se o código enviado corresponde ao código gerado
  if (tokenData.code !== submittedCode) {
    return res.status(403).send("Código incorreto. Certifique-se de concluir o encurtador e copiar o código correto.");
  }

  res.send(`
    <html>
      <body style="font-family:sans-serif;text-align:center;padding-top:100px;">
        <h1>Código validado!</h1>
        <p>Agora você pode gerar sua key.</p>
        <a href="/getkey?token=${incomingToken}">
          <button style="font-size:18px;padding:10px 30px;">Gerar Key</button>
        </a>
      </body>
    </html>
  `);
});

// Rota para gerar a key
app.get("/getkey", (req, res) => {
  try {
    limparTokensExpirados();

    const incomingToken = req.query.token;
    const clientIp = req.headers["x-forwarded-for"] || req.connection.remoteAddress;

    if (!incomingToken || !tokenMap[incomingToken]) {
      return res.status(403).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding-top:100px;">
        <h1>❌ Acesso negado</h1>
        <p>Token inválido ou expirado. Você deve passar pelo encurtador antes de gerar a key.</p>
        </body></html>
      `);
    }

    const tokenData = tokenMap[incomingToken];

    // Verifica se o código foi validado
    if (!tokenData.redirOk || !tokenData.code) {
      return res.status(403).send("Código não validado. Você precisa concluir o encurtador e validar o código.");
    }

    const hwid = tokenData.hwid;
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

    // Remove o token após gerar
    delete tokenMap[incomingToken];

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
    console.error("Erro na rota /getkey:", err);
    res.status(500).send("Erro interno no servidor.");
  }
});

app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});
