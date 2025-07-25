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

  const fileName = `public/code_${hwid}.txt`;

  // Listar e apagar arquivos antigos (mais de 15 min)
  try {
    const listRes = await axios.get(`https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/public`, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    for (const file of listRes.data) {
      if (file.name.startsWith("code_") && file.name.endsWith(".txt")) {
        const { data } = await axios.get(file.download_url);
        const timestamp = Number(data.match(/timestamp=(\d+)/)?.[1] || 0);
        if (Date.now() - timestamp > 15 * 60 * 1000) {
          await axios.delete(`https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/public/${file.name}`, {
            headers: {
              Authorization: `token ${GITHUB_TOKEN}`,
              Accept: "application/vnd.github.v3+json",
            },
            data: {
              message: `remover código expirado: ${file.name}`,
              sha: file.sha,
            },
          });
        }
      }
    }
  } catch (err) {
    console.error("Erro ao limpar códigos antigos:", err.response?.data || err.message);
  }

  // Criar novo arquivo de código
  let sha;
  try {
    const getRes = await axios.get(`https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${fileName}`, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    sha = getRes.data.sha;
  } catch (_) {
    sha = undefined;
  }

  try {
    await axios.put(`https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${fileName}`, {
      message: "Atualizar código",
      content: Buffer.from(`${code}\ntimestamp=${Date.now()}`).toString("base64"),
      ...(sha ? { sha } : {}),
    }, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
  } catch (err) {
    return res.status(500).send("Erro ao atualizar código no GitHub.");
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
      <code>https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/main/${fileName}</code>
      <form method="POST" action="/submit-code" style="margin-top:30px">
        <input type="hidden" name="token" value="${token}" />
        <input type="text" name="code" placeholder="Código" required />
        <button style="font-size:18px;padding:10px 30px;">Enviar Código</button>
      </form>
    </body></html>
  `);
});

// rota exemplo no Express
app.get('/validate', async (req, res) => {
  const hash = req.query.hash;
  const hwid = req.query.hwid; // se desejar capturar HWID também

  if (!hash) return res.status(400).send('Missing hash');

  try {
    const resp = await axios.get(`https://work.ink/_api/v2/token/isValid/${hash}?deleteToken=1`);
    const data = resp.data;

    if (data.valid) {
      // Gere ou verifique a licença com HWID (via KeyAuth Seller API)
      // Exemplo: criar key, registrar HWID, etc.
      res.send(`SUA_KEY_AQUI`);
    } else {
      res.send('INVALID');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('ERROR');
  }
});


// As demais rotas permanecem inalteradas...

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
