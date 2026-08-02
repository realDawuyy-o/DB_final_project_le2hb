const socket = io();

const matrix = document.querySelector("#slot-matrix");
const selectionText = document.querySelector("#selection-text");
const scheduleButton = document.querySelector("#schedule-button");
const statusMessage = document.querySelector("#status-message");
const countdownValue = document.querySelector("#countdown-value");
const connectionState = document.querySelector("#connection-state");
const scheduledList = document.querySelector("#scheduled-list");
const queryLog = document.querySelector("#query-log");
const dayTabs = document.querySelector("#day-tabs");
const menuStatus = document.querySelector("#menu-status");
const menuOrderContainer = document.querySelector("#menu-order-container");
const returnToMenuButton = document.querySelector("#return-to-menu-button");

const QUERY_LOG_LIMIT = 30;
let activeOrderSlotId = null; // scheduled slot currently open in the menu panel
let activeDay = null;
let menuView = "browse"; // "browse" | "order" | "details"
let boardState = null;

function renderBoard(state) {
  boardState = state;
  matrix.style.setProperty("--day-count", state.days.length);
  matrix.replaceChildren();

  const corner = document.createElement("div");
  corner.className = "matrix-corner";
  corner.textContent = "Time";
  matrix.append(corner);

  for (const day of state.days) {
    const heading = document.createElement("div");
    heading.className = "day-heading";
    heading.textContent = day;
    matrix.append(heading);
  }

  for (const time of state.times) {
    const timeLabel = document.createElement("div");
    timeLabel.className = "time-label";
    timeLabel.textContent = time;
    matrix.append(timeLabel);

    for (const day of state.days) {
      const slot = state.slots.find((item) => item.day === day && item.time === time);
      const button = document.createElement("button");
      const isSelected = slot.id === state.selectedSlotId;
      button.className = `slot ${slot.state}${isSelected ? " selected" : ""}`;
      button.type = "button";
      button.disabled = slot.state !== "available" || isSelected;
      button.dataset.slotId = slot.id;
      button.setAttribute(
        "aria-label",
        `${day} at ${time}: ${isSelected ? "selected" : slot.state}`
      );
      button.textContent = isSelected ? "Held" : slot.state === "available" ? "Open" : slot.state;
      button.addEventListener("click", () => socket.emit("slot:select", slot.id));
      matrix.append(button);
    }
  }

  const selectedSlot = state.slots.find((slot) => slot.id === state.selectedSlotId);
  selectionText.textContent = selectedSlot
    ? `${selectedSlot.day} at ${selectedSlot.time} is held for you`
    : "No slot selected";
  scheduleButton.disabled = !selectedSlot;
  statusMessage.textContent = state.message.text;
  statusMessage.dataset.type = state.message.type;

  if (!activeDay) {
    activeDay = state.days[0];
  }

  if (activeOrderSlotId && !state.slots.some((slot) => slot.id === activeOrderSlotId && slot.state === "scheduled")) {
    activeOrderSlotId = null;
    menuView = "browse";
  }

  renderScheduledList(state);
  renderMenuPanel(state);
}

function renderScheduledList(state) {
  const scheduledSlots = state.slots.filter((slot) => slot.state === "scheduled");
  scheduledList.replaceChildren();

  if (scheduledSlots.length === 0) {
    const empty = document.createElement("li");
    empty.className = "scheduled-empty";
    empty.textContent = "No slots scheduled yet.";
    scheduledList.append(empty);
    return;
  }

  for (const slot of scheduledSlots) {
    const order = (state.orders && state.orders[slot.id]) || null;
    const isPaid = Boolean(order && order.paid);

    const item = document.createElement("li");
    item.className = `scheduled-item${slot.id === activeOrderSlotId ? " is-active" : ""}`;

    const row = document.createElement("div");
    row.className = "scheduled-row";

    const label = document.createElement("span");
    label.className = "scheduled-label";
    if (isPaid) {
      const icon = document.createElement("span");
      icon.className = "paid-icon";
      icon.textContent = "\u{1F4B0}";
      icon.setAttribute("aria-label", "Paid");
      label.append(icon);
    }
    label.append(document.createTextNode(`${slot.day} at ${slot.time}`));

    const actions = document.createElement("div");
    actions.className = "scheduled-actions";

    // Paid slots get a read-only receipt + cancel; unpaid ones get the editable order view.
    if (isPaid) {
      const detailsButton = document.createElement("button");
      detailsButton.type = "button";
      detailsButton.className = "menu-toggle-button";
      const isViewingDetails = slot.id === activeOrderSlotId && menuView === "details";
      detailsButton.textContent = isViewingDetails ? "Viewing" : "Details";
      detailsButton.addEventListener("click", () => {
        if (isViewingDetails) {
          activeOrderSlotId = null;
          menuView = "browse";
        } else {
          activeOrderSlotId = slot.id;
          activeDay = slot.day;
          menuView = "details";
        }
        renderScheduledList(boardState);
        renderMenuPanel(boardState);
      });

      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "remove-button";
      cancelButton.textContent = "Cancel";
      cancelButton.addEventListener("click", () => socket.emit("slot:remove", slot.id));

      actions.append(detailsButton, cancelButton);
    } else {
      const menuButton = document.createElement("button");
      menuButton.type = "button";
      menuButton.className = "menu-toggle-button";
      const isViewing = slot.id === activeOrderSlotId && menuView === "order";
      menuButton.textContent = isViewing ? "Viewing" : "Order";
      menuButton.addEventListener("click", () => {
        if (isViewing) {
          activeOrderSlotId = null;
          menuView = "browse";
        } else {
          activeOrderSlotId = slot.id;
          activeDay = slot.day;
          menuView = "order";
        }
        renderScheduledList(boardState);
        renderMenuPanel(boardState);
      });

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "remove-button";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", () => socket.emit("slot:remove", slot.id));

      actions.append(menuButton, removeButton);
    }

    row.append(label, actions);
    item.append(row);
    scheduledList.append(item);
  }
}

function renderDayTabs(state) {
  dayTabs.replaceChildren();

  for (const day of state.days) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `day-tab${day === activeDay ? " is-active" : ""}`;
    tab.textContent = day;
    tab.addEventListener("click", () => {
      activeDay = day;
      renderScheduledList(boardState);
      renderMenuPanel(boardState);
    });
    dayTabs.append(tab);
  }
}

function renderMenuPanel(state) {
  const activeSlot = state.slots.find(
    (slot) => slot.id === activeOrderSlotId && slot.state === "scheduled"
  );

  menuOrderContainer.replaceChildren();

  // Editable checklist + pay button for an unpaid order.
  if (menuView === "order" && activeSlot) {
    dayTabs.hidden = true;
    returnToMenuButton.hidden = false;
    menuStatus.textContent = `Ordering for ${activeSlot.day} at ${activeSlot.time}`;
    menuOrderContainer.append(renderOrderPanel(state, activeSlot));
    return;
  }

  // Read-only receipt for an order that has already been paid.
  if (menuView === "details" && activeSlot) {
    dayTabs.hidden = true;
    returnToMenuButton.hidden = false;
    menuStatus.textContent = `Receipt for ${activeSlot.day} at ${activeSlot.time}`;
    menuOrderContainer.append(renderReceiptPanel(state, activeSlot));
    return;
  }

  // Default view: day tabs + a preview of that day's menu.
  menuView = "browse";
  dayTabs.hidden = false;
  returnToMenuButton.hidden = true;
  renderDayTabs(state);
  menuStatus.textContent = `Previewing ${activeDay}'s menu -- select a scheduled ${activeDay} slot to order.`;
  menuOrderContainer.append(renderMenuPreview(state, activeDay));
}

function renderMenuPreview(state, day) {
  const menu = (state.menu && state.menu[day]) || [];
  const list = document.createElement("ul");
  list.className = "order-checklist menu-preview";

  for (const dish of menu) {
    const row = document.createElement("li");
    row.className = "order-row";

    const dishName = document.createElement("span");
    dishName.className = "dish-name";
    dishName.textContent = dish.name;

    const dishPrice = document.createElement("span");
    dishPrice.className = "dish-price";
    dishPrice.textContent = `$${dish.price.toFixed(2)}`;

    row.append(dishName, dishPrice);
    list.append(row);
  }

  return list;
}

function renderOrderPanel(state, slot) {
  const panel = document.createElement("div");
  panel.className = "order-panel";

  const menu = (state.menu && state.menu[slot.day]) || [];
  const order = (state.orders && state.orders[slot.id]) || { items: {}, total: 0 };

  const checklist = document.createElement("ul");
  checklist.className = "order-checklist";

  for (const dish of menu) {
    const quantity = order.items[dish.id] || 0;
    const row = document.createElement("li");
    row.className = "order-row";

    const checkboxLabel = document.createElement("label");
    checkboxLabel.className = "order-check-label";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = quantity > 0;
    checkbox.addEventListener("change", () => {
      const nextQuantity = checkbox.checked ? 1 : 0;
      socket.emit("order:set", { slotId: slot.id, dishId: dish.id, quantity: nextQuantity });
    });

    const dishName = document.createElement("span");
    dishName.className = "dish-name";
    dishName.textContent = dish.name;

    const dishPrice = document.createElement("span");
    dishPrice.className = "dish-price";
    dishPrice.textContent = `$${dish.price.toFixed(2)}`;

    checkboxLabel.append(checkbox, dishName, dishPrice);

    const stepper = document.createElement("div");
    stepper.className = "quantity-stepper";

    const decreaseButton = document.createElement("button");
    decreaseButton.type = "button";
    decreaseButton.className = "stepper-button";
    decreaseButton.textContent = "-";
    decreaseButton.addEventListener("click", () => {
      const nextQuantity = Math.max(0, quantity - 1);
      socket.emit("order:set", { slotId: slot.id, dishId: dish.id, quantity: nextQuantity });
    });

    const quantityValue = document.createElement("span");
    quantityValue.className = "quantity-value";
    quantityValue.textContent = quantity;

    const increaseButton = document.createElement("button");
    increaseButton.type = "button";
    increaseButton.className = "stepper-button";
    increaseButton.textContent = "+";
    increaseButton.addEventListener("click", () => {
      const nextQuantity = Math.min(9, quantity + 1);
      socket.emit("order:set", { slotId: slot.id, dishId: dish.id, quantity: nextQuantity });
    });

    stepper.addEventListener("wheel", (event) => {
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      const nextQuantity = Math.max(0, Math.min(9, quantity + direction));
      socket.emit("order:set", { slotId: slot.id, dishId: dish.id, quantity: nextQuantity });
    });

    stepper.append(decreaseButton, quantityValue, increaseButton);
    row.append(checkboxLabel, stepper);
    checklist.append(row);
  }

  const footer = document.createElement("div");
  footer.className = "order-footer";

  const moneyCounter = document.createElement("span");
  moneyCounter.className = "money-counter";
  moneyCounter.textContent = `Total: $${order.total.toFixed(2)}`;

  const payButton = document.createElement("button");
  payButton.type = "button";
  payButton.className = "pay-button";
  payButton.textContent = "Pay";
  payButton.addEventListener("click", () => socket.emit("order:pay", { slotId: slot.id }));

  footer.append(moneyCounter, payButton);
  panel.append(checklist, footer);

  return panel;
}

function renderReceiptPanel(state, slot) {
  const panel = document.createElement("div");
  panel.className = "order-panel receipt-panel";

  const menu = (state.menu && state.menu[slot.day]) || [];
  const order = (state.orders && state.orders[slot.id]) || { items: {}, total: 0 };

  const checklist = document.createElement("ul");
  checklist.className = "order-checklist";

  const orderedDishes = menu.filter((dish) => (order.items[dish.id] || 0) > 0);

  if (orderedDishes.length === 0) {
    const empty = document.createElement("li");
    empty.className = "receipt-empty";
    empty.textContent = "No items were ordered.";
    checklist.append(empty);
  }

  for (const dish of orderedDishes) {
    const quantity = order.items[dish.id];
    const row = document.createElement("li");
    row.className = "order-row receipt-row";

    const dishName = document.createElement("span");
    dishName.className = "dish-name";
    dishName.textContent = `${quantity} \u00d7 ${dish.name}`;

    const dishPrice = document.createElement("span");
    dishPrice.className = "dish-price";
    dishPrice.textContent = `$${(dish.price * quantity).toFixed(2)}`;

    row.append(dishName, dishPrice);
    checklist.append(row);
  }

  const footer = document.createElement("div");
  footer.className = "order-footer";

  const moneyCounter = document.createElement("span");
  moneyCounter.className = "money-counter";
  moneyCounter.textContent = `Total paid: $${order.total.toFixed(2)}`;

  const paidBadge = document.createElement("span");
  paidBadge.className = "paid-badge";
  paidBadge.textContent = "\u{1F4B0} Paid";

  footer.append(moneyCounter, paidBadge);
  panel.append(checklist, footer);

  return panel;
}

function appendQueryLog(entry) {
  const item = document.createElement("li");
  const time = new Date(entry.timestamp).toLocaleTimeString();

  const timeEl = document.createElement("span");
  timeEl.className = "query-time";
  timeEl.textContent = time;

  const sqlEl = document.createElement("code");
  sqlEl.textContent = entry.sql;

  item.append(timeEl, sqlEl);
  queryLog.prepend(item);

  while (queryLog.children.length > QUERY_LOG_LIMIT) {
    queryLog.lastElementChild.remove();
  }
}

function updateCountdown() {
  if (!boardState) {
    return;
  }

  const remaining = Math.max(0, boardState.nextUpdateAt - Date.now());
  countdownValue.textContent = `${(remaining / 1000).toFixed(1)}s`;
}

function showToast(text) {
  const toast = document.createElement("div");
  toast.className = "payment-toast";
  toast.textContent = text;
  document.body.append(toast);
  setTimeout(() => toast.classList.add("is-visible"), 10);
  setTimeout(() => {
    toast.classList.remove("is-visible");
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

function showPaymentToast({ day, time, total }) {
  showToast(`Payment successful! $${total.toFixed(2)} charged for ${day} at ${time}.`);
}

function showRefundToast({ day, time, total }) {
  showToast(`Cancelled and refunded $${total.toFixed(2)} for ${day} at ${time}.`);
}

socket.on("board:update", renderBoard);
socket.on("query:log", appendQueryLog);
socket.on("query:log:init", (entries) => entries.forEach(appendQueryLog));
socket.on("order:paid", showPaymentToast);
socket.on("order:refunded", showRefundToast);

socket.on("connect", () => {
  connectionState.textContent = "Live";
  connectionState.classList.add("is-live");
});

socket.on("disconnect", () => {
  connectionState.textContent = "Reconnecting";
  connectionState.classList.remove("is-live");
  statusMessage.textContent = "The board connection paused. Reconnecting...";
});

scheduleButton.addEventListener("click", () => socket.emit("slot:schedule"));
returnToMenuButton.addEventListener("click", () => {
  activeOrderSlotId = null;
  menuView = "browse";
  renderScheduledList(boardState);
  renderMenuPanel(boardState);
});
setInterval(updateCountdown, 100);