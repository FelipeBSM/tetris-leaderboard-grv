// Cole aqui a URL /exec do seu Google Apps Script.
const API_URL = "https://script.google.com/macros/s/AKfycbz2Gljpcyy2Ujd7mI5TM4K8jyvbKY53ktgUcYVS9ilckPhTaCaEVqLRfi4iPui6B0dmAQ/exec";

const leaderboardEl = document.getElementById("leaderboard");
const statusEl = document.getElementById("status");

const REFRESH_MS = 50000;

function sanitizeText(value) {
  return String(value ?? "");
}

function formatScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("pt-BR") : "0";
}

function renderLeaderboard(players) {
  leaderboardEl.innerHTML = "";

  const validPlayers = players
    .filter(player => player && player.name);

  if (validPlayers.length === 0) {
    leaderboardEl.innerHTML = '<div class="loading">NO SCORES YET...</div>';
    return;
  }

  validPlayers.forEach((player, index) => {
    const row = document.createElement("div");
    row.className = `entry row top-${index + 1}`;

    const position = document.createElement("span");
    position.className = "position";
    position.textContent = `${index + 1}.`;

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = sanitizeText(player.name).toUpperCase();

    const score = document.createElement("span");
    score.className = "score";
    score.textContent = formatScore(player.score);

    const time = document.createElement("span");
    time.className = "time";
    time.textContent = sanitizeText(player.time);

    row.append(position, name, score, time);
    leaderboardEl.appendChild(row);
  });
}

async function loadLeaderboard() {
  if (API_URL.includes("COLOQUE_AQUI")) {
    leaderboardEl.innerHTML =
      '<div class="error">CONFIGURE API_URL EM script.js</div>';
    statusEl.textContent = "API NOT CONFIGURED";
    return;
  }

  statusEl.textContent = "SYNCING...";

  try {
    const response = await fetch(API_URL, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const players = await response.json();

    if (!Array.isArray(players)) {
      throw new Error("Resposta da API não é uma lista.");
    }

    renderLeaderboard(players);

    const now = new Date();
    statusEl.textContent =
      `ONLINE // UPDATED ${now.toLocaleTimeString("pt-BR")}`;
  } catch (error) {
    console.error("Erro ao carregar leaderboard:", error);
    leaderboardEl.innerHTML =
      '<div class="error">CONNECTION ERROR — CHECK CONSOLE</div>';
    statusEl.textContent = "OFFLINE";
  }
}

loadLeaderboard();
setInterval(loadLeaderboard, REFRESH_MS);
