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

app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});
