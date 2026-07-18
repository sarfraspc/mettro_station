# Metro Stop Alert

A dependency-free, offline mobile web app for Kochi Metro riders. Select where you board and where you are going, tap **Start Journey Countdown** once, and the app estimates upcoming stations from historical KMRL GTFS timing data. It alerts the rider one stop before the destination.

## Project structure

```
.
├── index.html              # Static application entry point
├── src/
│   ├── styles/main.css     # Application styles
│   ├── scripts/app.js      # Application behaviour
│   └── data/routes.js      # Generated route data used by the app
├── data/gtfs/              # Source KMRL GTFS schedule data
└── scripts/prepare-data.js # Validates GTFS data and regenerates route data
```

To regenerate the route-data file after updating the GTFS source, run:

```bash
node scripts/prepare-data.js
```

## Important limitation

This is a historical schedule estimate, not live train tracking. Delays, dwell time, or tapping Start before the train departs can make the estimate early or late. Browsers may also suspend timers, audio, or vibration while a phone is locked.

## Run locally

No dependencies or build step are needed for the app itself. From this directory:

```bash
python -m http.server 8000 --bind 0.0.0.0
```

Open `http://localhost:8000/index.html` on the laptop. To test from a phone on the same Wi-Fi or hotspot, use the laptop's local IPv4 address instead of `localhost`, for example `http://192.168.x.x:8000/index.html`.

## Phone test

On the phone, enable Demo Mode, start a short Vyttila trip, then use **Demo: next stop** and **Demo: alert next**. Test the alert while the page is active; vibration and audio depend on the device and browser.

Contains data provided by Kochi Metro Rail Limited.
