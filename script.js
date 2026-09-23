// Google Apps Script Web App (/exec)
const API_URL = "https://script.google.com/macros/s/AKfycbz2Gljpcyy2Ujd7mI5TM4K8jyvbKY53ktgUcYVS9ilckPhTaCaEVqLRfi4iPui6B0dmAQ/exec";

const leaderboardEl = document.getElementById("leaderboard");
const statusEl = document.getElementById("leaderboardStatus");

const REFRESH_MS = 50000;
const REQUEST_TIMEOUT_MS = 12000;
const MAX_ATTEMPTS = 3;
const CACHE_KEY = "tetris-leaderboard-cache-v2";

let leaderboardRequestRunning = false;
let refreshTimer = null;
let hasRenderedData = false;

function sanitizeText(value) {
    return String(value ?? "");
}

function formatScore(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString("pt-BR") : "0";
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function renderLeaderboard(players) {
    const validPlayers = players.filter(player => player && player.name);

    if (validPlayers.length === 0) {
        leaderboardEl.innerHTML = '<div class="loading">NO SCORES YET...</div>';
        hasRenderedData = true;
        return;
    }

    const fragment = document.createDocumentFragment();

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
        fragment.appendChild(row);
    });

    leaderboardEl.replaceChildren(fragment);
    hasRenderedData = true;
}

function saveLastGoodData(players) {
    try {
        localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
                players,
                savedAt: Date.now()
            })
        );
    } catch (_) {
        // localStorage pode estar indisponível em alguns navegadores/modos privados.
    }
}

function loadLastGoodData() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);

        if (!raw) {
            return false;
        }

        const cached = JSON.parse(raw);

        if (!cached || !Array.isArray(cached.players)) {
            return false;
        }

        renderLeaderboard(cached.players);

        if (cached.savedAt) {
            const when = new Date(cached.savedAt).toLocaleTimeString("pt-BR");
            statusEl.textContent = `CACHED // LAST UPDATE ${when}`;
        } else {
            statusEl.textContent = "CACHED DATA";
        }

        return true;

    } catch (_) {
        return false;
    }
}

async function fetchLeaderboardOnce() {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(API_URL, {
            method: "GET",
            cache: "no-store",
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        // Primeiro lê como texto para conseguirmos diagnosticar
        // respostas HTML ou JSON quebrado.
        const text = await response.text();

        let players;

        try {
            players = JSON.parse(text);
        } catch (_) {
            throw new Error(
                `Resposta não é JSON válido: ${text.slice(0, 120)}`
            );
        }

        if (!Array.isArray(players)) {
            const serverMessage = players?.error
                ? `: ${players.error}`
                : "";

            throw new Error(
                `Resposta da API não é uma lista${serverMessage}`
            );
        }

        return players;

    } finally {
        clearTimeout(timeout);
    }
}

async function fetchLeaderboardWithRetry() {
    let lastError;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            return await fetchLeaderboardOnce();

        } catch (error) {
            lastError = error;

            if (attempt < MAX_ATTEMPTS) {
                // Backoff + pequeno jitter.
                // Evita vários celulares repetindo a requisição juntos.
                const delay =
                    650 * (2 ** (attempt - 1)) +
                    Math.floor(Math.random() * 350);

                await sleep(delay);
            }
        }
    }

    throw lastError;
}

function scheduleNextRefresh(delay = REFRESH_MS) {
    clearTimeout(refreshTimer);

    refreshTimer = setTimeout(() => {
        loadLeaderboard();
    }, delay);
}

async function loadLeaderboard({ force = false } = {}) {
    if (API_URL.includes("COLOQUE_AQUI")) {
        leaderboardEl.innerHTML =
            '<div class="error">CONFIGURE API_URL EM script.js</div>';

        statusEl.textContent = "API NOT CONFIGURED";
        return;
    }

    // Não faz requests desnecessários quando a página está
    // em background ou quando o AR está rodando.
    if (
        !force &&
        (
            document.hidden ||
            (typeof arRunning !== "undefined" && arRunning)
        )
    ) {
        scheduleNextRefresh();
        return;
    }

    // Impede duas chamadas simultâneas.
    if (leaderboardRequestRunning) {
        return;
    }

    leaderboardRequestRunning = true;

    if (!hasRenderedData) {
        statusEl.textContent = "SYNCING...";
    }

    try {
        const players = await fetchLeaderboardWithRetry();

        renderLeaderboard(players);
        saveLastGoodData(players);

        const now = new Date();

        statusEl.textContent =
            `ONLINE // UPDATED ${now.toLocaleTimeString("pt-BR")}`;

    } catch (error) {
        console.error("Leaderboard fetch failed:", error);

        // Se já temos dados bons, não apagamos a leaderboard.
        if (!hasRenderedData) {
            leaderboardEl.innerHTML =
                '<div class="error">TEMPORARY CONNECTION ERROR — RETRYING...</div>';
        }

        statusEl.textContent = hasRenderedData
            ? "RECONNECTING // SHOWING LAST DATA"
            : "OFFLINE // RETRYING";

    } finally {
        leaderboardRequestRunning = false;

        scheduleNextRefresh();
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

        arScene.addEventListener(
            "loaded",
            onLoaded,
            { once: true }
        );

        if (arScene.hasLoaded) {
            arScene.removeEventListener("loaded", onLoaded);
            resolve();
        }

    });
}

async function enterArMode() {
    if (
        !isMobileLayout() ||
        arRunning ||
        arChangingState
    ) {
        return;
    }

    arChangingState = true;

    trofeuContainer.setAttribute("visible", false);

    arMode.classList.add("is-active");
    arMode.setAttribute("aria-hidden", "false");

    document.body.classList.add("ar-active");

    arStatus.textContent = "INICIANDO CÂMERA...";

    // Para o refresh da leaderboard enquanto usa AR.
    clearTimeout(refreshTimer);

    try {

        await waitForArScene();

        const mindarSystem = getMindArSystem();

        if (!mindarSystem) {
            throw new Error(
                "Sistema MindAR não encontrado."
            );
        }

        await mindarSystem.start();

        arRunning = true;

        arStatus.textContent =
            "Aponte a câmera para o sticker do GRV";

    } catch (error) {

        console.error(
            "Erro ao iniciar o AR:",
            error
        );

        arStatus.textContent =
            "NÃO FOI POSSÍVEL ABRIR A CÂMERA";

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

        console.warn(
            "Erro ao encerrar o AR:",
            error
        );

    } finally {

        arRunning = false;
        arChangingState = false;

        trofeuContainer.setAttribute(
            "visible",
            false
        );

        arMode.classList.remove("is-active");

        arMode.setAttribute(
            "aria-hidden",
            "true"
        );

        document.body.classList.remove(
            "ar-active"
        );

        arStatus.textContent =
            "Aponte a câmera para o sticker do GRV";

        // Atualiza imediatamente ao voltar do AR.
        loadLeaderboard({
            force: true
        });
    }
}

enterArButton.addEventListener(
    "click",
    enterArMode
);

exitArButton.addEventListener(
    "click",
    exitArMode
);


grvTarget.addEventListener(
    "targetFound",
    () => {

        console.log("GRV encontrado!");

        trofeuContainer.setAttribute(
            "visible",
            true
        );

        arStatus.textContent =
            "GRV DETECTADO!";
    }
);


grvTarget.addEventListener(
    "targetLost",
    () => {

        console.log("GRV perdido.");

        trofeuContainer.setAttribute(
            "visible",
            false
        );

        arStatus.textContent =
            "Aponte a câmera para o sticker do GRV";
    }
);


// Se sair do layout mobile,
// encerra o AR.
window.addEventListener(
    "resize",
    () => {

        if (
            arRunning &&
            !isMobileLayout()
        ) {
            exitArMode();
        }

    }
);


// Garante que a câmera pare
// quando a página for fechada.
window.addEventListener(
    "pagehide",
    () => {

        clearTimeout(refreshTimer);

        if (arRunning) {

            const mindarSystem =
                getMindArSystem();

            mindarSystem?.stop();
        }

    }
);


// Quando o usuário volta para a aba,
// atualiza imediatamente.
document.addEventListener(
    "visibilitychange",
    () => {

        if (
            !document.hidden &&
            !arRunning
        ) {
            loadLeaderboard({
                force: true
            });
        }

    }
);


// Se a internet voltar,
// tenta sincronizar imediatamente.
window.addEventListener(
    "online",
    () => {

        loadLeaderboard({
            force: true
        });

    }
);


window.addEventListener(
    "offline",
    () => {

        statusEl.textContent =
            hasRenderedData
                ? "OFFLINE // SHOWING LAST DATA"
                : "OFFLINE";

    }
);


// Primeiro mostra o último resultado salvo,
// caso exista.
loadLastGoodData();

// Depois tenta buscar a versão atual.
loadLeaderboard({
    force: true
});