// Cole aqui a URL /exec do seu Google Apps Script.
const API_URL = "https://script.google.com/macros/s/AKfycbz2Gljpcyy2Ujd7mI5TM4K8jyvbKY53ktgUcYVS9ilckPhTaCaEVqLRfi4iPui6B0dmAQ/exec";

const leaderboardEl = document.getElementById("leaderboard");
const statusEl = document.getElementById("leaderboardStatus");


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

/* =========================================================
   AR MODE
   ========================================================= */

const enterArButton = document.getElementById("enterArButton");
const exitArButton = document.getElementById("exitArButton");
const arMode = document.getElementById("arMode");
const arScene = document.getElementById("arScene");
const arStatus = document.getElementById("arStatus");
const grvTarget = document.getElementById("grvTarget");
const trofeuContainer = document.getElementById("trofeuContainer");

let arRunning = false;
let arChangingState = false;

function isMobileLayout() {
  return window.matchMedia("(max-width: 900px)").matches;
}

function getMindArSystem() {
  return arScene?.systems?.["mindar-image-system"] ?? null;
}

async function waitForArScene() {
  if (arScene.hasLoaded && getMindArSystem()) {
    return;
  }

  await new Promise((resolve) => {
    const onLoaded = () => {
      arScene.removeEventListener("loaded", onLoaded);
      resolve();
    };

    arScene.addEventListener("loaded", onLoaded, { once: true });

    // Segurança para o caso de a cena terminar de carregar entre o teste e o listener.
    if (arScene.hasLoaded) {
      arScene.removeEventListener("loaded", onLoaded);
      resolve();
    }
  });
}

async function enterArMode() {
  if (!isMobileLayout() || arRunning || arChangingState) {
    return;
  }

  arChangingState = true;
  trofeuContainer.setAttribute("visible", false);
  arMode.classList.add("is-active");
  arMode.setAttribute("aria-hidden", "false");
  document.body.classList.add("ar-active");
  arStatus.textContent = "INICIANDO CÂMERA...";

  try {
    await waitForArScene();

    const mindarSystem = getMindArSystem();

    if (!mindarSystem) {
      throw new Error("Sistema MindAR não encontrado.");
    }

    await mindarSystem.start();

    arRunning = true;
    arStatus.textContent = "Aponte a câmera para o sticker do GRV";
  } catch (error) {
    console.error("Erro ao iniciar o AR:", error);
    arStatus.textContent = "NÃO FOI POSSÍVEL ABRIR A CÂMERA";

    // Mantém o overlay aberto para o usuário conseguir voltar.
  } finally {
    arChangingState = false;
  }
}

async function exitArMode() {
  if (arChangingState) {
    return;
  }

  arChangingState = true;

  try {
    if (arRunning) {
      const mindarSystem = getMindArSystem();

      if (mindarSystem) {
        await mindarSystem.stop();
      }
    }
  } catch (error) {
    console.warn("Erro ao encerrar o AR:", error);
  } finally {
    arRunning = false;
    arChangingState = false;
    trofeuContainer.setAttribute("visible", false);
    arMode.classList.remove("is-active");
    arMode.setAttribute("aria-hidden", "true");
    document.body.classList.remove("ar-active");
    arStatus.textContent = "Aponte a câmera para o sticker do GRV";
  }
}

enterArButton.addEventListener("click", enterArMode);
exitArButton.addEventListener("click", exitArMode);

grvTarget.addEventListener("targetFound", () => {
    console.log("GRV encontrado!");

    trofeuContainer.setAttribute("visible", true);

    arStatus.textContent = "GRV DETECTADO!";
});

grvTarget.addEventListener("targetLost", () => {
    console.log("GRV perdido.");

    trofeuContainer.setAttribute("visible", false);

    arStatus.textContent = "Aponte a câmera para o sticker do GRV";
});

// Se o aparelho girar/redimensionar para layout desktop, fecha o AR.
window.addEventListener("resize", () => {
  if (arRunning && !isMobileLayout()) {
    exitArMode();
  }
});

// Garante que a câmera não continue ativa se a página for descarregada.
window.addEventListener("pagehide", () => {
  if (arRunning) {
    const mindarSystem = getMindArSystem();
    mindarSystem?.stop();
  }
});

loadLeaderboard();
setInterval(loadLeaderboard, REFRESH_MS);
