const { app, BrowserWindow, Menu, dialog, shell, session } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

// Keep one profile name everywhere, so saved feeds live in the same place on
// every launch (and in a folder that matches the product, not the repo name).
app.setName("Marginalia");

const DEV_URL = process.env.MARGINALIA_DEV_URL;

// The window is served from a loopback origin. The port is fixed on purpose:
// localStorage is keyed by origin, so a random port would give the app a fresh
// empty profile every launch and its saved feeds would disappear.
const APP_PORT = Number(process.env.MARGINALIA_PORT ?? 43117);

// TanStack Start's SPA build emits the app shell as _shell.html; the static
// server serves it for every route.
const SHELL_FILES = ["index.html", "_shell.html"];

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

let mainWindow = null;
let appServer = null;

/**
 * Serves the built single-page app from a loopback HTTP origin.
 *
 * A real origin (instead of file://) keeps absolute asset paths, fetch of
 * /feeds.json, and the history API working exactly like the web build.
 */
function startStaticServer(rootDir, port) {
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const requestedPath = decodeURIComponent(requestUrl.pathname);
    const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
    const candidate = path.join(rootDir, relativePath);
    const insideRoot = candidate.startsWith(path.join(rootDir, path.sep));

    const sendFile = (filePath) => {
      const extension = path.extname(filePath).toLowerCase();
      response.writeHead(200, {
        "Content-Type": MIME_TYPES[extension] ?? "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      fs.createReadStream(filePath).pipe(response);
    };

    if (insideRoot && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      sendFile(candidate);
      return;
    }

    // Single-page app: unknown routes fall back to the app shell.
    for (const shellFile of SHELL_FILES) {
      const shellPath = path.join(rootDir, shellFile);
      if (fs.existsSync(shellPath)) {
        sendFile(shellPath);
        return;
      }
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

/**
 * Feed and article requests go straight out from the renderer, so the response
 * needs to look CORS-approved. Only our own bundle runs in this window, and
 * remote links open in the system browser.
 */
function allowCrossOriginResponses() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders ?? {};
    const alreadyAllowed = Object.keys(headers).some(
      (name) => name.toLowerCase() === "access-control-allow-origin",
    );
    if (alreadyAllowed) {
      callback({ responseHeaders: headers });
      return;
    }
    callback({
      responseHeaders: {
        ...headers,
        "Access-Control-Allow-Origin": ["*"],
      },
    });
  });
}

function openExternalLinks(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    const currentOrigin = new URL(window.webContents.getURL()).origin;
    if (new URL(url).origin !== currentOrigin) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    center: true,
    show: false,
    backgroundColor: "#f7f5f2",
    title: "Marginalia — Your daily reading desk",
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow = window;
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });

  openExternalLinks(window);
  window.once("ready-to-show", () => window.show());

  if (DEV_URL) {
    await window.loadURL(DEV_URL);
    window.webContents.openDevTools({ mode: "detach" });
    return window;
  }

  await window.loadURL(`http://127.0.0.1:${APP_PORT}/`);
  return window;
}

async function startApp() {
  Menu.setApplicationMenu(null);
  allowCrossOriginResponses();

  if (!DEV_URL) {
    const rootDir = path.join(app.getAppPath(), "dist", "client");
    try {
      appServer = await startStaticServer(rootDir, APP_PORT);
    } catch (error) {
      if (error && error.code === "EADDRINUSE") {
        dialog.showErrorBox(
          "Marginalia could not start",
          `Port ${APP_PORT} is already in use by another program.\n\nClose it and start Marginalia again.`,
        );
      } else {
        dialog.showErrorBox("Marginalia could not start", String(error));
      }
      app.quit();
      return;
    }
  }

  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
}

// A second launch should focus the running window instead of starting another
// copy that would fight over the fixed port and profile.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(startApp);

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    appServer?.close();
  });
}
