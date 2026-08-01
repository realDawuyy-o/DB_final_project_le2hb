const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const PORT = 8080;
const UPDATE_INTERVAL_MS = 2000;
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const times = ["12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

let selectedSlotId = null;
let latestMessage = {
  type: "info",
  text: "Choose an open time tile before the board shifts."
};

const slots = times.flatMap((time) =>
  days.map((day) => ({
    id: `${day}-${time}`,
    day,
    time,
    state: Math.random() > 0.42 ? "available" : "unavailable"
  }))
);

const QUERY_LOG_LIMIT = 30;
const queryLog = [];

function findSlot(slotId) {
  return slots.find((slot) => slot.id === slotId);
}

// Mirrors each action as a SQL-style statement for the on-page query log panel.
function logQuery(sql) {
  const entry = { sql, timestamp: Date.now() };
  queryLog.push(entry);
  if (queryLog.length > QUERY_LOG_LIMIT) {
    queryLog.shift();
  }
  io.emit("query:log", entry);
}

function broadcastState() {
  io.emit("board:update", {
    days,
    times,
    slots,
    selectedSlotId,
    nextUpdateAt: Date.now() + UPDATE_INTERVAL_MS,
    message: latestMessage
  });
}

function randomizeBoard() {
  for (const slot of slots) {
    if (slot.id !== selectedSlotId && slot.state !== "scheduled") {
      slot.state = Math.random() > 0.42 ? "available" : "unavailable";
    }
  }

  latestMessage = {
    type: "info",
    text: selectedSlotId
      ? "Your selected tile is protected. Schedule it before you change your mind."
      : "The board shifted. Find an open tile and claim it."
  };
  logQuery(
    "UPDATE slots SET state = (RANDOM() > 0.42 ? 'available' : 'unavailable') " +
      "WHERE state NOT IN ('selected', 'scheduled');"
  );
  broadcastState();
}

io.on("connection", (socket) => {
  socket.emit("board:update", {
    days,
    times,
    slots,
    selectedSlotId,
    nextUpdateAt: Date.now() + UPDATE_INTERVAL_MS,
    message: latestMessage
  });
  socket.emit("query:log:init", queryLog);

  socket.on("slot:select", (slotId) => {
    const slot = findSlot(slotId);
    logQuery(`SELECT state FROM slots WHERE id = '${slotId}';`);

    if (!slot || slot.state !== "available") {
      latestMessage = { type: "error", text: "That tile is not open. Pick another one." };
      logQuery(`-- rejected: slot '${slotId}' is not available`);
      broadcastState();
      return;
    }

    selectedSlotId = slotId;
    latestMessage = {
      type: "success",
      text: `${slot.day} at ${slot.time} is protected. Press Schedule to lock it in.`
    };
    logQuery(`UPDATE slots SET held_by = 'you' WHERE id = '${slotId}';`);
    broadcastState();
  });

  socket.on("slot:schedule", () => {
    const slot = selectedSlotId ? findSlot(selectedSlotId) : null;

    if (!slot || slot.state !== "available") {
      logQuery("-- rejected: no valid selection to schedule");
      selectedSlotId = null;
      latestMessage = { type: "error", text: "No open slot is selected. Try again." };
      broadcastState();
      return;
    }

    slot.state = "scheduled";
    selectedSlotId = null;
    latestMessage = {
      type: "success",
      text: `${slot.day} at ${slot.time} is scheduled. Nice timing.`
    };
    logQuery(`UPDATE slots SET state = 'scheduled' WHERE id = '${slot.id}';`);
    broadcastState();
  });

  socket.on("slot:remove", (slotId) => {
    const slot = findSlot(slotId);

    if (!slot || slot.state !== "scheduled") {
      latestMessage = { type: "error", text: "That slot cannot be removed right now." };
      logQuery(`-- rejected: slot '${slotId}' is not scheduled`);
      broadcastState();
      return;
    }

    slot.state = "available";
    latestMessage = {
      type: "info",
      text: `${slot.day} at ${slot.time} was removed and is open again.`
    };
    logQuery(`UPDATE slots SET state = 'available' WHERE id = '${slot.id}';`);
    broadcastState();
  });
});

setInterval(randomizeBoard, UPDATE_INTERVAL_MS);

server.listen(PORT, () => {
  console.log(`Slot Sprint is running at http://localhost:${PORT}`);
});