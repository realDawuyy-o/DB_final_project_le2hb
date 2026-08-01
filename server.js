const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

// intialize the server and socket.io, we will bne using all days in the week and these 
// timeframes below to make schedule matrix
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

// Fixed menu per day of the week -- shown as a checklist next to each scheduled slot.
const MENU_BY_DAY = {
  Mon: [
    { id: "mon-pizza", name: "Margherita Pizza", price: 12 },
    { id: "mon-salad", name: "Caesar Salad", price: 8 },
    { id: "mon-chicken", name: "Grilled Chicken", price: 14 },
    { id: "mon-tiramisu", name: "Tiramisu", price: 6 }
  ],
  Tue: [
    { id: "tue-tacos", name: "Beef Tacos", price: 11 },
    { id: "tue-stirfry", name: "Veggie Stir Fry", price: 10 },
    { id: "tue-miso", name: "Miso Soup", price: 5 },
    { id: "tue-sorbet", name: "Mango Sorbet", price: 6 }
  ],
  Wed: [
    { id: "wed-carbonara", name: "Spaghetti Carbonara", price: 13 },
    { id: "wed-garlic-bread", name: "Garlic Bread", price: 4 },
    { id: "wed-minestrone", name: "Minestrone Soup", price: 7 },
    { id: "wed-pannacotta", name: "Panna Cotta", price: 6 }
  ],
  Thu: [
    { id: "thu-ribs", name: "BBQ Ribs", price: 16 },
    { id: "thu-cornbread", name: "Cornbread", price: 5 },
    { id: "thu-coleslaw", name: "Coleslaw", price: 4 },
    { id: "thu-applepie", name: "Apple Pie", price: 6 }
  ],
  Fri: [
    { id: "fri-fishchips", name: "Fish and Chips", price: 13 },
    { id: "fri-chowder", name: "Clam Chowder", price: 7 },
    { id: "fri-sidesalad", name: "Side Salad", price: 4 },
    { id: "fri-keylime", name: "Key Lime Pie", price: 6 }
  ],
  Sat: [
    { id: "sat-sushi", name: "Sushi Platter", price: 18 },
    { id: "sat-edamame", name: "Edamame", price: 5 },
    { id: "sat-ramen", name: "Miso Ramen", price: 12 },
    { id: "sat-mochi", name: "Mochi Ice Cream", price: 5 }
  ],
  Sun: [
    { id: "sun-roast", name: "Sunday Roast", price: 17 },
    { id: "sun-yorkshire", name: "Yorkshire Pudding", price: 4 },
    { id: "sun-veg", name: "Roasted Vegetables", price: 5 },
    { id: "sun-pudding", name: "Sticky Toffee Pudding", price: 6 }
  ]
};

// slotId -> { items: { dishId: quantity }, total }
const orders = {};

const QUERY_LOG_LIMIT = 30;
const queryLog = [];

function findSlot(slotId) {
  return slots.find((slot) => slot.id === slotId);
}

function getOrder(slotId) {
  if (!orders[slotId]) {
    orders[slotId] = { items: {}, total: 0 };
  }
  return orders[slotId];
}

function recalcOrderTotal(slotId, day) {
  const order = getOrder(slotId);
  const menu = MENU_BY_DAY[day] || [];
  order.total = menu.reduce((sum, dish) => sum + (order.items[dish.id] || 0) * dish.price, 0);
  return order.total;
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

function buildStatePayload() {
  return {
    days,
    times,
    slots,
    selectedSlotId,
    nextUpdateAt: Date.now() + UPDATE_INTERVAL_MS,
    message: latestMessage,
    menu: MENU_BY_DAY,
    orders
  };
}

function broadcastState() {
  io.emit("board:update", buildStatePayload());
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
  socket.emit("board:update", buildStatePayload());
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
    delete orders[slot.id];
    latestMessage = {
      type: "info",
      text: `${slot.day} at ${slot.time} was removed and is open again.`
    };
    logQuery(`UPDATE slots SET state = 'available' WHERE id = '${slot.id}';`);
    logQuery(`DELETE FROM order_items WHERE slot_id = '${slot.id}';`);
    broadcastState();
  });

  socket.on("order:set", ({ slotId, dishId, quantity } = {}) => {
    const slot = findSlot(slotId);

    if (!slot || slot.state !== "scheduled") {
      return;
    }

    const menu = MENU_BY_DAY[slot.day] || [];
    const dish = menu.find((item) => item.id === dishId);

    if (!dish) {
      return;
    }

    const safeQuantity = Math.max(0, Math.min(9, Math.round(Number(quantity)) || 0));
    const order = getOrder(slotId);

    if (safeQuantity <= 0) {
      delete order.items[dishId];
    } else {
      order.items[dishId] = safeQuantity;
    }

    recalcOrderTotal(slotId, slot.day);
    logQuery(
      `UPDATE order_items SET quantity = ${safeQuantity} WHERE slot_id = '${slotId}' AND dish_id = '${dishId}';`
    );
    broadcastState();
  });

  socket.on("order:pay", ({ slotId } = {}) => {
    const slot = findSlot(slotId);

    if (!slot) {
      return;
    }

    const total = recalcOrderTotal(slotId, slot.day);
    logQuery(`INSERT INTO payments (slot_id, amount) VALUES ('${slotId}', ${total.toFixed(2)});`);
    io.emit("order:paid", { slotId, day: slot.day, time: slot.time, total });
  });
});

setInterval(randomizeBoard, UPDATE_INTERVAL_MS);

server.listen(PORT, () => {
  console.log(`Slot Sprint is running at http://localhost:${PORT}`);
});