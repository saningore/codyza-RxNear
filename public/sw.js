const SHELL = "rxnear-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await Promise.all(["/", "/sources", "/about", "/manifest.webmanifest", "/rxnear-icon.svg"].map(async (path) => {
      try {
        await cache.add(path);
      } catch {
        // A missing shell page should not block the worker.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== SHELL).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (event.request.mode !== "navigate") return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      const cache = await caches.open(SHELL);
      cache.put(event.request, response.clone());
      return response;
    } catch {
      const cached = await caches.match(event.request);
      return cached || caches.match("/") || Response.error();
    }
  })());
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "watch" || !Array.isArray(data.locations)) return;
  const seen = data.seen && typeof data.seen === "object" ? data.seen : {};
  event.waitUntil(writeValue("watch", { locations: data.locations.slice(0, 5), seen }));
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "rxnear-npi") event.waitUntil(checkWatched());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = typeof event.notification.data?.url === "string" ? event.notification.data.url : "/";
  event.waitUntil(self.clients.openWindow(target));
});

async function checkWatched() {
  const watch = await readValue("watch");
  if (!watch || !Array.isArray(watch.locations)) return;
  const seen = watch.seen && typeof watch.seen === "object" ? watch.seen : {};
  for (const location of watch.locations.slice(0, 5)) {
    if (!location || location.notify !== true) continue;
    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const label = typeof location.label === "string" ? location.label : "Saved location";
    const params = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      radius: String(location.radius || 10),
      label,
      precision: typeof location.precision === "string" ? location.precision : "place",
    });
    let response;
    try {
      response = await fetch(`/api/pharmacies?${params.toString()}`, { cache: "no-store" });
    } catch {
      continue;
    }
    if (!response.ok) continue;
    const report = await response.json();
    const rows = [...(Array.isArray(report.pharmacies) ? report.pharmacies : []), ...(Array.isArray(report.others) ? report.others : [])];
    const ids = rows.map((row) => row && row.npi).filter((npi) => typeof npi === "string").sort();
    const previous = Array.isArray(seen[label]) ? seen[label] : null;
    seen[label] = ids;
    if (previous && previous.join(",") !== ids.join(",")) {
      await self.registration.showNotification("RxNear", {
        body: `The federal NPI list for ${label} changed since the last check.`,
        tag: `rxnear-${label}`.slice(0, 120),
        data: { url: `/?q=${encodeURIComponent(label)}&radius=${location.radius || 10}` },
      });
    }
  }
  await writeValue("watch", { locations: watch.locations, seen });
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("rxnear", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("kv")) request.result.createObjectStore("kv");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readValue(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("kv", "readonly");
    const request = transaction.objectStore("kv").get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function writeValue(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("kv", "readwrite");
    transaction.objectStore("kv").put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
