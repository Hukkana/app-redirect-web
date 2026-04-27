const STORAGE_KEY = "redirect-builder:data";
const AUTO_REDIRECT_KEY = "redirect-builder:auto-redirect";

const builderView = document.getElementById("builder-view");
const redirectView = document.getElementById("redirect-view");
const form = document.getElementById("create-form");
const urlInput = document.getElementById("url");
const titleInput = document.getElementById("title");
const iconInput = document.getElementById("icon");
const submitButton = document.getElementById("submit-button");
const result = document.getElementById("result");
const resultLink = document.getElementById("result-link");
const copyButton = document.getElementById("copy-button");
const status = document.getElementById("status");
const previewWrap = document.getElementById("preview-wrap");
const previewImage = document.getElementById("preview-image");
const previewName = document.getElementById("preview-name");
const savedList = document.getElementById("saved-list");
const savedItems = document.getElementById("saved-items");
const redirectTitle = document.getElementById("redirect-title");
const redirectDescription = document.getElementById("redirect-description");
const redirectLink = document.getElementById("redirect-link");
const autoRedirectToggle = document.getElementById("auto-redirect-toggle");
const openNowButton = document.getElementById("open-now-button");

const ICON_SIZE = 180;
let iconDataUrl = "";

function loadRedirects() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function loadAutoRedirectEnabled() {
  try {
    return localStorage.getItem(AUTO_REDIRECT_KEY) !== "false";
  } catch {
    return true;
  }
}

function saveAutoRedirectEnabled(enabled) {
  try {
    localStorage.setItem(AUTO_REDIRECT_KEY, enabled ? "true" : "false");
  } catch {
    setStatus("即リダイレクト設定の保存に失敗しました。", true);
  }
}

function saveRedirects(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    if (error && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
      throw new Error("保存容量を超えました。画像を小さくして再作成してください。");
    }

    throw new Error("ブラウザへの保存に失敗しました。");
  }
}

function setStatus(message, isError = false) {
  if (!status) {
    return;
  }

  status.textContent = message;
  status.classList.toggle("error", isError);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました。"));
    reader.readAsDataURL(file);
  });
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("画像の変換に失敗しました。"));
    image.src = source;
  });
}

async function fileToIconDataUrl(file) {
  const source = await fileToDataUrl(file);
  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("画像処理の初期化に失敗しました。");
  }

  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;

  const scale = Math.max(ICON_SIZE / image.width, ICON_SIZE / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetX = (ICON_SIZE - drawWidth) / 2;
  const offsetY = (ICON_SIZE - drawHeight) / 2;

  context.clearRect(0, 0, ICON_SIZE, ICON_SIZE);
  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

  return canvas.toDataURL("image/png");
}

function normalizeDomainPart(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function createIdFromUrl(targetUrl, redirects) {
  const hostname = targetUrl.hostname.replace(/^www\./, "");
  const parts = hostname.split(".").filter(Boolean);
  const domainBase = parts.length >= 2 ? parts[parts.length - 2] : parts[0] || "link";
  const baseId = normalizeDomainPart(domainBase) || "link";
  let candidate = baseId;
  let suffix = 2;

  while (redirects[candidate]) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function getPathSegments() {
  return window.location.pathname.split("/").filter(Boolean);
}

function isGitHubPagesProjectSite() {
  return window.location.hostname.endsWith(".github.io") && getPathSegments().length >= 1;
}

function getBasePath() {
  const pathname = window.location.pathname;
  const isDirectFile = pathname.endsWith("/index.html") || pathname.endsWith("/404.html");
  const cleanPath = isDirectFile ? pathname.slice(0, pathname.lastIndexOf("/")) : pathname.replace(/\/$/, "");
  const segments = cleanPath.split("/").filter(Boolean);

  if (segments.length === 0) {
    return "";
  }

  if (isGitHubPagesProjectSite()) {
    return `/${segments[0]}`;
  }

  if (segments.length === 1) {
    return "";
  }

  return `/${segments.slice(0, -1).join("/")}`;
}

function buildRedirectUrl(id) {
  const origin = window.location.origin;
  const basePath = getBasePath();
  return `${origin}${basePath}/${encodeURIComponent(id)}`;
}

function renderSavedItems() {
  if (!savedList || !savedItems) {
    return;
  }

  const redirects = loadRedirects();
  const entries = Object.entries(redirects);

  savedItems.innerHTML = "";

  if (entries.length === 0) {
    savedList.hidden = false;
    savedItems.innerHTML = '<p class="saved-empty">まだ保存されたリダイレクトはありません。</p>';
    return;
  }

  savedList.hidden = false;
  entries
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([id, entry]) => {
      const item = document.createElement("article");
      item.className = "saved-item";
      item.innerHTML = `
        <p class="saved-item-title">${entry.title}</p>
        <a class="saved-item-link" href="${buildRedirectUrl(id)}" target="_blank" rel="noreferrer">${buildRedirectUrl(id)}</a>
        <p class="saved-item-meta">${entry.url}</p>
      `;
      savedItems.appendChild(item);
    });
}

function setMeta(name, content) {
  let element = document.querySelector(`meta[name="${name}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.name = name;
    document.head.appendChild(element);
  }
  element.content = content;
}

function setLink(rel, href, sizes = "") {
  const selector = sizes ? `link[rel="${rel}"][sizes="${sizes}"]` : `link[rel="${rel}"]`;
  let element = document.querySelector(selector);

  if (!element) {
    element = document.createElement("link");
    element.rel = rel;
    if (sizes) {
      element.sizes = sizes;
    }
    document.head.appendChild(element);
  }

  element.href = href;
}

function applyWebAppMetadata(entry) {
  document.title = entry.title;
  setMeta("apple-mobile-web-app-title", entry.title);
  setMeta("apple-mobile-web-app-capable", "yes");
  setMeta("apple-mobile-web-app-status-bar-style", "default");

  if (entry.icon) {
    setLink("icon", entry.icon);
    setLink("apple-touch-icon", entry.icon);
    setLink("apple-touch-icon", entry.icon, `${ICON_SIZE}x${ICON_SIZE}`);
    setLink("apple-touch-icon-precomposed", entry.icon);
    setLink("apple-touch-icon-precomposed", entry.icon, `${ICON_SIZE}x${ICON_SIZE}`);
  }
}

function getRequestedId() {
  const url = new URL(window.location.href);
  const redirectParam = url.searchParams.get("redirect");
  if (redirectParam) {
    return redirectParam;
  }

  const parts = getPathSegments();
  if (parts.length === 0) {
    return "";
  }

  if (isGitHubPagesProjectSite()) {
    if (parts.length === 1 || (parts.length === 2 && (parts[1] === "index.html" || parts[1] === "404.html"))) {
      return "";
    }

    return decodeURIComponent(parts[parts.length - 1]);
  }

  const last = parts[parts.length - 1];
  if (last === "index.html" || last === "404.html") {
    return "";
  }

  return decodeURIComponent(last);
}

function showRedirectView(entry) {
  builderView.hidden = true;
  redirectView.hidden = false;

  applyWebAppMetadata(entry);
  redirectTitle.textContent = entry.title;
  redirectDescription.textContent = loadAutoRedirectEnabled()
    ? "移動中です…"
    : "即リダイレクトは一時的にOFFです。ホーム画面に追加したあとで開いてください。";
  redirectLink.textContent = entry.url;
  if (openNowButton) {
    openNowButton.hidden = loadAutoRedirectEnabled();
    openNowButton.onclick = () => {
      window.location.replace(entry.url);
    };
  }

  if (loadAutoRedirectEnabled()) {
    window.location.replace(entry.url);
  }
}

function showRedirectNotFound(id) {
  builderView.hidden = true;
  redirectView.hidden = false;
  document.title = "Redirect Not Found";
  redirectTitle.textContent = "リダイレクト設定が見つかりません";
  redirectDescription.textContent =
    "このIDは現在のブラウザのローカルストレージに保存されていません。GitHub Pages版では、作成したのと同じブラウザで開く必要があります。";
  redirectLink.textContent = id ? `ID: ${id}` : "IDが指定されていません。";
}

function initRedirectMode() {
  const id = getRequestedId();
  if (!id) {
    renderSavedItems();
    return;
  }

  const redirects = loadRedirects();
  const entry = redirects[id];

  if (!entry) {
    showRedirectNotFound(id);
    return;
  }

  showRedirectView(entry);
}

if (iconInput) {
  iconInput.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];

    if (!file) {
      iconDataUrl = "";
      previewWrap.hidden = true;
      return;
    }

    try {
      iconDataUrl = await fileToIconDataUrl(file);
      previewImage.src = iconDataUrl;
      previewName.textContent = `${file.name} を ${ICON_SIZE}x${ICON_SIZE} に最適化`;
      previewWrap.hidden = false;
      setStatus("");
    } catch (error) {
      iconDataUrl = "";
      previewWrap.hidden = true;
      setStatus(error.message, true);
    }
  });
}

if (autoRedirectToggle) {
  autoRedirectToggle.checked = loadAutoRedirectEnabled();
  autoRedirectToggle.addEventListener("change", (event) => {
    saveAutoRedirectEnabled(event.target.checked);
    setStatus(
      event.target.checked
        ? "即リダイレクトをONにしました。"
        : "即リダイレクトをOFFにしました。ホーム画面追加用にそのまま開けます。"
    );
  });
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!iconDataUrl) {
      setStatus("アイコン画像を選択してください。", true);
      return;
    }

    submitButton.disabled = true;
    result.hidden = true;
    setStatus("作成中です...");

    try {
      const parsedUrl = new URL(urlInput.value);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("http/https のURLのみ利用できます。");
      }

      const trimmedTitle = titleInput.value.trim();
      if (!trimmedTitle) {
        throw new Error("タイトルを入力してください。");
      }

      const redirects = loadRedirects();
      const id = createIdFromUrl(parsedUrl, redirects);

      redirects[id] = {
        url: parsedUrl.toString(),
        title: trimmedTitle,
        icon: iconDataUrl
      };

      saveRedirects(redirects);

      const redirectUrl = buildRedirectUrl(id);
      resultLink.href = redirectUrl;
      resultLink.textContent = redirectUrl;
      result.hidden = false;
      setStatus("専用リダイレクトURLを発行しました。");
      renderSavedItems();
    } catch (error) {
      setStatus(error.message || "作成に失敗しました。", true);
    } finally {
      submitButton.disabled = false;
    }
  });
}

if (copyButton) {
  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(resultLink.textContent);
      setStatus("URLをコピーしました。");
    } catch {
      setStatus("コピーに失敗しました。", true);
    }
  });
}

initRedirectMode();
