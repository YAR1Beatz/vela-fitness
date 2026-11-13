# VELA

A phone workout app for one weekly program. Log sets, reps and weight, with a rest timer and a history for each exercise.

Open the GitHub Pages URL in Safari on iPhone, then use Share → Add to Home Screen.

## Add to Home Screen (iPhone)

1. Open the live URL in **Safari** (not Chrome).
2. Tap the **Share** button at the bottom.
3. Scroll and tap **Add to Home Screen**.
4. Tap **Add**. VELA appears on your Home Screen like a regular app.

Data stays on the phone (localStorage). There is no cloud sync yet.

## Default program

The seed program lives in `program.js`. That is the only file to edit when the exact exercise list is ready. After deploying an update, use Settings → Reset on the phone to load the new seed (history and last logged weights are kept).

“Get your next program” starts the next week of the same program: the workout list stays, completion resets, and last logged weights become the new suggestions.
