const { app, BrowserWindow } = require("electron");
const path = require("path");

const signalHost = process.argv[process.argv.length - 2];
const id = process.argv[process.argv.length - 1];

function createWindow() {
  const win = new BrowserWindow({
    width: 400,
    height: 300,
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  win.loadFile("index.html");

  win.webContents.once("did-finish-load", () => {
    win.webContents.send("config", {
      signalHost,
      id
    });
  });
}

app.whenReady().then(createWindow);
