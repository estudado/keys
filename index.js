const express = require("express");
const fs = require("fs");
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const DATA_FILE = "keys.json";
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");

function gerarKey() {
  const caracteres = "abcdefghijklmnopqrstuvwxyz0123456789";
  let key = "";
  for (let i = 0; i < 40; i++) {
    key += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
  }
  return key;
}

app.get("/admin", (req, res) => {
  const auth = req.query.auth;
  if (auth !== "SENHA123") return res.status(403).send("Acesso negado.");

  res.send(`
    <html>
      <head><title>Painel de Admin</title></head>
      <body style="font-family:sans-serif; padding:40px;">
        <h2>Gerar Key Manualmente</h2>
        <form method="POST" action="/admin/create?auth=${auth}">
          <label>HWID:</label><br/>
          <input type="text" name="hwid" required style="width:300px"/><br/><br/>
          <button type="submit">Criar Key</button>
        </form>
      </body>
    </html>
  `);
});

app.post("/admin/create", (req, res) => {
  const auth = req.query.auth;
  if (auth !== "Spark") return res.status(403).send("Acesso negado.");

  const hwid = (req.body.hwid || "").trim();
  if (!hwid) return res.status(400).send("HWID inválido.");

  const data = JSON.parse(fs.readFileSync(DATA_FILE));
  const newKey = gerarKey();
  const now = Date.now();

  data.push({ key: newKey, hwid: hwid, usedAt: null, generatedAt: now });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

  res.send(`
    <html>
      <body style="font-family:sans-serif; padding:40px;">
        <h2>Key criada com sucesso:</h2>
        <p><strong>${newKey}</strong></p>
        <p>Associada ao HWID: ${hwid}</p>
        <a href="/admin?auth=${auth}">Voltar</a>
      </body>
    </html>
  `);
});

app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});
