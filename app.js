// ===== Modelo =====
const SUITS = ["oros", "copas", "espadas", "bastos"];
const LABEL = { oros: "Oros", copas: "Copas", espadas: "Espadas", bastos: "Bastos" };
const EMOJI = { oros: "🟡", copas: "🍷", espadas: "⚔️", bastos: "🪵" };

const TRACK_LEN = 7; // meta
const CHECKPOINTS = 7;

let state = null;
let autoTimer = null;

// ===== UI refs =====
const elPlayers = document.getElementById("playersSelect");
const btnStart = document.getElementById("btnStart");
const btnReset = document.getElementById("btnReset");
const btnDraw = document.getElementById("btnDraw");
const btnAuto = document.getElementById("btnAuto");
const btnStop = document.getElementById("btnStop");

const elBoard = document.getElementById("board");
const elLog = document.getElementById("log");
const elLast = document.getElementById("lastCard");
const elWinner = document.getElementById("winner");
const elRemaining2 = document.getElementById("remaining2");
const elLastFace = document.getElementById("lastCardFace");

// ===== Utilidades =====
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function createDeck() {
  // baraja española 40: 1-7,10-12; quitamos 11 (caballo), y 8-9 no existen => 36 cartas
  const values = [1,2,3,4,5,6,7,10,12];
  const deck = [];
  for (const s of SUITS) {
    for (const v of values) deck.push({ suit: s, label: `${v} de ${LABEL[s]}` });
  }
  shuffleInPlace(deck);
  return deck;
}

function stopAuto() {
  if (autoTimer !== null) clearInterval(autoTimer);
  autoTimer = null;
  updateButtons();
}

function updateButtons() {
  const running = autoTimer !== null;
  const hasGame = !!state;
  const finished = !!state?.winner;

  btnDraw.disabled = !hasGame || finished || running;
  btnAuto.disabled = !hasGame || finished || running;
  btnStop.disabled = !hasGame || !running;
}

// ===== Juego =====
function initGame(numPlayers) {
  stopAuto();

  if (![2,3,4].includes(numPlayers)) {
    alert("Jugadores inválidos (2 a 4).");
    return;
  }

  const players = SUITS.slice(0, numPlayers);
  const deck = createDeck();

  // checkpoints (7 cartas boca abajo)
  const checkpoints = [];
  for (let i = 1; i <= CHECKPOINTS; i++) {
    const c = deck.pop();
    if (!c) throw new Error("No hay suficientes cartas para checkpoints.");
    checkpoints.push({ index: i, card: c, revealed: false });
  }

  const horses = {};
  for (const s of players) horses[s] = { pos: 0 };

  state = {
    players,
    deck,
    checkpoints,
    horses,
    last: null,
    winner: null,
    log: [`🎲 Juego iniciado con ${numPlayers} jugador(es): ${players.map(p=>LABEL[p]).join(", ")}`]
  };

  updateButtons();
  render();
}

function allPassed(checkpointIndex) {
  // todos los caballos activos han alcanzado/pasado esa casilla
  return state.players.every(s => state.horses[s].pos >= checkpointIndex);
}

function revealIfNeeded() {
  for (const cp of state.checkpoints) {
    if (!cp.revealed && allPassed(cp.index)) {
      cp.revealed = true;

      const suit = cp.card.suit;
      if (state.players.includes(suit)) {
        const before = state.horses[suit].pos;
        state.horses[suit].pos = Math.max(0, before - 1);
        state.log.push(`📌 Se revela Carta ${cp.index}: ${cp.card.label}. ${LABEL[suit]} retrocede ( ${before} → ${state.horses[suit].pos} ).`);
      } else {
        state.log.push(`📌 Se revela Carta ${cp.index}: ${cp.card.label}. (palo no activo)`);
      }
    }
  }
}

function checkWin() {
  for (const s of state.players) {
    if (state.horses[s].pos >= TRACK_LEN) {
      state.winner = s;
      state.log.push(`🏁 ¡Gana ${LABEL[s]}!`);
      stopAuto();
      return;
    }
  }
}

function drawCard() {
  if (!state || state.winner) return;

  const c = state.deck.pop();
  if (!c) {
    state.log.push("🧯 Se acabó el mazo. Fin sin ganador.");
    stopAuto();
    render();
    return;
  }

  state.last = c;

  if (state.players.includes(c.suit)) {
    const before = state.horses[c.suit].pos;
    state.horses[c.suit].pos = before + 1;
    state.log.push(`🃏 Sale: ${c.label}. Avanza ${LABEL[c.suit]} ( ${before} → ${state.horses[c.suit].pos} ).`);
  } else {
    state.log.push(`🃏 Sale: ${c.label}. (palo no activo, se ignora).`);
  }

  revealIfNeeded();
  checkWin();
  render();
}

function startAuto() {
  if (!state || state.winner) return;
  stopAuto();
  autoTimer = setInterval(() => {
    if (!state || state.winner) { stopAuto(); return; }
    drawCard();
  }, 450);
  updateButtons();
}

// ===== Render =====
function escapeHtml(s) {
  return s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

function render() {
  // render seguro si no hay juego
  if (!state) {
    elBoard.innerHTML = "";
    elLast.textContent = "—";
    elWinner.textContent = "—";
    elRemaining2.textContent = "—";
    elLastFace.textContent = "—";
    elLog.textContent = "— Inicia un juego —";
    updateButtons();
    return;
  }

  // tablero: columnas = cartas + N caballos
  const grid = document.createElement("div");
  grid.className = "boardGrid";
  grid.style.gridTemplateColumns = `140px repeat(${state.players.length}, 1fr)`;

  // header
  const h0 = document.createElement("div");
  h0.className = "hcell";
  h0.textContent = "Cartas";
  grid.appendChild(h0);

  for (const s of state.players) {
    const hc = document.createElement("div");
    hc.className = "hcell";
    hc.textContent = `${EMOJI[s]} ${LABEL[s]}`;
    grid.appendChild(hc);
  }

  // filas (7..0) para que suban visualmente
  for (let row = TRACK_LEN; row >= 0; row--) {
    // celda izquierda (carta)
    const left = document.createElement("div");
    left.className = "bcell";

    if (row === 0) {
      left.textContent = "Salida";
    } else {
      const cp = state.checkpoints[row - 1]; // carta 1 está en índice 0
      const card = document.createElement("div");
      card.className = `cpCard ${cp.revealed ? "revealed" : "hidden"}`;
      card.textContent = cp.revealed ? cp.card.label : `Carta ${row}`;
      left.appendChild(card);
    }
    grid.appendChild(left);

    // columnas caballos
    for (const s of state.players) {
      const cell = document.createElement("div");
      cell.className = "bcell";
      if (state.horses[s].pos === row) {
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

  elLast.textContent = state.last ? state.last.label : "—";
  elWinner.textContent = state.winner ? `${LABEL[state.winner]} ${EMOJI[state.winner]}` : "—";
  elRemaining2.textContent = String(state.deck.length);
  elLastFace.textContent = state.last ? state.last.label : "—";

  elLog.innerHTML = state.log.slice().reverse().map(x => `<div>${escapeHtml(x)}</div>`).join("");

  updateButtons();
}

// ===== Eventos =====
btnStart.addEventListener("click", () => initGame(Number(elPlayers.value)));
btnReset.addEventListener("click", () => { stopAuto(); state = null; render(); });
btnDraw.addEventListener("click", () => drawCard());
btnAuto.addEventListener("click", () => startAuto());
btnStop.addEventListener("click", () => stopAuto());

// primer render
render();