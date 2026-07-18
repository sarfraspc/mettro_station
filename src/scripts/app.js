// ---- DOM ----
const $ = (s) => document.getElementById(s);
const setupScreen   = $("setup-screen");
const focusScreen   = $("focus-screen");
const boardingSelect = $("boarding-select");
const destinationSelect = $("destination-select");
const demoModeCheckbox = $("demo-mode");
const setupStatusText = $("setup-status");
const nextStopText   = $("next-stop");
const stopsRemainingText = $("stops-remaining");
const timeRemainingText = $("time-remaining");
const timingStatusText = $("timing-status");
const endTripBtn = $("end-trip");
const alertOverlay = $("alert-overlay");
const alertMessage = $("alert-message");
const liveStatusLog = $("live-status");

// ---- Populate dropdowns ----
(function populateDropdowns() {
  const list = ROUTES.aluvaToTripunithura;
  list.forEach(s => {
    const o1 = new Option(s.name, s.id, s.id === "VYTA", s.id === "VYTA");
    const o2 = new Option(s.name, s.id, s.id === "TPHT", s.id === "TPHT");
    boardingSelect.add(o1);
    destinationSelect.add(o2);
  });
})();

function log(msg) {
  const t = new Date().toTimeString().slice(0,5);
  const d = document.createElement("div");
  d.innerHTML = `<span class="ts">${t}</span> ${msg.replace(/</g,"&lt;")}`;
  liveStatusLog.appendChild(d);
  liveStatusLog.scrollTop = liveStatusLog.scrollHeight;
}

function showScreen(focus) {
  setupScreen.style.display = focus ? "none" : "flex";
  focusScreen.style.display = focus ? "flex" : "none";
}

const resyncStationSelect = $("resync-station");
const demoControls = $("demo-controls");
const tripTools = $("trip-tools");
const newTripBtn = $("new-trip");
const alertLiveStatus = $("alert-live-status");

const tripState = {
  route: null,
  boardingIndex: -1,
  destinationIndex: -1,
  startedAtMs: 0,
  expectedArrivalMsByIndex: {},
  displayedIndex: -1,
  resyncOffsetMs: 0,
  alertFired: false,
  millisecondsPerScheduleSecond: 1000
};
let timerId = null;
let audioContext = null;

// A nearby default makes a fast first phone test possible.
destinationSelect.value = "THYK";

function getTrip() {
  const forward = ROUTES.aluvaToTripunithura;
  const boardForward = forward.findIndex(s => s.id === boardingSelect.value);
  const destinationForward = forward.findIndex(s => s.id === destinationSelect.value);
  if (boardForward === destinationForward) return null;
  const route = boardForward < destinationForward ? ROUTES.aluvaToTripunithura : ROUTES.tripunithuraToAluva;
  const boardingIndex = route.findIndex(s => s.id === boardingSelect.value);
  const destinationIndex = route.findIndex(s => s.id === destinationSelect.value);
  return { route, boardingIndex, destinationIndex };
}

function formatTime(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / tripState.millisecondsPerScheduleSecond));
  return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
}

function buildRemainingSchedule(fromIndex, startMs) {
  let totalSeconds = 0;
  for (let index = fromIndex + 1; index <= tripState.destinationIndex; index += 1) {
    totalSeconds += tripState.route[index - 1].secondsToNext;
    const normalArrivalMs = startMs + totalSeconds * 1000;
    tripState.expectedArrivalMsByIndex[index] = tripState.millisecondsPerScheduleSecond === 100
      ? startMs + (normalArrivalMs - startMs) / 10
      : normalArrivalMs;
  }
}

function playTone() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    audioContext = audioContext || new AudioContextClass();
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = "sine";
    gain.gain.setValueAtTime(0.0001, now);
    const bursts = [0, 0.72, 1.44, 2.16];
    bursts.forEach((offset, index) => {
      const start = now + offset;
      oscillator.frequency.setValueAtTime(index % 2 === 0 ? 880 : 1175, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.34, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.56);
    });
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 2.8);
  } catch (_) { log("Audio alert unavailable in this browser."); }
}

function fireAlert() {
  const destination = tripState.route
    ? tripState.route[tripState.destinationIndex].name
    : destinationSelect.options[destinationSelect.selectedIndex].text;
  const message = destination + " is next. Prepare to alight.";
  alertMessage.textContent = message;
  alertLiveStatus.textContent = "Your destination is next. " + message;
  alertOverlay.classList.add("active");
  if (navigator.vibrate) navigator.vibrate([600, 180, 600, 180, 600, 180, 900]);
  playTone();
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
}

function finishTrip() {
  stopTimer();
  const station = tripState.route[tripState.destinationIndex];
  tripState.displayedIndex = tripState.destinationIndex;
  nextStopText.textContent = station.name;
  stopsRemainingText.textContent = "Arrived at destination";
  timeRemainingText.textContent = "00:00";
  timingStatusText.textContent = "Destination reached";
  tripTools.hidden = true;
  newTripBtn.hidden = false;
  log("Arrived at " + station.name + ".");
}

function updateCountdown() {
  if (!tripState.route || tripState.displayedIndex >= tripState.destinationIndex) return;
  const now = Date.now();
  while (tripState.displayedIndex < tripState.destinationIndex && now >= tripState.expectedArrivalMsByIndex[tripState.displayedIndex + 1]) {
    tripState.displayedIndex += 1;
    log("Reached " + tripState.route[tripState.displayedIndex].name + ".");
  }
  if (tripState.displayedIndex >= tripState.destinationIndex) { finishTrip(); return; }
  const nextIndex = tripState.displayedIndex + 1;
  const remaining = tripState.destinationIndex - tripState.displayedIndex;
  nextStopText.textContent = tripState.route[nextIndex].name;
  stopsRemainingText.textContent = remaining + " stop" + (remaining === 1 ? "" : "s") + " remaining";
  timeRemainingText.textContent = formatTime(tripState.expectedArrivalMsByIndex[nextIndex] - now);
  if (!tripState.alertFired && tripState.displayedIndex === tripState.destinationIndex - 1) {
    tripState.alertFired = true;
    fireAlert();
  }
}

function startTrip() {
  const selected = getTrip();
  if (!selected) { setupStatusText.textContent = "Select different boarding and destination stations."; return; }
  stopTimer();
  Object.assign(tripState, selected, {
    startedAtMs: Date.now(), expectedArrivalMsByIndex: {}, displayedIndex: selected.boardingIndex,
    resyncOffsetMs: 0, alertFired: false, millisecondsPerScheduleSecond: demoModeCheckbox.checked ? 100 : 1000
  });
  buildRemainingSchedule(tripState.boardingIndex, tripState.startedAtMs);
  timingStatusText.textContent = demoModeCheckbox.checked ? "Demo timing" : "Approximate schedule timing";
  demoControls.hidden = !demoModeCheckbox.checked;
  tripTools.open = false;
  tripTools.hidden = false;
  newTripBtn.hidden = true;
  setupStatusText.textContent = "";
  showScreen(true);
  log("Started " + tripState.route[tripState.boardingIndex].name + " to " + tripState.route[tripState.destinationIndex].name + ".");
  updateCountdown();
  timerId = setInterval(updateCountdown, 1000);
}

function populateResyncStations() {
  if (!tripState.route || tripState.displayedIndex >= tripState.destinationIndex) return;
  resyncStationSelect.innerHTML = "";
  for (let index = tripState.displayedIndex; index < tripState.destinationIndex; index += 1) {
    resyncStationSelect.add(new Option(tripState.route[index].name, String(index)));
  }
}

function applyResync() {
  const fromIndex = Number(resyncStationSelect.value);
  if (!Number.isInteger(fromIndex) || fromIndex < tripState.boardingIndex || fromIndex >= tripState.destinationIndex) return;
  const now = Date.now();
  tripState.resyncOffsetMs = now - tripState.startedAtMs;
  tripState.displayedIndex = fromIndex;
  buildRemainingSchedule(fromIndex, now);
  log("Resynced from " + tripState.route[fromIndex].name + ".");
  updateCountdown();
}

$("setup-form").addEventListener("submit", event => { event.preventDefault(); startTrip(); });
$("apply-resync").addEventListener("click", applyResync);
tripTools.addEventListener("toggle", () => { if (tripTools.open) populateResyncStations(); });
endTripBtn.addEventListener("click", () => {
  stopTimer(); demoControls.hidden = true; tripTools.open = false; showScreen(false); setupStatusText.textContent = "Trip ended.";
});
newTripBtn.addEventListener("click", () => {
  stopTimer();
  tripTools.hidden = false;
  newTripBtn.hidden = true;
  showScreen(false);
  setupStatusText.textContent = "Choose your next journey.";
});
$("demo-next-stop").addEventListener("click", () => {
  if (!demoModeCheckbox.checked || !tripState.route || tripState.displayedIndex >= tripState.destinationIndex) return;
  tripState.expectedArrivalMsByIndex[tripState.displayedIndex + 1] = Date.now();
  updateCountdown();
});
$("demo-alert-next").addEventListener("click", () => {
  if (!demoModeCheckbox.checked || !tripState.route || tripState.displayedIndex >= tripState.destinationIndex) return;
  tripState.alertFired = false;
  const beforeDestination = tripState.destinationIndex - 1;
  tripState.displayedIndex = beforeDestination;
  buildRemainingSchedule(beforeDestination, Date.now());
  updateCountdown();
});
document.addEventListener("visibilitychange", () => { if (!document.hidden) updateCountdown(); });
