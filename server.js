const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const app = express();
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const OWNER_PASSWORD = process.env.OWNER_PASSWORD || ''; // bo'sh bo'lsa parolsiz
let insideWs = null; // live ichidagi odam
let ownerWs = null;  // ega

const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };

function broadcast() {
  const online = wss.clients.size;
  wss.clients.forEach(ws => send(ws, {
    type: 'state',
    online,
    live: insideWs ? 1 : 0,
    inside: ws === insideWs,
    owner: ws === ownerWs,
    ownerTaken: !!ownerWs,
    needPw: !!OWNER_PASSWORD
  }));
}

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  broadcast();

  ws.on('message', (data, isBinary) => {
    // Ovoz: faqat egadan, faqat ichkaridagi odamga
    if (isBinary) {
      if (ws === ownerWs && insideWs) insideWs.send(data, { binary: true });
      return;
    }
    let m; try { m = JSON.parse(data.toString()); } catch { return; }

    if (m.type === 'join') {
      if (!insideWs || insideWs === ws) { insideWs = ws; send(ws, { type: 'join_result', ok: true }); }
      else send(ws, { type: 'join_result', ok: false });
    } else if (m.type === 'leave') {
      if (insideWs === ws) insideWs = null;
    } else if (m.type === 'claim_owner') {
      if (ownerWs && ownerWs !== ws) return send(ws, { type: 'owner_result', ok: false, reason: 'Ega allaqachon bor' });
      if (OWNER_PASSWORD && m.pw !== OWNER_PASSWORD) return send(ws, { type: 'owner_result', ok: false, reason: 'Parol noto\u2018g\u2018ri' });
      ownerWs = ws; send(ws, { type: 'owner_result', ok: true });
    } else if (m.type === 'release_owner') {
      if (ownerWs === ws) ownerWs = null;
    } else if (m.type === 'kick') {
      if (ws === ownerWs && insideWs) { send(insideWs, { type: 'kicked' }); insideWs = null; }
    } else if (m.type === 'talk_start' || m.type === 'talk_stop') {
      if (ws === ownerWs && insideWs) send(insideWs, { type: m.type, rate: m.rate });
    }
    broadcast();
  });

  ws.on('close', () => {
    if (insideWs === ws) insideWs = null;
    if (ownerWs === ws) ownerWs = null;
    broadcast();
  });
});

// o'lik ulanishlarni tozalash (Render uchun ham foydali)
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false; ws.ping();
  });
}, 30000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('TUZAKI ishga tushdi: ' + PORT));
