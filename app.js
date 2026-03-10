const SUITS = ["oros", "copas", "espadas", "bastos"];
const LABEL = { oros: "Oros", copas: "Copas", espadas: "Espadas", bastos: "Bastos" };
const EMOJI = { oros: "O", copas: "C", espadas: "E", bastos: "B" };
const TRACK_LEN = 7;

let token = localStorage.getItem("token") || "";
let me = null;
let socket = null;
let snapshot = { players: [], canStart: false, game: null };

const elAuthScreen = document.getElementById("authScreen");
const elGameScreen = document.getElementById("gameScreen");
const elAuthBox = document.getElementById("authBox");
const elProfileBox = document.getElementById("profileBox");
const elUsername = document.getElementById("username");
const elPassword = document.getElementById("password");
const btnRegister = document.getElementById("btnRegister");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");
const btnBuy = document.getElementById("btnBuy");

const elMeUser = document.getElementById("meUser");
const elMePoints = document.getElementById("mePoints");
const elPlayersList = document.getElementById("playersList");
const elBet = document.getElementById("betInput");
const btnSetBet = document.getElementById("btnSetBet");
const btnStart = document.getElementById("btnStart");
const btnDraw = document.getElementById("btnDraw");
const btnAuto = document.getElementById("btnAuto");
const btnStop = document.getElementById("btnStop");

const elBoard = document.getElementById("board");
const elLog = document.getElementById("log");
const elLast = document.getElementById("lastCard");
const elWinner = document.getElementById("winner");
const elRemaining = document.getElementById("remaining2");
const elLastFace = document.getElementById("lastCardFace");

function escapeHtml(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function api(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error de servidor");
  return data;
}

function addLog(line) {
  const now = new Date().toLocaleTimeString();
  elLog.innerHTML = `<div>[${now}] ${escapeHtml(line)}</div>` + elLog.innerHTML;
}

function updateAuthView() {
  const logged = !!me;
  elAuthScreen.classList.toggle("hidden", logged);
  elGameScreen.classList.toggle("hidden", !logged);
  elAuthBox.classList.toggle("hidden", logged);
  elProfileBox.classList.toggle("hidden", !logged);
  if (logged) {
    elMeUser.textContent = me.username;
    elMePoints.textContent = String(me.points);
  } else {
    elUsername.value = "";
    elPassword.value = "";
    elMeUser.textContent = "-";
    elMePoints.textContent = "-";
  }
}

function renderPlayers(players) {
  if (!players.length) {
    elPlayersList.textContent = "Sin jugadores conectados.";
    return;
  }
  elPlayersList.innerHTML = players
    .map((p) => {
      const meTag = me && p.username === me.username ? " (tu)" : "";
      return `<div class="userchip"><strong>${escapeHtml(p.username)}</strong>${meTag}<br/>Caballo: ${LABEL[p.suit]} | Apuesta: ${p.bet || 0} | Puntos: ${p.points}</div>`;
    })
    .join("");
}

function renderBoard(game) {
  if (!game) {
    elBoard.innerHTML = "";
    elLast.textContent = "-";
    elWinner.textContent = "-";
    elRemaining.textContent = "-";
    elLastFace.textContent = "-";
    return;
  }

  const players = game.players;
  const grid = document.createElement("div");
  grid.className = "boardGrid";
  grid.style.gridTemplateColumns = `120px repeat(${players.length}, 1fr)`;

  const head = document.createElement("div");
  head.className = "hcell";
  head.textContent = "Cartas";
  grid.appendChild(head);

  for (const p of players) {
    const h = document.createElement("div");
    h.className = "hcell";
    h.textContent = `${EMOJI[p.suit]} ${p.username}`;
    grid.appendChild(h);
  }

  for (let row = TRACK_LEN; row >= 0; row--) {
    const left = document.createElement("div");
    left.className = "bcell";
    if (row === 0) {
      left.textContent = "Salida";
    } else {
      const cp = game.checkpoints[row - 1];
      const card = document.createElement("div");
      card.className = `cpCard ${cp.revealed ? "revealed" : "hidden"}`;
      card.textContent = cp.revealed ? cp.card.label : `Carta ${row}`;
      left.appendChild(card);
    }
    grid.appendChild(left);

    for (const p of players) {
      const cell = document.createElement("div");
      cell.className = "bcell";
      if (game.horses[p.suit].pos === row) {
        const pawn = document.createElement("div");
        pawn.className = "horsePawn";
        pawn.textContent = "🐎";
        cell.appendChild(pawn);
      }
      grid.appendChild(cell);
    }
  }

  elBoard.innerHTML = "";
  elBoard.appendChild(grid);
  elLast.textContent = game.last ? game.last.label : "-";
  elLastFace.textContent = game.last ? game.last.label : "-";
  elRemaining.textContent = String(game.deckCount);
  if (game.winner) {
    elWinner.textContent = `${game.winner.username} (+${game.winner.payout})`;
  } else {
    elWinner.textContent = "-";
  }
}

function updateActionButtons() {
  const game = snapshot.game;
  const canAct = !!game && !game.winner;
  btnDraw.disabled = !canAct || game.auto;
  btnAuto.disabled = !canAct || game.auto;
  btnStop.disabled = !canAct || !game.auto;
  btnStart.disabled = !snapshot.canStart;
}

function renderSnapshot() {
  renderPlayers(snapshot.players || []);
  renderBoard(snapshot.game);
  updateActionButtons();

  const mine = (snapshot.players || []).find((p) => me && p.username === me.username);
  if (mine) {
    me.points = mine.points;
    updateAuthView();
  }

  if (snapshot.game?.log?.length) {
    elLog.innerHTML = snapshot.game.log
      .slice()
      .reverse()
      .map((x) => `<div>${escapeHtml(x)}</div>`)
      .join("");
  }
}

function connectSocket() {
  if (!token) return;
  if (socket) socket.disconnect();

  socket = io({ auth: { token } });

  socket.on("connect", () => addLog("Conectado a la sala."));
  socket.on("snapshot", (data) => {
    snapshot = data;
    renderSnapshot();
  });
  socket.on("event", (msg) => addLog(msg));
  socket.on("error_message", (msg) => addLog(`Error: ${msg}`));
  socket.on("disconnect", () => addLog("Conexion cerrada."));
}

async function hydrate() {
  if (!token) {
    updateAuthView();
    return;
  }

  try {
    const data = await api("/api/me");
    me = data.user;
    updateAuthView();
    connectSocket();
  } catch {
    localStorage.removeItem("token");
    token = "";
    me = null;
    updateAuthView();
  }
}

btnRegister.addEventListener("click", async () => {
  try {
    const username = elUsername.value.trim();
    const password = elPassword.value.trim();
    const data = await api("/api/register", "POST", { username, password });
    token = data.token;
    localStorage.setItem("token", token);
    me = data.user;
    updateAuthView();
    connectSocket();
    addLog("Registro completado. Se asignaron 1000 puntos.");
  } catch (err) {
    addLog(err.message);
  }
});

btnLogin.addEventListener("click", async () => {
  try {
    const username = elUsername.value.trim();
    const password = elPassword.value.trim();
    const data = await api("/api/login", "POST", { username, password });
    token = data.token;
    localStorage.setItem("token", token);
    me = data.user;
    updateAuthView();
    connectSocket();
    addLog("Sesion iniciada.");
  } catch (err) {
    addLog(err.message);
  }
});

btnLogout.addEventListener("click", () => {
  if (socket) socket.disconnect();
  token = "";
  me = null;
  localStorage.removeItem("token");
  snapshot = { players: [], canStart: false, game: null };
  updateAuthView();
  renderSnapshot();
});

btnBuy.addEventListener("click", async () => {
  try {
    const data = await api("/api/buy-points", "POST");
    me.points = data.points;
    updateAuthView();
    addLog(data.message);
    if (socket) socket.emit("refresh");
  } catch (err) {
    addLog(err.message);
  }
});

btnSetBet.addEventListener("click", () => {
  if (!socket) return;
  const amount = Number(elBet.value);
  socket.emit("set_bet", { amount });
});

btnStart.addEventListener("click", () => socket && socket.emit("start_game"));
btnDraw.addEventListener("click", () => socket && socket.emit("draw_card"));
btnAuto.addEventListener("click", () => socket && socket.emit("auto_start"));
btnStop.addEventListener("click", () => socket && socket.emit("auto_stop"));

hydrate();
