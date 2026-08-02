const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const { db, initSchema } = require("./db.js");

// Server + socket.io setup. Days/times below define the schedule matrix grid
// and must match the CHECK constraints in setup.sql.
const PORT = Number(process.env.PORT || 8080);
const UPDATE_INTERVAL_MS = 2000;
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const times = ["12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Rebuild the database schema fresh from setup.sql every time the server boots.
initSchema();

app.use(express.static(path.join(__dirname)));

let latestMessage = {
  type: "info",
  text: "Choose an open time tile before the board shifts."
};

const QUERY_LOG_LIMIT = 30;
const queryLog = [];

function logQuery(sql, params = []) {
  let display = sql;
  for (const param of params) {
    display = display.replace("?", typeof param === "string" ? `'${param}'` : String(param));
  }
  const entry = { sql: display, timestamp: Date.now() };
  queryLog.push(entry);
  if (queryLog.length > QUERY_LOG_LIMIT) {
    queryLog.shift();
  }
  io.emit("query:log", entry);
}

function getAppState(key) {
  const row = db.prepare("SELECT value FROM app_state WHERE key = ?").get(key);
  return row ? row.value : null;
}

function setAppState(key, value) {
  const sql = "INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value";
  db.prepare(sql).run(key, value);
  logQuery(sql, [key, value]);
}

function findSlot(slotId) {
  return db.prepare("SELECT * FROM slots WHERE id = ?").get(slotId) || null;
}

function getSlots() {
  return db.prepare("SELECT id, day, time, state FROM slots").all();
}

function getMenuByDay() {
  const rows = db.prepare("SELECT id, day, name, price FROM menu_items ORDER BY day, rowid").all();
  const menu = {};
  for (const day of days) {
    menu[day] = [];
  }
  for (const row of rows) {
    menu[row.day].push({ id: row.id, name: row.name, price: row.price });
  }
  return menu;
}

function calcOrderTotal(slotId) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(oi.quantity * mi.price), 0) AS total
       FROM order_items oi
       JOIN menu_items mi ON mi.id = oi.dish_id
       WHERE oi.slot_id = ?`
    )
    .get(slotId);
  return row.total;
}

function getOrders() {
  const rows = db.prepare("SELECT slot_id, dish_id, quantity FROM order_items").all();
  const orders = {};
  for (const row of rows) {
    if (!orders[row.slot_id]) {
      orders[row.slot_id] = { items: {}, total: 0 };
    }
    orders[row.slot_id].items[row.dish_id] = row.quantity;
  }
  for (const slotId of Object.keys(orders)) {
    orders[slotId].total = calcOrderTotal(slotId);
  }
  return orders;
}

function buildStatePayload() {
  return {
    days,
    times,
    slots: getSlots(),
    selectedSlotId: getAppState("selected_slot_id"),
    nextUpdateAt: Date.now() + UPDATE_INTERVAL_MS,
    message: latestMessage,
    menu: getMenuByDay(),
    orders: getOrders()
  };
}

function broadcastState() {
  io.emit("board:update", buildStatePayload());
}

function randomizeBoard() {
  const selectedSlotId = getAppState("selected_slot_id");
  const sql = `UPDATE slots
               SET state = (CASE WHEN ABS(RANDOM()) % 100 < 58 THEN 'available' ELSE 'unavailable' END)
               WHERE state != 'scheduled' AND id != ?`;
  // Not logged to the query panel -- this fires every 2s and would drown
  // out the queries triggered by actual player actions.
  db.prepare(sql).run(selectedSlotId || "");

  latestMessage = {
    type: "info",
    text: selectedSlotId
      ? "Your selected tile is protected. Schedule it before you change your mind."
      : "The board shifted. Find an open tile and claim it."
  };
  broadcastState();
}

io.on("connection", (socket) => {
  socket.emit("board:update", buildStatePayload());
  socket.emit("query:log:init", queryLog);

  socket.on("slot:select", (slotId) => {
    const slot = findSlot(slotId);

    if (!slot || slot.state !== "available") {
      latestMessage = { type: "error", text: "That tile is not open. Pick another one." };
      broadcastState();
      return;
    }

    setAppState("selected_slot_id", slotId);
    latestMessage = {
      type: "success",
      text: `${slot.day} at ${slot.time} is protected. Press Schedule to lock it in.`
    };
    broadcastState();
  });

  socket.on("slot:schedule", () => {
    const selectedSlotId = getAppState("selected_slot_id");
    const slot = selectedSlotId ? findSlot(selectedSlotId) : null;

    if (!slot || slot.state !== "available") {
      setAppState("selected_slot_id", null);
      latestMessage = { type: "error", text: "No open slot is selected. Try again." };
      broadcastState();
      return;
    }

    const sql = "UPDATE slots SET state = 'scheduled' WHERE id = ?";
    db.prepare(sql).run(slot.id);
    logQuery(sql, [slot.id]);
    setAppState("selected_slot_id", null);

    latestMessage = {
      type: "success",
      text: `${slot.day} at ${slot.time} is scheduled. Nice timing.`
    };
    broadcastState();
  });

  socket.on("slot:remove", (slotId) => {
    const slot = findSlot(slotId);

    if (!slot || slot.state !== "scheduled") {
      latestMessage = { type: "error", text: "That slot cannot be removed right now." };
      broadcastState();
      return;
    }

    const updateSql = "UPDATE slots SET state = 'available' WHERE id = ?";
    db.prepare(updateSql).run(slot.id);
    logQuery(updateSql, [slot.id]);

    const deleteSql = "DELETE FROM order_items WHERE slot_id = ?";
    db.prepare(deleteSql).run(slot.id);
    logQuery(deleteSql, [slot.id]);

    latestMessage = {
      type: "info",
      text: `${slot.day} at ${slot.time} was removed and is open again.`
    };
    broadcastState();
  });

  socket.on("order:set", ({ slotId, dishId, quantity } = {}) => {
    const slot = findSlot(slotId);
    if (!slot || slot.state !== "scheduled") {
      return;
    }

    const dish = db.prepare("SELECT id FROM menu_items WHERE id = ? AND day = ?").get(dishId, slot.day);
    if (!dish) {
      return;
    }

    const safeQuantity = Math.max(0, Math.min(9, Math.round(Number(quantity)) || 0));
    if (safeQuantity <= 0) {
      const sql = "DELETE FROM order_items WHERE slot_id = ? AND dish_id = ?";
      db.prepare(sql).run(slotId, dishId);
      logQuery(sql, [slotId, dishId]);
    } else {
      const sql = `INSERT INTO order_items (slot_id, dish_id, quantity) VALUES (?, ?, ?)
                   ON CONFLICT(slot_id, dish_id) DO UPDATE SET quantity = excluded.quantity`;
      db.prepare(sql).run(slotId, dishId, safeQuantity);
      logQuery(sql, [slotId, dishId, safeQuantity]);
    }
    broadcastState();
  });

  socket.on("order:pay", ({ slotId } = {}) => {
    const slot = findSlot(slotId);
    if (!slot || slot.state !== "scheduled") {
      return;
    }

    const total = calcOrderTotal(slotId);
    const sql = "INSERT INTO payments (slot_id, amount) VALUES (?, ?)";
    db.prepare(sql).run(slotId, total);
    logQuery(sql, [slotId, total]);

    io.emit("order:paid", { slotId, day: slot.day, time: slot.time, total });
    broadcastState();
  });
});

// Give the board an initial random shuffle, then keep shuffling every 2s.
randomizeBoard();
setInterval(randomizeBoard, UPDATE_INTERVAL_MS);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Slot Sprint is running at http://localhost:${PORT}`);
});
