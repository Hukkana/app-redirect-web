const http = require("http");
const fs = require("fs");
const path = require("path");
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "redirects.json");

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "{}\n", "utf8");
  }
}

function loadRedirects() {
  ensureDataFile();

  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw || "{}");
  } catch (error) {
    console.error("Failed to read redirect data:", error);
    return {};
  }
}

function saveRedirects(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(html);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
  };

  fs.readFile(filePath, (error, file) => {
    if (error) {
      sendHtml(res, 404, "<h1>404 Not Found</h1>");
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(file);
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeDomainPart(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function createIdFromUrl(targetUrl, existing) {
  const hostname = targetUrl.hostname.replace(/^www\./, "");
  const parts = hostname.split(".").filter(Boolean);
  const domainBase =
    parts.length >= 2 ? parts[parts.length - 2] : parts[0] || "link";

  const baseId = normalizeDomainPart(domainBase) || "link";
  let candidate = baseId;
  let suffix = 2;

  while (existing[candidate]) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function renderRedirectPage(id, entry) {
  const safeTitle = escapeHtml(entry.title || "Redirecting...");
  const safeUrl = JSON.stringify(entry.url);
  const safeIcon = entry.icon ? `<link rel="icon" href="${escapeHtml(entry.icon)}">` : "";

  return `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeTitle}</title>
    ${safeIcon}
    <style>
      :root {
        color-scheme: light;
        font-family: "Hiragino Sans", "Noto Sans JP", sans-serif;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top left, #d9f3ff 0%, transparent 35%),
          radial-gradient(circle at bottom right, #ffe8d1 0%, transparent 30%),
          #f6f3ee;
        color: #1e2430;
      }

      .panel {
        width: min(420px, calc(100vw - 32px));
        padding: 28px;
        border-radius: 32px;
        background: rgba(255, 255, 255, 0.86);
        backdrop-filter: blur(14px);
        box-shadow: 0 18px 44px rgba(28, 36, 48, 0.12);
        text-align: center;
      }

      h1 {
        margin: 0 0 10px;
        font-size: 1.35rem;
      }

      p {
        margin: 0;
        color: #526071;
        line-height: 1.6;
        word-break: break-all;
      }
    </style>
  </head>
  <body>
    <main class="panel">
      <h1>${safeTitle}</h1>
      <p>移動中です…</p>
      <p>${escapeHtml(entry.url)}</p>
    </main>
    <script>
      const targetUrl = ${safeUrl};
      window.location.replace(targetUrl);
    </script>
  </body>
</html>`;
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = requestUrl.pathname;

  if (req.method === "GET" && pathname === "/") {
    sendFile(res, path.join(PUBLIC_DIR, "index.html"));
    return;
  }

  if (req.method === "GET" && (pathname === "/styles.css" || pathname === "/app.js")) {
    sendFile(res, path.join(PUBLIC_DIR, pathname.slice(1)));
    return;
  }

  if (req.method === "POST" && pathname === "/api/redirects") {
    try {
      const body = await parseRequestBody(req);
      const url = typeof body.url === "string" ? body.url.trim() : "";
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const icon = typeof body.icon === "string" ? body.icon.trim() : "";

      if (!url || !title || !icon) {
        sendJson(res, 400, { error: "URL・タイトル・アイコン画像は必須です。" });
        return;
      }

      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch {
        sendJson(res, 400, { error: "有効なURLを入力してください。" });
        return;
      }

      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        sendJson(res, 400, { error: "http/https のURLのみ利用できます。" });
        return;
      }

      if (!icon.startsWith("data:image/")) {
        sendJson(res, 400, { error: "アイコン画像の形式が不正です。" });
        return;
      }

      const redirects = loadRedirects();
      const id = createIdFromUrl(parsedUrl, redirects);

      redirects[id] = {
        url: parsedUrl.toString(),
        title,
        icon
      };

      saveRedirects(redirects);

      sendJson(res, 201, {
        id,
        path: `/${id}`,
        shortUrl: `http://${req.headers.host}/${id}`
      });
    } catch (error) {
      console.error("Failed to create redirect:", error);
      sendJson(res, 500, { error: "作成に失敗しました。" });
    }
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/api/redirects/")) {
    const id = pathname.split("/").pop();
    const redirects = loadRedirects();
    const entry = redirects[id];

    if (!entry) {
      sendJson(res, 404, { error: "見つかりません。" });
      return;
    }

    sendJson(res, 200, entry);
    return;
  }

  if (req.method === "GET" && pathname !== "/favicon.ico") {
    const id = pathname.slice(1);
    const redirects = loadRedirects();
    const entry = redirects[id];

    if (!entry) {
      sendHtml(
        res,
        404,
        `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Not Found</title></head><body><h1>404</h1><p>指定されたURLは存在しません。</p></body></html>`
      );
      return;
    }

    sendHtml(res, 200, renderRedirectPage(id, entry));
    return;
  }

  sendHtml(res, 404, "<h1>404 Not Found</h1>");
});

ensureDataFile();

server.listen(PORT, HOST, () => {
  console.log(`Redirect app running at http://${HOST}:${PORT}`);
});
