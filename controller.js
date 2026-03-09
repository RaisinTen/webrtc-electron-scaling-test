const { VirtualNet } = require("virtual-net");
const path = require("path");

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  const peers = parseInt(process.argv[2] || "5");

  const net = new VirtualNet({ peers });

  await net.start();

  console.log("Starting signaling server...");

  net.node(1).fork(
    path.join(__dirname, "signal-server.js"),
    [net.ip(1)],
    { stdio:'inherit' }
  );

  // Apply realistic random latency, packet loss, and bandwidth
  for (let i = 2; i <= peers; i++) {
    const delay = randomInt(20, 150);        // 20ms – 150ms typical ping
    const loss = randomInt(0, 5);            // 0% – 5% packet loss
    const rate = randomInt(500, 5000);       // 500kbit – 5mbit bandwidth

    net.latency(i, {
      delay: `${delay}ms`,
      loss: `${loss}%`,
      rate: `${rate}kbit`
    });

    console.log(`Node${i}: delay=${delay}ms, loss=${loss}%, rate=${rate}kbit`);
  }

  for (let i = 2; i <= peers; i++) {
    console.log("Launching electron client", i);

    net.node(i).spawn(
      "sudo",
      [
        "-u",
        process.env.USER,
        `WAYLAND_DISPLAY=${process.env.WAYLAND_DISPLAY}`,
        `XDG_RUNTIME_DIR=${process.env.XDG_RUNTIME_DIR}`,
        process.execPath,
        path.join(__dirname, "node_modules", ".bin", "electron"),
        "--no-sandbox",
        "--disable-gpu",
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        path.join(__dirname, "electron-client", "main.js"),
        net.ip(1),
        `node${i}`
      ],
      { stdio: "inherit" }
    );
  }

  process.on("SIGINT", () => {
    console.log("Stopping network...");
    net.stop();
    process.exit(0);
  });
}

main();
