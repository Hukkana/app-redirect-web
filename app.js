const APP_CONFIG = window.APP_CONFIG || {};
const SUPABASE_URL = APP_CONFIG.supabaseUrl || "";
const SUPABASE_ANON_KEY = APP_CONFIG.supabaseAnonKey || "";
const SUPABASE_BUCKET = APP_CONFIG.supabaseBucket || "redirect-icons";
const AUTO_REDIRECT_KEY = "redirect-builder:auto-redirect";
const DEVICE_KEY = "redirect-builder:device-id";

const builderView = document.getElementById("builder-view");
const redirectView = document.getElementById("redirect-view");
const form = document.getElementById("create-form");
const editingIdInput = document.getElementById("editing-id");
const urlInput = document.getElementById("url");
const titleInput = document.getElementById("title");
const iconInput = document.getElementById("icon");
const publicToggle = document.getElementById("public-toggle");
const iconSizeInput = document.getElementById("icon-size");
const iconPositionXInput = document.getElementById("icon-position-x");
const iconPositionYInput = document.getElementById("icon-position-y");
const submitButton = document.getElementById("submit-button");
const cancelEditButton = document.getElementById("cancel-edit-button");
const result = document.getElementById("result");
const resultLink = document.getElementById("result-link");
const copyButton = document.getElementById("copy-button");
const status = document.getElementById("status");
const previewWrap = document.getElementById("preview-wrap");
const previewImage = document.getElementById("preview-image");
const previewName = document.getElementById("preview-name");
const myList = document.getElementById("my-list");
const myItems = document.getElementById("my-items");
const allList = document.getElementById("all-list");
const allItems = document.getElementById("all-items");
const redirectTitle = document.getElementById("redirect-title");
const redirectDescription = document.getElementById("redirect-description");
const redirectLink = document.getElementById("redirect-link");
const autoRedirectToggle = document.getElementById("auto-redirect-toggle");
const openNowButton = document.getElementById("open-now-button");
const deleteModal = document.getElementById("delete-modal");
const deleteModalText = document.getElementById("delete-modal-text");
const deleteCancelButton = document.getElementById("delete-cancel-button");
const deleteConfirmButton = document.getElementById("delete-confirm-button");

const DEFAULT_ICON_SIZE = 180;
const CACHE_PREFIX = "redirect-builder:cache:";

const supabaseClient =
  SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      })
    : null;

let iconDataUrl = "";
let iconBlob = null;
let selectedIconSourceUrl = "";
let selectedIconSourceName = "";
let editingOriginalIconUrl = "";
let editingOriginalIconPath = "";
let editingOriginalCreatorKey = "";
let editingOriginalNetworkKey = "";
let editingOriginalIsPublic = true;
let pendingDeleteId = "";
let identityPromise = null;

function isSupabaseReady() {
  return Boolean(supabaseClient);
}

function formatSupabaseError(prefix, error) {
  const message = error && error.message ? error.message : "";

  if (message.includes("Could not find the table 'public.redirects'")) {
    return "Supabaseの `public.redirects` テーブルがまだありません。README の SQL でテーブルを作成してください。";
  }

  return `${prefix}: ${message || "unknown error"}`;
}

function setStatus(message, isError = false) {
  if (!status) {
    return;
  }

  status.textContent = message;
  status.classList.toggle("error", isError);
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

function createRandomId() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getDeviceKey() {
  try {
    let deviceKey = localStorage.getItem(DEVICE_KEY);
    if (!deviceKey) {
      deviceKey = createRandomId();
      localStorage.setItem(DEVICE_KEY, deviceKey);
    }
    return deviceKey;
  } catch {
    return "device-unavailable";
  }
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function getNetworkKey() {
  try {
    const response = await fetch("https://api.ipify.org?format=json", {
      cache: "no-store"
    });
    if (!response.ok) {
      return "";
    }

    const data = await response.json();
    return data.ip ? await sha256(data.ip) : "";
  } catch {
    return "";
  }
}

function getIdentity() {
  if (!identityPromise) {
    identityPromise = Promise.all([Promise.resolve(getDeviceKey()), getNetworkKey()]).then(
      ([deviceKey, networkKey]) => ({ deviceKey, networkKey })
    );
  }

  return identityPromise;
}

function cacheRedirect(entry) {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${entry.id}`, JSON.stringify(entry));
  } catch {
    // ignore cache failures
  }
}

function clearRedirectCache(id) {
  try {
    localStorage.removeItem(`${CACHE_PREFIX}${id}`);
  } catch {
    // ignore cache failures
  }
}

function resetFormState() {
  form.reset();
  editingIdInput.value = "";
  iconDataUrl = "";
  iconBlob = null;
  selectedIconSourceUrl = "";
  selectedIconSourceName = "";
  editingOriginalIconUrl = "";
  editingOriginalIconPath = "";
  editingOriginalCreatorKey = "";
  editingOriginalNetworkKey = "";
  editingOriginalIsPublic = true;
  publicToggle.checked = true;
  submitButton.textContent = "作成";
  cancelEditButton.hidden = true;
  previewWrap.hidden = true;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました。"));
    reader.readAsDataURL(file);
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("画像の変換に失敗しました。"));
    image.src = source;
  });
}

async function fileToIconAssets(source) {
  const size = getIconSize();
  const positionX = getRangeValue(iconPositionXInput, 50) / 100;
  const positionY = getRangeValue(iconPositionYInput, 50) / 100;
  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("画像処理の初期化に失敗しました。");
  }

  canvas.width = size;
  canvas.height = size;

  const scale = Math.max(size / image.width, size / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const overflowX = Math.max(0, drawWidth - size);
  const overflowY = Math.max(0, drawHeight - size);
  const offsetX = -overflowX * positionX;
  const offsetY = -overflowY * positionY;

  context.clearRect(0, 0, size, size);
  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

  const dataUrl = canvas.toDataURL("image/png");
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((createdBlob) => {
      if (!createdBlob) {
        reject(new Error("アイコンの生成に失敗しました。"));
        return;
      }
      resolve(createdBlob);
    }, "image/png");
  });

  return { dataUrl, blob };
}

function getIconSize() {
  const parsed = Number.parseInt(iconSizeInput.value, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_ICON_SIZE;
  }

  return clamp(parsed, 64, 1024);
}

function getRangeValue(input, fallback) {
  const parsed = Number.parseInt(input.value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return clamp(parsed, 0, 100);
}

async function regenerateSelectedIcon() {
  if (!selectedIconSourceUrl) {
    return;
  }

  const iconAssets = await fileToIconAssets(selectedIconSourceUrl);
  iconDataUrl = iconAssets.dataUrl;
  iconBlob = iconAssets.blob;
  previewImage.src = iconDataUrl;
  previewName.textContent = `${selectedIconSourceName} を ${getIconSize()}x${getIconSize()} に調整`;
  previewWrap.hidden = false;
}

function normalizeDomainPart(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function createIdFromUrl(targetUrl, redirectsById) {
  const hostname = targetUrl.hostname.replace(/^www\./, "");
  const parts = hostname.split(".").filter(Boolean);
  const domainBase = parts.length >= 2 ? parts[parts.length - 2] : parts[0] || "link";
  const baseId = normalizeDomainPart(domainBase) || "link";
  let candidate = baseId;
  let suffix = 2;

  while (redirectsById[candidate]) {
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

function getAppleAppBannerContent(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "x.com" || host === "twitter.com") {
      return `app-id=333903271, app-argument=${targetUrl}`;
    }
  } catch {
    return "";
  }

  return "";
}

function applyWebAppMetadata(entry) {
  document.title = entry.title;
  setMeta("apple-mobile-web-app-title", entry.title);
  setMeta("apple-mobile-web-app-capable", "yes");
  setMeta("apple-mobile-web-app-status-bar-style", "default");

  const appleAppBannerContent = getAppleAppBannerContent(entry.url);
  if (appleAppBannerContent) {
    setMeta("apple-itunes-app", appleAppBannerContent);
  }

  if (entry.icon_url) {
    setLink("icon", entry.icon_url);
    setLink("apple-touch-icon", entry.icon_url);
    setLink("apple-touch-icon-precomposed", entry.icon_url);
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

function buildRedirectMap(entries) {
  return Object.fromEntries(entries.map((entry) => [entry.id, entry]));
}

async function listRedirects() {
  const { data, error } = await supabaseClient
    .from("redirects")
    .select("id, url, title, icon_url, icon_path, creator_key, network_key, is_public")
    .order("id", { ascending: true });

  if (error) {
    throw new Error(formatSupabaseError("リダイレクト一覧の取得に失敗しました", error));
  }

  const entries = data || [];
  entries.forEach(cacheRedirect);
  return entries;
}

async function getRedirectById(id) {
  const { data, error } = await supabaseClient
    .from("redirects")
    .select("id, url, title, icon_url, icon_path, creator_key, network_key, is_public")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(formatSupabaseError("リダイレクト設定の取得に失敗しました", error));
  }

  if (data) {
    cacheRedirect(data);
  }

  return data;
}

async function uploadIcon(id, blob) {
  const path = `${id}/${Date.now()}.png`;
  const { error: uploadError } = await supabaseClient.storage.from(SUPABASE_BUCKET).upload(path, blob, {
    cacheControl: "3600",
    contentType: "image/png",
    upsert: false
  });

  if (uploadError) {
    throw new Error(`アイコンのアップロードに失敗しました: ${uploadError.message}`);
  }

  const { data } = supabaseClient.storage.from(SUPABASE_BUCKET).getPublicUrl(path);
  return { iconPath: path, iconUrl: data.publicUrl };
}

async function removeIcon(path) {
  if (!path) {
    return;
  }

  const { error } = await supabaseClient.storage.from(SUPABASE_BUCKET).remove([path]);
  if (error) {
    console.error("Failed to remove old icon:", error.message);
  }
}

async function saveRedirect(entry, originalIconPath = "") {
  const { error } = await supabaseClient.from("redirects").upsert(entry, {
    onConflict: "id"
  });

  if (error) {
    if (entry.icon_path && entry.icon_path !== originalIconPath) {
      await removeIcon(entry.icon_path);
    }
    throw new Error(formatSupabaseError("リダイレクト設定の保存に失敗しました", error));
  }

  cacheRedirect(entry);
}

async function deleteRedirectRemote(id, iconPath) {
  const { error } = await supabaseClient.from("redirects").delete().eq("id", id);
  if (error) {
    throw new Error(formatSupabaseError("削除に失敗しました", error));
  }

  await removeIcon(iconPath);
  clearRedirectCache(id);
}

function canShowInMyList(entry, identity) {
  return (
    entry.creator_key === identity.deviceKey ||
    Boolean(identity.networkKey && entry.network_key === identity.networkKey)
  );
}

function renderRedirectItems(container, list, entries, showActions) {
  if (!list || !container) {
    return;
  }

  container.innerHTML = "";
  list.hidden = false;

  if (entries.length === 0) {
    container.innerHTML = '<p class="saved-empty">まだ保存されたリダイレクトはありません。</p>';
    return;
  }

  entries.forEach((entry) => {
    const item = document.createElement("article");
    item.className = "saved-item";
    item.innerHTML = `
      <p class="saved-item-title">${entry.title}</p>
      <a class="saved-item-link" href="${buildRedirectUrl(entry.id)}" target="_blank" rel="noreferrer">${buildRedirectUrl(entry.id)}</a>
      <p class="saved-item-meta">${entry.url}</p>
      ${
        showActions
          ? `<div class="saved-item-actions">
              <button type="button" class="saved-action edit" data-action="edit" data-id="${entry.id}">編集</button>
              <button type="button" class="saved-action delete" data-action="delete" data-id="${entry.id}">削除</button>
            </div>`
          : ""
      }
    `;
    container.appendChild(item);
  });
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
  redirectDescription.textContent = "Supabase 上にこのIDの設定が見つかりませんでした。";
  redirectLink.textContent = id ? `ID: ${id}` : "IDが指定されていません。";
}

function startEditing(entry) {
  editingIdInput.value = entry.id;
  urlInput.value = entry.url;
  titleInput.value = entry.title;
  iconDataUrl = entry.icon_url || "";
  iconBlob = null;
  selectedIconSourceUrl = entry.icon_url || "";
  selectedIconSourceName = "現在のアイコン";
  editingOriginalIconUrl = entry.icon_url || "";
  editingOriginalIconPath = entry.icon_path || "";
  editingOriginalCreatorKey = entry.creator_key || "";
  editingOriginalNetworkKey = entry.network_key || "";
  editingOriginalIsPublic = entry.is_public !== false;
  publicToggle.checked = editingOriginalIsPublic;
  previewImage.src = entry.icon_url || "";
  previewName.textContent = "現在のアイコン";
  previewWrap.hidden = !entry.icon_url;
  submitButton.textContent = "保存";
  cancelEditButton.hidden = false;
  result.hidden = true;
  setStatus(`"${entry.id}" を編集中です。`);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteRedirect(id) {
  const entry = await getRedirectById(id);
  if (!entry) {
    setStatus("削除対象が見つかりません。", true);
    return;
  }

  await deleteRedirectRemote(id, entry.icon_path);

  if (editingIdInput.value === id) {
    resetFormState();
  }

  await refreshSavedItems();
  setStatus(`"${id}" を削除しました。`);
}

async function refreshSavedItems() {
  const entries = await listRedirects();
  const identity = await getIdentity();
  const myEntries = entries.filter((entry) => canShowInMyList(entry, identity));
  const publicEntries = entries.filter((entry) => entry.is_public !== false);
  renderRedirectItems(myItems, myList, myEntries, true);
  renderRedirectItems(allItems, allList, publicEntries, false);
  return entries;
}

async function openDeleteModal(id) {
  try {
    const entry = await getRedirectById(id);
    if (!entry) {
      setStatus("削除対象が見つかりません。", true);
      return;
    }

    pendingDeleteId = id;
    deleteModalText.textContent = `${id} を削除します。転送先: ${entry.url}`;
    deleteModal.hidden = false;
  } catch (error) {
    setStatus(error.message, true);
  }
}

function closeDeleteModal() {
  pendingDeleteId = "";
  deleteConfirmButton.disabled = false;
  deleteCancelButton.disabled = false;
  deleteConfirmButton.textContent = "削除する";
  deleteModalText.textContent = "";
  deleteModal.hidden = true;
}

function showSetupMessage() {
  setStatus("Supabase の設定が未入力です。config.js に URL と anon key を設定してください。", true);
}

async function initRedirectMode() {
  const id = getRequestedId();
  if (!id) {
    if (isSupabaseReady()) {
      try {
        await refreshSavedItems();
      } catch (error) {
        setStatus(error.message, true);
      }
    } else {
      showSetupMessage();
    }
    return;
  }

  if (!isSupabaseReady()) {
    showRedirectNotFound(id);
    return;
  }

  try {
    const entry = await getRedirectById(id);
    if (!entry) {
      showRedirectNotFound(id);
      return;
    }

    showRedirectView(entry);
  } catch (error) {
    setStatus(error.message, true);
    showRedirectNotFound(id);
  }
}

if (iconInput) {
  iconInput.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];

    if (!file) {
      iconDataUrl = "";
      iconBlob = null;
      selectedIconSourceUrl = "";
      selectedIconSourceName = "";
      previewWrap.hidden = true;
      return;
    }

    try {
      selectedIconSourceUrl = await fileToDataUrl(file);
      selectedIconSourceName = file.name;
      await regenerateSelectedIcon();
      setStatus("");
    } catch (error) {
      iconDataUrl = "";
      iconBlob = null;
      selectedIconSourceUrl = "";
      selectedIconSourceName = "";
      previewWrap.hidden = true;
      setStatus(error.message, true);
    }
  });
}

[iconSizeInput, iconPositionXInput, iconPositionYInput].forEach((input) => {
  if (!input) {
    return;
  }

  input.addEventListener("input", async () => {
    try {
      await regenerateSelectedIcon();
      setStatus("");
    } catch (error) {
      setStatus(error.message, true);
    }
  });
});

if (cancelEditButton) {
  cancelEditButton.addEventListener("click", () => {
    resetFormState();
    setStatus("編集をやめました。");
  });
}

if (myItems) {
  myItems.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) {
      return;
    }

    const { action, id } = button.dataset;

    if (action === "edit") {
      try {
        const entry = await getRedirectById(id);
        if (!entry) {
          setStatus("編集対象が見つかりません。", true);
          return;
        }
        startEditing(entry);
      } catch (error) {
        setStatus(error.message, true);
      }
      return;
    }

    if (action === "delete") {
      await openDeleteModal(id);
    }
  });
}

if (deleteCancelButton) {
  deleteCancelButton.addEventListener("click", closeDeleteModal);
}

if (deleteConfirmButton) {
  deleteConfirmButton.addEventListener("click", async () => {
    if (!pendingDeleteId) {
      closeDeleteModal();
      return;
    }

    try {
      deleteConfirmButton.disabled = true;
      deleteCancelButton.disabled = true;
      deleteConfirmButton.textContent = "削除中...";
      await deleteRedirect(pendingDeleteId);
      closeDeleteModal();
    } catch (error) {
      deleteModalText.textContent = error.message || "削除に失敗しました。";
      setStatus(error.message, true);
    }
  });
}

if (deleteModal) {
  deleteModal.addEventListener("click", (event) => {
    if (event.target === deleteModal) {
      closeDeleteModal();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && deleteModal && !deleteModal.hidden) {
    closeDeleteModal();
  }
});

window.addEventListener("beforeunload", closeDeleteModal);
window.addEventListener("pageshow", closeDeleteModal);
window.addEventListener("load", closeDeleteModal);

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

    if (!isSupabaseReady()) {
      showSetupMessage();
      return;
    }

    submitButton.disabled = true;
    result.hidden = true;
    setStatus("保存中です...");

    try {
      const parsedUrl = new URL(urlInput.value);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("http/https のURLのみ利用できます。");
      }

      const trimmedTitle = titleInput.value.trim();
      if (!trimmedTitle) {
        throw new Error("タイトルを入力してください。");
      }

      const editingId = editingIdInput.value;
      const entries = await listRedirects();
      const redirectsById = buildRedirectMap(entries);
      const id = editingId || createIdFromUrl(parsedUrl, redirectsById);
      const identity = await getIdentity();

      let finalIconUrl = editingOriginalIconUrl;
      let finalIconPath = editingOriginalIconPath;

      if (iconBlob) {
        const uploaded = await uploadIcon(id, iconBlob);
        finalIconUrl = uploaded.iconUrl;
        finalIconPath = uploaded.iconPath;
      }

      if (!finalIconUrl) {
        throw new Error("アイコン画像を選択してください。");
      }

      const entry = {
        id,
        url: parsedUrl.toString(),
        title: trimmedTitle,
        icon_url: finalIconUrl,
        icon_path: finalIconPath,
        creator_key: editingOriginalCreatorKey || identity.deviceKey,
        network_key: editingOriginalNetworkKey || identity.networkKey,
        is_public: publicToggle.checked
      };

      await saveRedirect(entry, editingOriginalIconPath);

      if (editingOriginalIconPath && editingOriginalIconPath !== finalIconPath) {
        await removeIcon(editingOriginalIconPath);
      }

      const redirectUrl = buildRedirectUrl(id);
      resetFormState();
      result.hidden = false;
      resultLink.href = redirectUrl;
      resultLink.textContent = redirectUrl;
      await refreshSavedItems();
      setStatus(editingId ? "リダイレクト設定を更新しました。" : "専用リダイレクトURLを発行しました。");
    } catch (error) {
      setStatus(error.message || "保存に失敗しました。", true);
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
