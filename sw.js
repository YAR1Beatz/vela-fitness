const CACHE = "vela-v25";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./data.js",
  "./program.js",
  "./catalog.js",
  "./photos.js",
  "./manifest.webmanifest",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./fonts/Outfit.ttf",
  "./fonts/Geist.ttf",
  "./img/exercises/cable-curl/0.webp",
  "./img/exercises/cable-kickback/0.webp",
  "./img/exercises/hack-squat/0.webp",
  "./img/exercises/hack-squat/1.webp",
  "./img/exercises/incline-machine-press/0.webp",
  "./img/exercises/lying-leg-curl/0.webp",
  "./img/exercises/lying-leg-curl/1.webp",
  "./img/exercises/overhead-cable-crossover/0.webp",
  "./img/exercises/overhead-rope-extension/0.webp",
  "./img/exercises/pec-deck/0.webp",
  "./img/exercises/preacher-curl/0.webp",
  "./img/exercises/preacher-curl/1.webp",
  "./img/exercises/t-bar-row/0.webp",
  "./img/exercises/t-bar-row/1.webp",
  "./img/exercises/cable-push-down-straight-bar/0.webp",
  "./img/exercises/cable-push-down-straight-bar/1.webp",
  "./img/exercises/cable-rope-tricep-extension/0.webp",
  "./img/exercises/back-extension/0.webp",
  "./img/exercises/back-extension/1.webp",
  "./img/exercises/barbell-bench-press/0.webp",
  "./img/exercises/barbell-bench-press/1.webp",
  "./img/exercises/bulgarian-split-squat/0.webp",
  "./img/exercises/bulgarian-split-squat/1.webp",
  "./img/exercises/cable-fly/0.webp",
  "./img/exercises/chest-dip/0.webp",
  "./img/exercises/chest-dip/1.webp",
  "./img/exercises/chest-supported-row/0.webp",
  "./img/exercises/close-grip-bench-press/0.webp",
  "./img/exercises/close-grip-bench-press/1.webp",
  "./img/exercises/decline-bench-press/0.webp",
  "./img/exercises/decline-bench-press/1.webp",
  "./img/exercises/diamond-push-up/0.webp",
  "./img/exercises/dumbbell-curl/0.webp",
  "./img/exercises/dumbbell-curl/1.webp",
  "./img/exercises/ez-bar-curl/0.webp",
  "./img/exercises/ez-bar-curl/1.webp",
  "./img/exercises/face-pull/0.webp",
  "./img/exercises/face-pull/1.webp",
  "./img/exercises/glute-bridge/0.webp",
  "./img/exercises/glute-bridge/1.webp",
  "./img/exercises/hammer-curl/0.webp",
  "./img/exercises/hammer-curl/1.webp",
  "./img/exercises/hip-thrust/0.webp",
  "./img/exercises/hip-thrust/1.webp",
  "./img/exercises/incline-dumbbell-curl/0.webp",
  "./img/exercises/incline-dumbbell-curl/1.webp",
  "./img/exercises/incline-dumbbell-press/0.webp",
  "./img/exercises/incline-dumbbell-press/1.webp",
  "./img/exercises/incline-barbell-press/0.webp",
  "./img/exercises/incline-barbell-press/1.webp",
  "./img/exercises/incline-dumbbell-tricep-extension/0.webp",
  "./img/exercises/incline-dumbbell-tricep-extension/1.webp",
  "./img/exercises/lat-pulldown/0.webp",
  "./img/exercises/lat-pulldown/1.webp",
  "./img/exercises/lateral-raise/0.webp",
  "./img/exercises/lateral-raise/1.webp",
  "./img/exercises/leg-extension/0.webp",
  "./img/exercises/leg-extension/1.webp",
  "./img/exercises/leg-press-machine/0.webp",
  "./img/exercises/leg-press-machine/1.webp",
  "./img/exercises/machine-chest-press/0.webp",
  "./img/exercises/machine-shoulder-press/0.webp",
  "./img/exercises/machine-shoulder-press/1.webp",
  "./img/exercises/overhead-tricep-extension/0.webp",
  "./img/exercises/overhead-tricep-extension/1.webp",
  "./img/exercises/pull-up/0.webp",
  "./img/exercises/pull-up/1.webp",
  "./img/exercises/push-up/0.webp",
  "./img/exercises/rear-delt-fly/0.webp",
  "./img/exercises/rear-delt-fly/1.webp",
  "./img/exercises/romanian-deadlift/0.webp",
  "./img/exercises/romanian-deadlift/1.webp",
  "./img/exercises/seated-cable-row/0.webp",
  "./img/exercises/seated-cable-row/1.webp",
  "./img/exercises/seated-calf-raise/0.webp",
  "./img/exercises/seated-calf-raise/1.webp",
  "./img/exercises/seated-dumbbell-shoulder-press/0.webp",
  "./img/exercises/seated-dumbbell-shoulder-press/1.webp",
  "./img/exercises/seated-leg-curl/0.webp",
  "./img/exercises/seated-leg-curl/1.webp",
  "./img/exercises/single-arm-dumbbell-row/0.webp",
  "./img/exercises/single-arm-dumbbell-row/1.webp",
  "./img/exercises/skull-crusher/0.webp",
  "./img/exercises/skull-crusher/1.webp",
  "./img/exercises/smith-machine-squat/0.webp",
  "./img/exercises/smith-machine-squat/1.webp",
  "./img/exercises/standing-calf-raise/0.webp",
  "./img/exercises/standing-calf-raise/1.webp",
  "./img/exercises/standing-leg-curl/0.webp",
  "./img/exercises/standing-leg-curl/1.webp",
  "./img/exercises/walking-lunge/0.webp",
  "./img/exercises/walking-lunge/1.webp",
  "./img/exercises/flat-barbell-bench-press/demo.mp4",
  "./img/exercises/flat-barbell-bench-press/poster.jpg",
  "./img/exercises/cable-push-down-straight-bar/demo.mp4",
  "./img/exercises/cable-push-down-straight-bar/poster.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
