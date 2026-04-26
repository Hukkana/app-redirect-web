const STORAGE_KEY = "redirect-builder:data";

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

let iconDataUrl = "";

function loadRedirects() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveRedirects(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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

function getBasePath() {
  const { pathname } = window.location;
  const isProjectSite = pathname.split("/").filter(Boolean).length > 0;
  const firstSlash = pathname.indexOf("/", 1);

  if (!isProjectSite || firstSlash === -1) {
    return "";
  }

  const isDirectFile = pathname.endsWith("/index.html") || pathname.endsWith("/404.html");
  return isDirectFile ? pathname.slice(0, pathname.lastIndexOf("/")) : pathname;
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

function setFavicon(iconUrl) {
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = iconUrl;
}

function getRequestedId() {
  const url = new URL(window.location.href);
  const redirectParam = url.searchParams.get("redirect");
  if (redirectParam) {
    return redirectParam;
  }

  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts.length === 0) {
    return "";
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

  document.title = entry.title;
  setFavicon(entry.icon);
  redirectTitle.textContent = entry.title;
  redirectDescription.textContent = "移動中です…";
  redirectLink.textContent = entry.url;

  setTimeout(() => {
    window.location.replace(entry.url);
  }, 80);
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
      iconDataUrl = await fileToDataUrl(file);
      previewImage.src = iconDataUrl;
      previewName.textContent = file.name;
      previewWrap.hidden = false;
      setStatus("");
    } catch (error) {
      iconDataUrl = "";
      previewWrap.hidden = true;
      setStatus(error.message, true);
    }
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

      const redirects = loadRedirects();
      const id = createIdFromUrl(parsedUrl, redirects);

      redirects[id] = {
        url: parsedUrl.toString(),
        title: titleInput.value.trim(),
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
