# Metro Stop Alert

**For when your headphones, nap, or doomscrolling make you miss your metro stop.**

## What it does

Metro Stop Alert is your quiet co-rider on the Kochi Metro. Pick your destination, board, and let it make sure you look up before you sail past it.

## How it works

Tap once when you board. The app estimates every upcoming stop from KMRL's real schedule data, then alerts you before your destination.

## Why it's built this way

No live GPS or API required—KMRL doesn't publish one. Built during the sprint, it can travel anywhere GTFS data does.

> Built solo, live, on a moving KMRL train.

Contains data provided by Kochi Metro Rail Limited.

**Run it on your phone:** connect it to the same Wi-Fi, run `python -m http.server 8000 --bind 0.0.0.0` on your laptop, then open `http://YOUR-LAPTOP-IP:8000` on your phone.
