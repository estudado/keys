const express = require("express");
const fs = require("fs");
const crypto = require("crypto");
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const DATA_FILE = "keys.json";
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");

const tokenMap = {}; // { token: { hwid, timestamp, redirOk, ip, visitTime } }

function gerarKey() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 40 }, () =>
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

  tokenMap[token] = { hwid, timestamp: Date.now(), redirOk: false, ip: clientIp, visitTime: null };

  const encurtador = src === "workink"
    ? "https://workink.net/221q/r3wvdu1w"
    : "https://link-hub.net/1374242/xChXAM3IRghL";

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
        <p>Depois de concluir o encurtador, clique abaixo:</p>
        <a href="/getkey?token=${token}">
          <button style="font-size:18px;padding:10px 30px;">Gerar Key</button>
        </a>
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

  const encurtador = src === "workink"
    ? "https://workink.net/221q/r3wvdu1w"
    : "https://link-hub.net/1374242/xChXAM3IRghL";

  res.redirect(encurtador);
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

    // Verifica se o usuário passou pelo redirecionador
    if (!tokenData.redirOk || !tokenData.visitTime) {
      return res.status(403).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding-top:100px;">
        <h1>❌ Acesso negado</h1>
        <p>Você precisa passar pelo encurtador antes de gerar a key.</p>
        </body></html>
      `);
    }

    // Verifica o tempo mínimo necessário para conclusão
    const tempoDecorrido = Date.now() - tokenData.visitTime;
    if (tempoDecorrido < 30 * 1000) { // Exige ao menos 30 segundos
      return res.status(403).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding-top:100px;">
        <h1>❌ Acesso negado</h1>
        <p>Você deve aguardar pelo menos 30 segundos após acessar o encurtador para gerar a key.</p>
        </body></html>
      `);
    }

    // Verifica o IP do usuário
    if (tokenData.ip !== clientIp) {
      return res.status(403).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding-top:100px;">
        <h1>❌ Acesso negado</h1>
        <p>O IP atual não corresponde ao IP registrado durante o redirecionamento. Acesso negado.</p>
        </body></html>
      `);
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
