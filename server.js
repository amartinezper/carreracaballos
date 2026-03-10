const path = require("node:path");
const crypto = require("node:crypto");
const fs = require("node:fs");
const express = require("express");
const http = require("node:http");
const { Server } = require("socket.io");
const bcrypt = require("bcryptjs");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const PORT = process.env.PORT || 3000;
const SUITS = ["oros", "copas", "espadas", "bastos"];
const LABEL = { oros: "Oros", copas: "Copas", espadas: "Espadas", bastos: "Bastos" };
const TRACK_LEN = 7;

let db;
const sessions = new Map();

const room = {
  players: [],
  game: null,
  autoTimer: null,
};

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function createDeck() {
  const values = [1, 2, 3, 4, 5, 6, 7, 10, 12];
  const deck = [];
  for (const suit of SUITS) {
    for (const value of values) {
      deck.push({ suit, label: `${value} de ${LABEL[suit]}` });
    }
  }
  shuffleInPlace(deck);
  return deck;
}

function stopAuto() {
  if (room.autoTimer) clearInterval(room.autoTimer);
  room.autoTimer = null;
  if (room.game) room.game.auto = false;
}

function allPassed(checkpointIndex) {
  return room.game.players.every((p) => room.game.horses[p.suit].pos >= checkpointIndex);
}

function revealIfNeeded() {
  for (const cp of room.game.checkpoints) {
    if (!cp.revealed && allPassed(cp.index)) {
      cp.revealed = true;
      const suit = cp.card.suit;
      const horse = room.game.horses[suit];
      if (horse) {
        const before = horse.pos;
        horse.pos = Math.max(0, before - 1);
        room.game.log.push(`Se revela ${cp.card.label}. ${LABEL[suit]} retrocede ${before} -> ${horse.pos}.`);
      }
    }
  }
}

async function updateUserPoints(userId, delta) {
  await db.run("UPDATE users SET points = points + ? WHERE id = ?", [delta, userId]);
}

async function getUserById(id) {
  return db.get("SELECT id, username, points FROM users WHERE id = ?", [id]);
}

async function getPlayerView() {
  const views = [];
  for (const p of room.players) {
    const user = await getUserById(p.userId);
    views.push({
      username: p.username,
      suit: p.suit,
      bet: p.bet,
      points: user ? user.points : 0,
      connected: !!p.socketId,
    });
  }
  return views;
}

function gameSnapshot() {
  if (!room.game) return null;
  return {
    players: room.game.players,
    checkpoints: room.game.checkpoints,
    horses: room.game.horses,
    last: room.game.last,
    winner: room.game.winner,
    deckCount: room.game.deck.length,
    log: room.game.log,
    auto: room.game.auto,
  };
}

async function canStart() {
  if (room.game && !room.game.winner) return false;
  if (room.players.length !== 4) return false;
  for (const p of room.players) {
    if (!p.bet || p.bet <= 0) return false;
    const user = await getUserById(p.userId);
    if (!user || user.points < p.bet) return false;
  }
  return true;
}

async function chargeBets() {
  await db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    for (const p of room.players) {
      const user = await getUserById(p.userId);
      if (!user || user.points < p.bet) {
        throw new Error(`Puntos insuficientes para ${p.username}`);
      }
      await db.run("UPDATE users SET points = points - ? WHERE id = ?", [p.bet, p.userId]);
    }
    await db.exec("COMMIT");
    return true;
  } catch (err) {
    await db.exec("ROLLBACK");
    throw err;
  }
}

async function broadcastSnapshot(io) {
  io.emit("snapshot", {
    players: await getPlayerView(),
    canStart: await canStart(),
    game: gameSnapshot(),
  });
}

async function finishGame(io, winnerSuit) {
  if (!winnerSuit) {
    room.game.log.push("Se acabo el mazo sin ganador.");
    stopAuto();
    await broadcastSnapshot(io);
    return;
  }

  const winnerPlayer = room.players.find((p) => p.suit === winnerSuit);
  if (!winnerPlayer) {
    room.game.log.push("La carrera termino sin jugador ganador.");
    stopAuto();
    await broadcastSnapshot(io);
    return;
  }

  const payout = winnerPlayer.bet * 5;
  await updateUserPoints(winnerPlayer.userId, payout);
  const user = await getUserById(winnerPlayer.userId);

  room.game.winner = { username: winnerPlayer.username, suit: winnerSuit, payout };
  room.game.log.push(`Gana ${winnerPlayer.username}. Premio ${payout} puntos (x5 apuesta).`);
  stopAuto();
  io.emit("event", `Ganador: ${winnerPlayer.username}. Premio: ${payout} puntos.`);

  if (user) {
    io.to(winnerPlayer.socketId).emit("event", `Tus puntos actuales: ${user.points}`);
  }

  await broadcastSnapshot(io);
}

async function drawCard(io) {
  if (!room.game || room.game.winner) return;
  const c = room.game.deck.pop();
  if (!c) {
    await finishGame(io, null);
    return;
  }

  room.game.last = c;
  const horse = room.game.horses[c.suit];
  if (horse) {
    const before = horse.pos;
    horse.pos = before + 1;
    room.game.log.push(`Sale ${c.label}. ${LABEL[c.suit]} avanza ${before} -> ${horse.pos}.`);
  } else {
    room.game.log.push(`Sale ${c.label}. Palo fuera de carrera.`);
  }

  revealIfNeeded();

  for (const p of room.game.players) {
    if (room.game.horses[p.suit].pos >= TRACK_LEN) {
      await finishGame(io, p.suit);
      return;
    }
  }

  await broadcastSnapshot(io);
}

async function startGame(io) {
  if (!(await canStart())) return;
  if (room.game && !room.game.winner) return;

  stopAuto();

  try {
    await chargeBets();
  } catch (err) {
    io.emit("event", `No se pudo iniciar la partida: ${err.message}`);
    await broadcastSnapshot(io);
    return;
  }

  const deck = createDeck();
  const checkpoints = [];
  for (let i = 1; i <= 7; i += 1) {
    checkpoints.push({ index: i, card: deck.pop(), revealed: false });
  }

  const gamePlayers = room.players.map((p) => ({ username: p.username, suit: p.suit, bet: p.bet }));
  const horses = {};
  for (const gp of gamePlayers) horses[gp.suit] = { pos: 0 };

  room.game = {
    players: gamePlayers,
    deck,
    checkpoints,
    horses,
    last: null,
    winner: null,
    auto: false,
    log: [
      "Partida iniciada. Se desconto la apuesta a los 4 jugadores.",
      "Regla de pago: ganador recibe apuesta x5.",
    ],
  };

  io.emit("event", "Partida iniciada con 4 jugadores.");
  await broadcastSnapshot(io);
}

async function bootstrap() {
  const sqlitePath = process.env.SQLITE_PATH || path.join(__dirname, "data.sqlite");
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
  db = await open({
    filename: sqlitePath,
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 1000,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);

  app.use(express.json());
  app.use(express.static(__dirname));

  const auth = async (req, res, next) => {
    const raw = req.headers.authorization || "";
    const token = raw.startsWith("Bearer ") ? raw.slice(7) : "";
    const userId = sessions.get(token);
    if (!userId) return res.status(401).json({ error: "No autenticado" });
    const user = await getUserById(userId);
    if (!user) return res.status(401).json({ error: "Sesion invalida" });
    req.user = user;
    return next();
  };

  app.post("/api/register", async (req, res) => {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "").trim();

    if (!username || !password) return res.status(400).json({ error: "Usuario y contrasena obligatorios" });
    if (username.length < 3 || password.length < 4) return res.status(400).json({ error: "Minimo: usuario 3, contrasena 4" });

    const exists = await db.get("SELECT id FROM users WHERE username = ?", [username]);
    if (exists) return res.status(409).json({ error: "Usuario ya existe" });

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await db.run("INSERT INTO users (username, password_hash, points) VALUES (?, ?, 1000)", [username, passwordHash]);
    const user = await getUserById(result.lastID);
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, user.id);

    return res.json({ token, user });
  });

  app.post("/api/login", async (req, res) => {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "").trim();
    const user = await db.get("SELECT id, username, password_hash, points FROM users WHERE username = ?", [username]);

    if (!user) return res.status(401).json({ error: "Credenciales invalidas" });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Credenciales invalidas" });

    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, user.id);

    return res.json({ token, user: { id: user.id, username: user.username, points: user.points } });
  });

  app.get("/api/me", auth, async (req, res) => {
    res.json({ user: req.user });
  });

  app.post("/api/buy-points", auth, async (req, res) => {
    if (req.user.points > 0) return res.status(400).json({ error: "Solo puedes comprar cuando tus puntos llegan a 0" });
    await updateUserPoints(req.user.id, 1000);
    const user = await getUserById(req.user.id);
    io.emit("event", `${user.username} compro 1000 puntos por 10000 pesos (simulado).`);
    await broadcastSnapshot(io);
    return res.json({ points: user.points, message: "Compra simulada: +1000 puntos por 10000 pesos." });
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    const userId = sessions.get(token);
    if (!userId) return next(new Error("No autenticado"));
    const user = await getUserById(userId);
    if (!user) return next(new Error("Sesion invalida"));
    socket.user = user;
    return next();
  });

  io.on("connection", async (socket) => {
    const user = socket.user;

    let p = room.players.find((x) => x.userId === user.id);
    if (!p && room.players.length >= 4) {
      socket.emit("error_message", "La sala ya tiene 4 jugadores conectados.");
      socket.disconnect();
      return;
    }

    if (!p) {
      p = { userId: user.id, username: user.username, suit: SUITS[room.players.length], bet: 0, socketId: socket.id };
      room.players.push(p);
      io.emit("event", `${user.username} entro a la sala (${room.players.length}/4).`);
    } else {
      p.socketId = socket.id;
      io.emit("event", `${user.username} se reconecto.`);
    }

    await broadcastSnapshot(io);

    socket.on("set_bet", async ({ amount }) => {
      const current = room.players.find((x) => x.userId === user.id);
      const bet = Number(amount);
      if (!current) return;
      if (!Number.isInteger(bet) || bet <= 0) {
        socket.emit("error_message", "La apuesta debe ser un numero entero positivo.");
        return;
      }
      current.bet = bet;
      io.emit("event", `${user.username} fijo apuesta en ${bet} puntos.`);
      await broadcastSnapshot(io);
    });

    socket.on("start_game", async () => {
      if (!(await canStart())) {
        socket.emit("error_message", "Se necesitan 4 jugadores con apuesta y puntos suficientes para iniciar.");
        return;
      }
      await startGame(io);
    });

    socket.on("draw_card", async () => {
      await drawCard(io);
    });

    socket.on("auto_start", async () => {
      if (!room.game || room.game.winner) return;
      if (room.autoTimer) return;
      room.game.auto = true;
      room.autoTimer = setInterval(() => {
        drawCard(io).catch(() => {});
      }, 700);
      await broadcastSnapshot(io);
    });

    socket.on("auto_stop", async () => {
      stopAuto();
      await broadcastSnapshot(io);
    });

    socket.on("refresh", async () => {
      await broadcastSnapshot(io);
    });

    socket.on("disconnect", async () => {
      room.players = room.players.filter((x) => x.userId !== user.id);
      if (room.players.length < 4 && room.game && !room.game.winner) {
        stopAuto();
        room.game.log.push("Partida detenida: un jugador se desconecto.");
        room.game.winner = { username: "Sin ganador", suit: "none", payout: 0 };
      }

      for (let i = 0; i < room.players.length; i += 1) {
        room.players[i].suit = SUITS[i];
      }

      io.emit("event", `${user.username} salio de la sala.`);
      await broadcastSnapshot(io);
    });
  });

  server.listen(PORT, () => {
    console.log(`Servidor listo en http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
