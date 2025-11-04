// Practicon Live Chat Server
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let clients = new Map(); // sessionId -> ws

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin.html'));
});

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const sid = url.searchParams.get('sid') || Math.random().toString(36).slice(2);
  clients.set(sid, ws);

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'user-message') {
        broadcastToAdmin({ type: 'user-message', ...data });
      }
      if (data.type === 'agent-message' && data.sessionId) {
        const userWs = clients.get(data.sessionId);
        if (userWs && userWs.readyState === 1) userWs.send(JSON.stringify(data));
      }
    } catch (e) {
      console.error('Invalid message', e);
    }
  });

  ws.on('close', () => clients.delete(sid));
});

function broadcastToAdmin(data) {
  for (const [sid, ws] of clients.entries()) {
    if (sid === 'admin' && ws.readyState === 1) ws.send(JSON.stringify(data));
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Practicon Chat Server running on port ${PORT}`));