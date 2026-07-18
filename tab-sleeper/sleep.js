function buildResumeUrl(url, videoTime) {
  if (!videoTime || videoTime < 3) return url;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") && u.pathname === "/watch") {
      u.searchParams.set("t", Math.floor(videoTime) + "s");
    }
    return u.toString();
  } catch {
    return url;
  }
}

(function init() {
  const params = new URLSearchParams(window.location.search);
  const originalUrl = params.get("u");
  const title = params.get("t");
  const favIconUrl = params.get("f");
  const videoTime = params.get("v") ? Number(params.get("v")) : null;

  const titleEl = document.getElementById("title");
  const hostEl = document.getElementById("host");
  const faviconEl = document.getElementById("favicon");
  const wakeBtn = document.getElementById("wakeBtn");

  if (!originalUrl) {
    titleEl.textContent = "Tab schläft (keine Info verfügbar)";
    wakeBtn.disabled = true;
    return;
  }

  document.title = title || originalUrl;
  titleEl.textContent = title || originalUrl;

  try {
    hostEl.textContent = new URL(originalUrl).hostname;
  } catch {
    hostEl.textContent = originalUrl;
  }

  if (favIconUrl) {
    faviconEl.src = favIconUrl;
    faviconEl.style.display = "inline";

    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = favIconUrl;
  }

  wakeBtn.addEventListener("click", () => {
    window.location.href = buildResumeUrl(originalUrl, videoTime);
  });
})();
