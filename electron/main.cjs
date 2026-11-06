const { app, BrowserWindow, Menu, shell, session } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const DEV_URL = process.env.MARGINALIA_DEV_URL;

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

/**
 * Serves the built single-page app from a loopback HTTP origin.
 *
 * A real origin (instead of file://) keeps absolute asset paths, fetch of
 * /feeds.json, and the history API working exactly like the web build.
 */
function startStaticServer(rootDir) {
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
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
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

  openExternalLinks(window);
  window.once("ready-to-show", () => window.show());

  if (DEV_URL) {
    await window.loadURL(DEV_URL);
    window.webContents.openDevTools({ mode: "detach" });
    return;
  }

  const rootDir = path.join(app.getAppPath(), "dist", "client");
  const { server, port } = await startStaticServer(rootDir);
  app.once("before-quit", () => server.close());
  await window.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  allowCrossOriginResponses();
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
