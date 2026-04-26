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
