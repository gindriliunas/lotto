const creditsEl = document.querySelector("#credits");
const playButton = document.querySelector("#play");
const messageEl = document.querySelector("#message");
const cardEl = document.querySelector("#card");
const prizeEl = document.querySelector("#prize");
const outcomeEl = document.querySelector("#outcome");
const canvas = document.querySelector("#foil");
const ctx = canvas.getContext("2d");
const screenshotButton = document.querySelector("#screenshot");
const savedTicket = document.querySelector("#saved-ticket");

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

let scratching = false;
let currentPlayId = null;

playButton.addEventListener("click", play);
screenshotButton.addEventListener("click", saveScreenshot);
canvas.addEventListener("pointerdown", startScratch);
canvas.addEventListener("pointermove", moveScratch);
canvas.addEventListener("pointerup", stopScratch);
canvas.addEventListener("pointercancel", stopScratch);

loadSession();

async function loadSession() {
  const response = await fetch("/api/session");
  const body = await response.json();
  if (!response.ok) {
    showError(body.error);
    return;
  }
  renderCredits(body.creditsRemaining);
  if (body.latestPlay) {
    revealCard(body.latestPlay, { restore: true });
    showSavedTicket(body.latestPlay.playId, { quiet: true });
  }
}

async function play() {
  playButton.disabled = true;
  messageEl.textContent = "";
  cardEl.hidden = true;
  currentPlayId = null;
  savedTicket.hidden = true;
  savedTicket.removeAttribute("src");

  const tokenResponse = await fetch("/api/play-token", { method: "POST" });
  const tokenBody = await tokenResponse.json();
  if (!tokenResponse.ok) {
    showError(tokenBody.error);
    return;
  }

  const playResponse = await fetch("/api/play", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: tokenBody.token }),
  });
  const playBody = await playResponse.json();
  if (!playResponse.ok) {
    showError(playBody.error);
    return;
  }

  renderCredits(playBody.creditsRemaining);
  revealCard(playBody);
}

function renderCredits(creditsRemaining) {
  creditsEl.textContent =
    creditsRemaining === 1
      ? "1 play left today"
      : `${creditsRemaining} plays left today`;
  playButton.disabled = creditsRemaining <= 0;
  if (creditsRemaining <= 0) {
    messageEl.textContent = "No plays left. They reset at midnight UK time.";
  }
}

async function saveScreenshot() {
  if (!currentPlayId) return;
  screenshotButton.disabled = true;
  const response = await fetch(`/api/plays/${currentPlayId}/screenshot`, { method: "POST" });
  const body = await response.json();
  screenshotButton.disabled = false;
  if (!response.ok) {
    showError(body.error);
    return;
  }
  showSavedTicket(currentPlayId);
  messageEl.textContent = "Screenshot saved to your private ticket store.";
}

function showSavedTicket(playId, options = {}) {
  savedTicket.hidden = true;
  savedTicket.onload = () => {
    savedTicket.hidden = false;
  };
  savedTicket.onerror = () => {
    savedTicket.hidden = true;
    savedTicket.removeAttribute("src");
    if (!options.quiet) {
      messageEl.textContent = "The screenshot could not be shown.";
    }
  };
  savedTicket.src = `/api/plays/${playId}/screenshot?saved=${Date.now()}`;
}

function revealCard(playBody, options = {}) {
  currentPlayId = playBody.playId;
  prizeEl.textContent =
    playBody.prizePence > 0 ? money.format(playBody.prizePence / 100) : "No win";
  outcomeEl.textContent =
    playBody.outcome === "jackpot"
      ? "Jackpot. This prize can only be claimed once."
      : playBody.outcome === "small"
        ? "A small win, decided before this card was shown."
        : "Nothing this time.";
  cardEl.hidden = false;
  canvas.hidden = Boolean(options.restore);
  if (!options.restore) {
    paintFoil();
  }
}

function paintFoil() {
  const width = canvas.width;
  const height = canvas.height;
  ctx.globalCompositeOperation = "source-over";
  const foil = ctx.createLinearGradient(0, 0, width, height);
  foil.addColorStop(0, "#eef2f6");
  foil.addColorStop(0.45, "#9aa3ad");
  foil.addColorStop(1, "#d5dbe2");
  ctx.fillStyle = foil;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#243027";
  ctx.font = "600 28px Georgia";
  ctx.textAlign = "center";
  ctx.fillText("Scratch here", width / 2, height / 2);
}

function startScratch(event) {
  scratching = true;
  canvas.setPointerCapture(event.pointerId);
  scratchAt(event);
}

function moveScratch(event) {
  if (!scratching) return;
  scratchAt(event);
}

function stopScratch() {
  scratching = false;
}

function scratchAt(event) {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(x, y, 28, 0, Math.PI * 2);
  ctx.fill();
}

function showError(code) {
  if (code === "no_credits") {
    renderCredits(0);
    return;
  }
  if (code === "token_rejected") {
    messageEl.textContent = "That play was already used or it expired. Start again.";
  } else if (code === "unauthenticated") {
    messageEl.textContent = "Sign-in is required.";
  } else if (code === "not_found") {
    messageEl.textContent = "That ticket is not yours to save.";
  } else {
    messageEl.textContent = "Something went wrong. Try again.";
  }
  playButton.disabled = false;
}
