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

let iconDataUrl = "";

function setStatus(message, isError = false) {
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!iconDataUrl) {
    setStatus("アイコン画像を選択してください。", true);
    return;
  }

  submitButton.disabled = true;
  setStatus("作成中です...");
  result.hidden = true;

  try {
    const response = await fetch("/api/redirects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: urlInput.value,
        title: titleInput.value,
        icon: iconDataUrl
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "作成に失敗しました。");
    }

    resultLink.href = data.path;
    resultLink.textContent = data.shortUrl;
    result.hidden = false;
    setStatus("専用リダイレクトURLを発行しました。");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(resultLink.textContent);
    setStatus("URLをコピーしました。");
  } catch {
    setStatus("コピーに失敗しました。", true);
  }
});
