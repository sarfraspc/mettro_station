"use strict";

// Generates the small, validated subset of the KMRL GTFS feed used by the app.
// Run from the repository root: node tools/prepare-data.js

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "KMRLOpenData");
const OUTPUT_FILE = path.join(__dirname, "generated-routes.js");
const STATION_COUNT = 25;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error("Unterminated quoted CSV field.");
  if (value.length || row.length) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((field) => field !== ""));
}

function readTable(filename) {
  const rows = parseCsv(fs.readFileSync(path.join(DATA_DIR, filename), "utf8"));
  const [header, ...body] = rows;
  if (!header) throw new Error(`${filename} is empty.`);
  const invalid = body.find((row) => row.length !== header.length);
  if (invalid) throw new Error(`${filename} has a row with the wrong column count.`);
  return body.map((row) => Object.fromEntries(header.map((name, index) => [name, row[index]])));
}

function secondsSinceStartOfService(value) {
  const parts = value.split(":").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
    throw new Error(`Invalid GTFS time: ${value}`);
  }
  const [hours, minutes, seconds] = parts;
  if (hours < 0 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
    throw new Error(`Invalid GTFS time: ${value}`);
  }
  return hours * 3600 + minutes * 60 + seconds;
}

function uniqueMap(rows, key, filename) {
  const result = new Map();
  for (const row of rows) {
    if (!row[key] || result.has(row[key])) throw new Error(`${filename} has a missing or duplicate ${key}.`);
    result.set(row[key], row);
  }
  return result;
}

const stops = uniqueMap(readTable("stops.txt"), "stop_id", "stops.txt");
const trips = uniqueMap(readTable("trips.txt"), "trip_id", "trips.txt");
const stopTimes = readTable("stop_times.txt");

if (stops.size !== STATION_COUNT) throw new Error(`Expected ${STATION_COUNT} stations; found ${stops.size}.`);

const stopTimesByTrip = new Map();
for (const stopTime of stopTimes) {
  if (!trips.has(stopTime.trip_id)) throw new Error(`stop_times references missing trip ${stopTime.trip_id}.`);
  if (!stops.has(stopTime.stop_id)) throw new Error(`stop_times references missing station ${stopTime.stop_id}.`);
  const times = stopTimesByTrip.get(stopTime.trip_id) || [];
  times.push(stopTime);
  stopTimesByTrip.set(stopTime.trip_id, times);
}

const completeTripsByDirection = new Map();
for (const [tripId, times] of stopTimesByTrip) {
  if (times.length !== STATION_COUNT) continue;
  const ordered = [...times].sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
  const seenSequences = new Set(ordered.map((time) => time.stop_sequence));
  const seenStops = new Set(ordered.map((time) => time.stop_id));
  if (seenSequences.size !== STATION_COUNT || seenStops.size !== STATION_COUNT) {
    throw new Error(`Complete trip ${tripId} has duplicate sequences or stations.`);
  }
  if (seenStops.size !== stops.size || [...stops.keys()].some((id) => !seenStops.has(id))) {
    throw new Error(`Complete trip ${tripId} does not include every station.`);
  }
  const direction = trips.get(tripId).direction_id;
  const group = completeTripsByDirection.get(direction) || [];
  group.push({ tripId, times: ordered });
  completeTripsByDirection.set(direction, group);
}

if (completeTripsByDirection.size !== 2) {
  throw new Error(`Expected two directions; found ${completeTripsByDirection.size}.`);
}

function buildRoute(completeTrips) {
  const order = completeTrips[0].times.map((time) => time.stop_id);
  for (const { tripId, times } of completeTrips) {
    if (times.map((time) => time.stop_id).join("|") !== order.join("|")) {
      throw new Error(`Complete trip ${tripId} has a different station order.`);
    }
  }

  return order.map((stopId, index) => {
    if (index === order.length - 1) {
      return { id: stopId, name: stops.get(stopId).stop_name, secondsToNext: 0 };
    }
    const durations = completeTrips.map(({ times }) => {
      const duration = secondsSinceStartOfService(times[index + 1].arrival_time)
        - secondsSinceStartOfService(times[index].departure_time);
      if (duration <= 0) throw new Error(`Trip segment ${times[index].trip_id} ${stopId} has non-positive duration.`);
      return duration;
    });
    return {
      id: stopId,
      name: stops.get(stopId).stop_name,
      secondsToNext: Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    };
  });
}

const routesByDirection = new Map([...completeTripsByDirection].map(([direction, completeTrips]) => [direction, buildRoute(completeTrips)]));
const routeEntries = [...routesByDirection.entries()];
const aluvaEntry = routeEntries.find(([, route]) => route[0].id === "ALVA" && route.at(-1).id === "TPHT");
const tripunithuraEntry = routeEntries.find(([, route]) => route[0].id === "TPHT" && route.at(-1).id === "ALVA");
if (!aluvaEntry || !tripunithuraEntry) throw new Error("Directions are not Aluva ↔ Tripunithura.");

const [aluvaDirection, aluvaToTripunithura] = aluvaEntry;
const [tripunithuraDirection, tripunithuraToAluva] = tripunithuraEntry;
if (aluvaToTripunithura.map((station) => station.id).join("|") !== tripunithuraToAluva.map((station) => station.id).reverse().join("|")) {
  throw new Error("The two directions are not reverse station orders.");
}
for (const route of [aluvaToTripunithura, tripunithuraToAluva]) {
  if (route.length !== STATION_COUNT || route.slice(0, -1).some((station) => station.secondsToNext <= 0)) {
    throw new Error("A generated route has an invalid segment duration.");
  }
}

const output = `// Generated from KMRLOpenData by tools/prepare-data.js. Do not edit manually.\nconst ROUTES = ${JSON.stringify({ aluvaToTripunithura, tripunithuraToAluva }, null, 2)};\n`;
fs.writeFileSync(OUTPUT_FILE, output);
console.log(`Generated ${OUTPUT_FILE}`);
console.log(`Direction ${aluvaDirection}: Aluva to Tripunithura (${aluvaToTripunithura.length} stations).`);
console.log(`Direction ${tripunithuraDirection}: Tripunithura to Aluva (${tripunithuraToAluva.length} stations).`);
