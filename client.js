const socket = io();

const matrix = document.querySelector("#slot-matrix");
const selectionText = document.querySelector("#selection-text");
const scheduleButton = document.querySelector("#schedule-button");
const statusMessage = document.querySelector("#status-message");
const countdownValue = document.querySelector("#countdown-value");
const connectionState = document.querySelector("#connection-state");
const scheduledList = document.querySelector("#scheduled-list");
const queryLog = document.querySelector("#query-log");

const QUERY_LOG_LIMIT = 30;
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

  renderScheduledList(state);
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
    const item = document.createElement("li");
    item.className = "scheduled-item";

    const label = document.createElement("span");
    label.textContent = `${slot.day} at ${slot.time}`;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => socket.emit("slot:remove", slot.id));

    item.append(label, removeButton);
    scheduledList.append(item);
  }
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

socket.on("board:update", renderBoard);
socket.on("query:log", appendQueryLog);
socket.on("query:log:init", (entries) => entries.forEach(appendQueryLog));

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
setInterval(updateCountdown, 100);