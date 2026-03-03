// Carrera de Caballos - Baraja Española
// Modelo de datos: Card, Deck, Horse, Checkpoint, GameState
// Estructuras: arrays/objetos; Operadores: +, -, Math.max, ===, every(); Restricciones: posiciones 0..7, jugadores 2..4, reveal único.

const SUITS = ["oros", "copas", "espadas", "bastos"];
const SUIT_LABEL = { oros: "Oros", copas: "Copas", espadas: "Espadas", bastos: "Bastos" };
const SUIT_EMOJI = { oros: "🟡", copas: "🍷", espadas: "⚔️", bastos: "🪵" };

const TRACK_LEN = 7;     // meta
const CHECKPOINTS = 7;   // 7 cartas verticales

/** @typedef {"oros"|"copas"|"espadas"|"bastos"} Suit */

/** @typedef {{suit: Suit, value: number, label: string}} Card */

function makeSpanishDeckWithoutHorses() {
  // Baraja española (40): valores 1-7,10-12. Excluye 8 y 9.
  // Quitamos los caballos (valor 11) para que queden fuera como "fichas" de jugadores.
  /** @type {Card[]} */
  const cards = [];
  const values = [1,2,3,4,5,6,7,10,12]; // 11 excluido (caballo), 8-9 excluidos
  for (const suit of SUITS) {
    for (const v of values) {
      const label = `${v} de ${SUIT_LABEL[suit]}`;
      cards.push({ suit, value: v, label });
    }
  }
  return cards; // 36 cartas
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/** @typedef {{cards: Card[]}} Deck */
function makeDeck() {
  const cards = makeSpanishDeckWithoutHorses();
  shuffleInPlace(cards);
  return { cards };
}

function draw(deck) {
  return deck.cards.length ? deck.cards.pop() : null;
}

/** @typedef {{suit: Suit, name: string, position: number}} Horse */
/** @typedef {{index: number, hiddenCard: Card, revealed: boolean}} Checkpoint */
/** @typedef {{
 *  players: Suit[],
 *  horses: Record<Suit, Horse>,
 *  deck: Deck,
 *  checkpoints: Checkpoint[],
 *  lastDrawn: Card|null,
 *  winner: Suit|null,
 *  log: string[]
 * }} GameState
 */

function makeGameState(numPlayers) {
  if (![2,3,4].includes(numPlayers)) throw new Error("Número de jugadores inválido (2 a 4).");

  const players = SUITS.slice(0, numPlayers); // regla: usamos N caballos
  const deck = makeDeck();

  /** @type {Record<Suit, Horse>} */
  const horses = {
    oros:   { suit: "oros",   name: "Caballo de Oros",   position: 0 },
    copas:  { suit: "copas",  name: "Caballo de Copas",  position: 0 },
    espadas:{ suit: "espadas",name: "Caballo de Espadas",position: 0 },
    bastos: { suit: "bastos", name: "Caballo de Bastos", position: 0 },
  };

  // Generar 7 cartas checkpoint desde el mazo
  /** @type {Checkpoint[]} */
  const checkpoints = [];
  for (let i = 1; i <= CHECKPOINTS; i++) {
    const c = draw(deck);
    if (!c) throw new Error("Mazo insuficiente para checkpoints.");
    checkpoints.push({ index: i, hiddenCard: c, revealed: false });
  }

  return {
    players,
    horses,
    deck,
    checkpoints,
    lastDrawn: null,
    winner: null,
    log: [`Juego iniciado con ${numPlayers} jugador(es): ${players.map(p=>SUIT_LABEL[p]).join(", ")}.`],
  };
}

function allPassed(state, checkpointIndex) {
  // Todos los caballos activos están al menos en esa casilla
  return state.players.every(s => state.horses[s].position >= checkpointIndex);
}

function revealIfNeeded(state) {
  // Revela secuencialmente: el primer checkpoint no revelado cuyo índice ya fue pasado por todos
  for (const cp of state.checkpoints) {
    if (!cp.revealed && allPassed(state, cp.index)) {
      cp.revealed = true;

      const suit = cp.hiddenCard.suit;
      if (state.players.includes(suit)) {
        const h = state.horses[suit];
        const before = h.position;
        h.position = Math.max(0, h.position - 1); // restricción: no bajar de 0
        state.log.push(
          `📌 Se revela checkpoint ${cp.index}: ${cp.hiddenCard.label}. ` +
          `${SUIT_LABEL[suit]} retrocede 1 (${before} → ${h.position}).`
        );
      } else {
        state.log.push(`📌 Se revela checkpoint ${cp.index}: ${cp.hiddenCard.label}. (Palo no activo, sin retroceso)`);
      }
    }
  }
}

function tryWin(state) {
  for (const s of state.players) {
    if (state.horses[s].position >= TRACK_LEN) {
      state.winner = s;
      state.log.push(`🏁 ¡${SUIT_LABEL[s]} gana la carrera!`);
      return true;
    }
  }
  return false;
}

function stepDraw(state) {
  if (state.winner) return;
  const card = draw(state.deck);
  state.lastDrawn = card;

  if (!card) {
    state.log.push("🧯 El mazo se acabó. Fin sin ganador (raro, pero posible).");
    state.winner = state.winner ?? null;
    return;
  }

  if (state.players.includes(card.suit)) {
    const h = state.horses[card.suit];
    const before = h.position;
    h.position += 1;
    state.log.push(`🃏 Sale: ${card.label}. Avanza ${SUIT_LABEL[card.suit]} (${before} → ${h.position}).`);
  } else {
    state.log.push(`🃏 Sale: ${card.label}. (Palo no activo, se ignora)`);
  }

  // Después de mover, verificar revelados y victoria
  revealIfNeeded(state);
  tryWin(state);
}

/* ---------------- UI ---------------- */

const elPlayers = document.getElementById("playersSelect");
const btnStart  = document.getElementById("btnStart");
const btnReset  = document.getElementById("btnReset");
const btnDraw   = document.getElementById("btnDraw");
const btnAuto   = document.getElementById("btnAuto");
const btnStop   = document.getElementById("btnStop");

const elTrack   = document.getElementById("track");
const elCP      = document.getElementById("checkpoints");
const elLog     = document.getElementById("log");

const elLast    = document.getElementById("lastCard");
const elWinner  = document.getElementById("winner");
const elRemain  = document.getElementById("remaining");

let state = null;
/** @type {number|null} */
let autoTimer = null;

function render() {
  if (!state) {
    elTrack.innerHTML = "";
    elCP.innerHTML = "";
    elLog.innerHTML = `<p class="logLine">— Inicia un juego —</p>`;
    elLast.textContent = "—";
    elWinner.textContent = "—";
    elRemain.textContent = "—";
    return;
  }

  // Track
  const cols = [];
  for (let i = 0; i <= TRACK_LEN; i++) cols.push(i);
  elTrack.innerHTML = "";

  for (const s of state.players) {
    const row = document.createElement("div");
    row.className = "trackRow";

    const tag = document.createElement("div");
    tag.className = "tag";
    tag.textContent = `${SUIT_EMOJI[s]} ${SUIT_LABEL[s]}`;
    row.appendChild(tag);

    for (let i = 0; i <= TRACK_LEN; i++) {
      const cell = document.createElement("div");
      cell.className = "cell" + (i === TRACK_LEN ? " goal" : "");
      if (state.horses[s].position === i) cell.innerHTML = `<span class="pawn">🐎</span>`;
      row.appendChild(cell);
    }
    elTrack.appendChild(row);
  }

  // Checkpoints
  elCP.innerHTML = "";
  for (const cp of state.checkpoints) {
    const div = document.createElement("div");
    div.className = "cp" + (cp.revealed ? " revealed" : "");
    div.innerHTML = `
      <div class="idx">Checkpoint ${cp.index}</div>
      <div class="val">${cp.revealed ? cp.hiddenCard.label : "🂠 (oculta)"}</div>
    `;
    elCP.appendChild(div);
  }

  // Status
  elLast.textContent = state.lastDrawn ? state.lastDrawn.label : "—";
  elWinner.textContent = state.winner ? `${SUIT_LABEL[state.winner]} ${SUIT_EMOJI[state.winner]}` : "—";
  elRemain.textContent = String(state.deck.cards.length);

  // Log
  elLog.innerHTML = state.log.slice().reverse().map(line => `<p class="logLine">${escapeHtml(line)}</p>`).join("");
}

function escapeHtml(str) {
  return str.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function setControlsRunning(running) {
  btnDraw.disabled = !state || !!state.winner;
  btnAuto.disabled = !state || !!state.winner || running;
  btnStop.disabled = !state || !running;
}

btnStart.addEventListener("click", () => {
  stopAuto();
  const n = Number(elPlayers.value);
  state = makeGameState(n);
  setControlsRunning(false);
  render();
});

btnReset.addEventListener("click", () => {
  stopAuto();
  state = null;
  setControlsRunning(false);
  render();
});

btnDraw.addEventListener("click", () => {
  if (!state || state.winner) return;
  stepDraw(state);
  setControlsRunning(false);
  render();
});

btnAuto.addEventListener("click", () => {
  if (!state || state.winner) return;
  startAuto();
});

btnStop.addEventListener("click", () => stopAuto());

function startAuto() {
  stopAuto();
  setControlsRunning(true);
  autoTimer = window.setInterval(() => {
    if (!state || state.winner) {
      stopAuto();
      render();
      return;
    }
    stepDraw(state);
    render();
    if (state.winner) stopAuto();
  }, 450);
}

function stopAuto() {
  if (autoTimer !== null) window.clearInterval(autoTimer);
  autoTimer = null;
  setControlsRunning(false);
}

render();