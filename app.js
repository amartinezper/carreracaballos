const SUITS = ["oros", "copas", "espadas", "bastos"];
const LABEL = { oros: "Oros", copas: "Copas", espadas: "Espadas", bastos: "Bastos" };
const EMOJI = { oros: "🟡", copas: "🍷", espadas: "⚔️", bastos: "🪵" };
const TRACK_LEN = 7;

let state = null;
let autoTimer = null;

// UI
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
const elRemaining = document.getElementById("remaining2");
const elLastFace = document.getElementById("lastCardFace");

// Utils
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function createDeck() {
  // Baraja española sin caballos (11) y sin 8-9 => 36 cartas
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

function startAuto() {
  if (!state || state.winner) return;
  stopAuto();
  autoTimer = setInterval(() => {
    if (!state || state.winner) { stopAuto(); return; }
    drawCard();
  }, 450);
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

// Game
function initGame(n) {
  stopAuto();

  const players = SUITS.slice(0, n);
  const deck = createDeck();

  const checkpoints = [];
  for (let i = 1; i <= 7; i++) {
    const c = deck.pop();
    checkpoints.push({ index: i, card: c, revealed: false });
  }

  const horses = {};
  players.forEach(s => horses[s] = { pos: 0 });

  state = {
    players,
    deck,
    checkpoints,
    horses,
    last: null,
    winner: null,
    log: [`🎲 Juego iniciado con ${n} jugador(es): ${players.map(p=>LABEL[p]).join(", ")}`]
  };

  updateButtons();
  render();
}

function allPassed(checkpointIndex) {
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
        state.log.push(`📌 Se revela Carta ${cp.index}: ${cp.card.label}. ${LABEL[suit]} retrocede (${before} → ${state.horses[suit].pos}).`);
      } else {
        state.log.push(`📌 Se revela Carta ${cp.index}: ${cp.card.label}. (palo no activo).`);
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
    state.log.push(`🃏 Sale: ${c.label}. Avanza ${LABEL[c.suit]} (${before} → ${state.horses[c.suit].pos}).`);
  } else {
    state.log.push(`🃏 Sale: ${c.label}. (palo no activo).`);
  }

  revealIfNeeded();
  checkWin();
  render();
}

// Render
function escapeHtml(s) {
  return s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

function render() {
  if (!state) {
    elBoard.innerHTML = "";
    elLast.textContent = "—";
    elWinner.textContent = "—";
    elRemaining.textContent = "—";
    elLastFace.textContent = "—";
    elLog.textContent = "— Inicia un juego —";
    updateButtons();
    return;
  }

  const grid = document.createElement("div");
  grid.className = "boardGrid";
  grid.style.gridTemplateColumns = `120px repeat(${state.players.length}, 1fr)`;

  // Header
  const headerLeft = document.createElement("div");
  headerLeft.className = "hcell";
  headerLeft.textContent = "Cartas";
  grid.appendChild(headerLeft);

  for (const s of state.players) {
    const h = document.createElement("div");
    h.className = "hcell";
    h.textContent = `${EMOJI[s]} ${LABEL[s]}`;
    grid.appendChild(h);
  }

  // Rows 7..0
  for (let row = TRACK_LEN; row >= 0; row--) {
    const left = document.createElement("div");
    left.className = "bcell";

    if (row === 0) {
      left.textContent = "Salida";
    } else {
      const cp = state.checkpoints[row - 1];
      const card = document.createElement("div");
      card.className = `cpCard ${cp.revealed ? "revealed" : "hidden"}`;
      card.textContent = cp.revealed ? cp.card.label : `Carta ${row}`;
      left.appendChild(card);
    }
    grid.appendChild(left);

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
  elRemaining.textContent = String(state.deck.length);
  elLastFace.textContent = state.last ? state.last.label : "—";

  elLog.innerHTML = state.log.slice().reverse().map(x => `<div>${escapeHtml(x)}</div>`).join("");

  updateButtons();
}

// Events
btnStart.addEventListener("click", () => initGame(Number(elPlayers.value)));
btnReset.addEventListener("click", () => { stopAuto(); state = null; render(); });
btnDraw.addEventListener("click", () => drawCard());
btnAuto.addEventListener("click", () => startAuto());
btnStop.addEventListener("click", () => stopAuto());

// initial
render();