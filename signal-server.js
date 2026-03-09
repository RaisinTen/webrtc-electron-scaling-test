const WebSocket = require("ws");

const host = process.argv[2] || "0.0.0.0";

const wss = new WebSocket.Server({ port: 8080, host });

const clients = new Map();

function broadcast(msg, except) {
  for (const [id, ws] of clients) {
    if (id !== except && ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
  }
}

wss.on("connection", (ws) => {
  let id;

  ws.on("message", (data) => {
    const msg = JSON.parse(data);

    if (msg.type === "join") {
      id = msg.id;
      clients.set(id, ws);

      ws.send(JSON.stringify({
        type: "peers",
        peers: [...clients.keys()].filter(p => p !== id)
      }));

      broadcast({ type: "peer-joined", id }, id);
    }

    if (msg.type === "signal") {
      const target = clients.get(msg.to);
      if (target) target.send(JSON.stringify(msg));
    }
  });

  ws.on("close", () => {
    if (!id) return;
    clients.delete(id);
    broadcast({ type: "peer-left", id });
  });
});

console.log("Signal server running", host, 8080);
