"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PharmacyMap from "@/components/PharmacyMap";
import { distanceLabel, fullAddress, telHref } from "@/lib/format";
import { emptyResults, MSG } from "@/lib/messages";
import { registryChanged } from "@/lib/polygon";
import { defaultTypeIds } from "@/lib/taxonomy";
import { PHARMACY_TYPES, RADII, UNAVAILABLE, type Pharmacy, type PharmacyTypeId, type SearchOrigin, type SearchResponse } from "@/lib/types";

const RECENT_KEY = "rxnear.recent.v1";
const LAST_KEY = "rxnear.last.v1";
const SAVED_KEY = "rxnear.saved.v1";
const SEEN_KEY = "rxnear.npis.v1";

type SavedPlace = {
  label: string;
  latitude: number;
  longitude: number;
  precision: SearchOrigin["precision"];
  state: string | null;
  radius: number;
  notify: boolean;
};

type LastSearch = { result: SearchResponse; radius: number; savedAt: string };

function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T;
  } catch {
    return null;
  }
}

function npiIds(result: SearchResponse): string[] {
  return [...result.pharmacies, ...result.others].map((pharmacy) => pharmacy.npi);
}

function publishWatch(places: SavedPlace[], seen: Record<string, string[]>): void {
  navigator.serviceWorker?.controller?.postMessage({ type: "watch", locations: places, seen });
}

function remember(label: string) {
  try {
    const current = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
    const next = [label, ...current.filter((item) => item !== label)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* Recent searches stay on this browser only. */
  }
}

export default function SearchExperience() {
  const [query, setQuery] = useState("");
  const [radius, setRadius] = useState<number>(10);
  const [phase, setPhase] = useState<"idle" | "searching" | "done">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [activeNpi, setActiveNpi] = useState<string | null>(null);
  const [nameFilter, setNameFilter] = useState("");
  const [includeOther, setIncludeOther] = useState(false);
  const [sortName, setSortName] = useState(false);
  const [wheelchairOnly, setWheelchairOnly] = useState(false);
  const [driveOnly, setDriveOnly] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);
  const [selected, setSelected] = useState<PharmacyTypeId[]>(defaultTypeIds());
  const [suggestions, setSuggestions] = useState<SearchOrigin[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedPlace[]>([]);
  const [seen, setSeen] = useState<Record<string, string[]>>({});
  const [offlineNote, setOfflineNote] = useState("");

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
      if (Array.isArray(stored)) setRecent(stored.filter((item) => typeof item === "string").slice(0, 8));
      const storedSaved = readJson<SavedPlace[]>(SAVED_KEY);
      const storedSeen = readJson<Record<string, string[]>>(SEEN_KEY);
      if (Array.isArray(storedSaved)) setSaved(storedSaved.slice(0, 5));
      if (storedSeen && typeof storedSeen === "object") setSeen(storedSeen);
    } catch {
      /* Ignore a broken local value. */
    }
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q")?.trim() ?? "";
    const requested = Number(params.get("radius"));
    const nextRadius = (RADII as readonly number[]).includes(requested) ? requested : 10;
    setRadius(nextRadius);
    if (!q) return;
    setQuery(q);
    void runQuery(q, nextRadius);
  }, []);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/geocode?suggest=1&q=${encodeURIComponent(text)}`);
        const payload = await response.json();
        setSuggestions(Array.isArray(payload.suggestions) ? payload.suggestions as SearchOrigin[] : []);
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  async function searchAt(origin: SearchOrigin, nextRadius: number) {
    setPhase("searching");
    setError("");
    setActiveNpi(null);
    const params = new URLSearchParams({
      lat: String(origin.latitude),
      lon: String(origin.longitude),
      radius: String(nextRadius),
      label: origin.label,
      precision: origin.precision,
    });
    if (origin.accuracyMeters) params.set("accuracy", String(origin.accuracyMeters));
    if (origin.state) params.set("state", origin.state);
    let payload: SearchResponse;
    try {
      const response = await fetch(`/api/pharmacies?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || MSG.nppes);
      payload = body as SearchResponse;
      setOfflineNote("");
    } catch (caught) {
      const last = readJson<LastSearch>(LAST_KEY);
      if (last?.result?.origin?.label === origin.label) {
        const retrieved = last.savedAt;
        setResult({
          ...last.result,
          warnings: [...last.result.warnings, { source: "Saved copy", message: `${MSG.offline} Retrieved ${retrieved}.` }],
        });
        setOfflineNote(`${MSG.offline} Retrieved ${retrieved}.`);
        setPhase("done");
        return;
      }
      throw caught instanceof Error ? caught : new Error(MSG.nppes);
    }
    setResult(payload);
    setPhase("done");
    const savedAt = new Date().toISOString();
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify({ result: payload, radius: nextRadius, savedAt } satisfies LastSearch));
    } catch {
      /* The last search stays in memory for this visit. */
    }
    const ids = npiIds(payload);
    setSeen((current) => {
      const previous = current[origin.label];
      const next = { ...current, [origin.label]: ids };
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(next));
      } catch {
        /* The comparison stays in this visit. */
      }
      const place = readJson<SavedPlace[]>(SAVED_KEY)?.find((item) => item.label === origin.label && item.notify);
      if (place && previous && registryChanged(previous, ids) && typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("RxNear", { body: `The federal NPI list for ${origin.label} changed since the last check.` });
      }
      publishWatch(readJson<SavedPlace[]>(SAVED_KEY) ?? [], next);
      return next;
    });
    remember(origin.label);
    setRecent((current) => [origin.label, ...current.filter((item) => item !== origin.label)].slice(0, 8));
    const url = `/?q=${encodeURIComponent(origin.precision === "zip-center" ? origin.label.replace("ZIP code ", "") : origin.label)}&radius=${nextRadius}`;
    window.history.replaceState(null, "", url);
  }

  async function runQuery(text: string, nextRadius: number) {
    setPhase("searching");
    setError("");
    setSuggestions([]);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(text.trim())}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || MSG.address);
      setQuery(payload.label);
      await searchAt(payload as SearchOrigin, nextRadius);
    } catch (caught) {
      setPhase("idle");
      setResult(null);
      setError(caught instanceof Error ? caught.message : MSG.address);
    }
  }

  function locate() {
    if (!navigator.geolocation) {
      setError(MSG.unsupported);
      return;
    }
    setPhase("searching");
    setError("");
    navigator.geolocation.getCurrentPosition(async (position) => {
      const accuracy = Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null;
      const label = accuracy && accuracy > 1000
        ? `Your location, accurate to about ${Math.round(accuracy).toLocaleString("en-US")} meters`
        : "Your current location";
      try {
        await searchAt({
          label,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          precision: "device",
          state: null,
          accuracyMeters: accuracy,
        }, radius);
        setQuery(label);
      } catch (caught) {
        setPhase("idle");
        setError(caught instanceof Error ? caught.message : MSG.unavailableLocation);
      }
    }, (failure) => {
      setPhase("idle");
      if (failure.code === 1) setError(MSG.denied);
      else if (failure.code === 3) setError(MSG.timeout);
      else setError(MSG.unavailableLocation);
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  }

  const pool = useMemo(() => {
    if (!result) return [];
    return includeOther ? [...result.pharmacies, ...result.others] : result.pharmacies;
  }, [result, includeOther]);

  const shown = useMemo(() => {
    const needle = nameFilter.trim().toLowerCase();
    const rows = pool.filter((pharmacy) => {
      if (selected.length && !pharmacy.types.some((type) => selected.includes(type))) return false;
      if (needle && !`${pharmacy.name} ${pharmacy.aka ?? ""}`.toLowerCase().includes(needle)) return false;
      if (wheelchairOnly && pharmacy.wheelchair !== "Wheelchair accessible" && pharmacy.wheelchair !== "Limited wheelchair access") return false;
      if (driveOnly && !pharmacy.driveThrough) return false;
      if (openOnly && pharmacy.openNow !== true) return false;
      return true;
    });
    rows.sort((a, b) => sortName ? a.name.localeCompare(b.name) : (a.distanceMiles ?? 9999) - (b.distanceMiles ?? 9999) || a.name.localeCompare(b.name));
    return rows;
  }, [pool, selected, nameFilter, wheelchairOnly, driveOnly, openOnly, sortName]);

  const wheelchairAvailable = pool.some((pharmacy) => pharmacy.wheelchair === "Wheelchair accessible" || pharmacy.wheelchair === "Limited wheelchair access");
  const driveAvailable = pool.some((pharmacy) => pharmacy.driveThrough);
  const openAvailable = pool.some((pharmacy) => pharmacy.openNow === true || pharmacy.openNow === false);
  const nextRadius = RADII.find((value) => value > radius) ?? null;

  useEffect(() => {
    if (!activeNpi) return;
    const card = document.querySelector(`[data-npi="${CSS.escape(activeNpi)}"]`);
    if (card instanceof HTMLElement) card.scrollIntoView({ block: "nearest" });
  }, [activeNpi]);

  const withinShown = shown.filter((pharmacy) => !pharmacy.beyondSelectedRadius);
  const extraShown = shown.filter((pharmacy) => pharmacy.beyondSelectedRadius);

  async function saveLocation(notify: boolean) {
    if (!result) return;
    let allow = notify;
    if (notify && typeof Notification !== "undefined") {
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      allow = permission === "granted";
    }
    const place: SavedPlace = {
      label: result.origin.label,
      latitude: result.origin.latitude,
      longitude: result.origin.longitude,
      precision: result.origin.precision,
      state: result.origin.state,
      radius,
      notify: allow,
    };
    const next = [place, ...saved.filter((item) => item.label !== place.label)].slice(0, 5);
    const nextSeen = { ...seen, [place.label]: npiIds(result) };
    setSaved(next);
    setSeen(nextSeen);
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      localStorage.setItem(SEEN_KEY, JSON.stringify(nextSeen));
    } catch {
      /* Saved locations stay on this browser only. */
    }
    publishWatch(next, nextSeen);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <section className="max-w-3xl">
        <h1 className="font-serif text-4xl font-semibold tracking-tight md:text-5xl">Find nearby pharmacies</h1>
        <p className="mt-3 max-w-2xl text-lg text-ink/80">Search your location, a street address, or a U.S. ZIP code. Results come from the federal NPI registry. Stock and prices are not shown.</p>
      </section>

      <form
        className="mt-6 rounded-3xl border border-line bg-card p-4"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          void runQuery(query, radius);
        }}
      >
        <label htmlFor="place" className="text-sm font-semibold">ZIP code, city, or street address</label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="place"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
            placeholder="10001 or Chicago, IL"
            className="min-h-11 flex-1 rounded-2xl border border-line bg-paper px-4 text-base outline-none focus-visible:outline-2 focus-visible:outline-pine"
          />
          <button className="min-h-11 rounded-full bg-pine px-5 font-semibold text-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine" type="submit">
            {phase === "searching" ? "Searching public records…" : "Search"}
          </button>
          <button className="min-h-11 rounded-full border border-pine px-5 font-semibold text-pine focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine" type="button" onClick={locate}>
            Use my location
          </button>
        </div>
        {suggestions.length > 0 && (
          <ul className="mt-2 overflow-hidden rounded-2xl border border-line" aria-label="Location suggestions">
            {suggestions.slice(0, 5).map((suggestion) => (
              <li key={`${suggestion.label}-${suggestion.latitude}`}>
                <button
                  type="button"
                  className="w-full px-4 py-2 text-left hover:bg-moss focus-visible:outline-2 focus-visible:outline-pine"
                  onClick={() => {
                    setQuery(suggestion.label);
                    setSuggestions([]);
                    void searchAt(suggestion, radius).catch((caught) => {
                      setPhase("idle");
                      setError(caught instanceof Error ? caught.message : MSG.address);
                    });
                  }}
                >
                  {suggestion.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">Search radius</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {RADII.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={radius === value}
                className={`min-h-11 rounded-full px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine ${radius === value ? "bg-pine text-card" : "bg-moss text-ink"}`}
                onClick={() => {
                  setRadius(value);
                  if (result) {
                    void searchAt(result.origin, value).catch((caught) => {
                      setPhase("idle");
                      setError(caught instanceof Error ? caught.message : MSG.nppes);
                    });
                  }
                }}
              >
                {value} mi
              </button>
            ))}
          </div>
        </fieldset>
      </form>

      {error && <p className="mt-4 rounded-2xl bg-amber px-4 py-3 text-sm font-semibold" role="alert">{error}</p>}
      <p className="sr-only" aria-live="polite">{phase === "searching" ? "Searching public records" : result ? `${shown.length} pharmacies listed` : ""}</p>

      {!result && phase !== "searching" && (
        <div className="mt-8">
          <p className="text-ink/70">The map is ready. Pharmacies appear here after you search a U.S. location.</p>
          {recent.length > 0 && (
            <div className="mt-4">
              <h2 className="text-sm font-semibold">Recent searches</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {recent.map((item) => (
                  <button key={item} type="button" className="rounded-full border border-line bg-card px-3 py-2 text-sm" onClick={() => { setQuery(item); void runQuery(item, radius); }}>{item}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {phase === "searching" && (
        <div className="mt-6 grid gap-3" aria-busy="true">
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-3xl bg-line/70" />)}
        </div>
      )}

      {!(result && phase === "done") && (
        <div className="mt-6">
          <PharmacyMap origin={null} pharmacies={[]} activeNpi={null} onActive={() => undefined} />
          <p className="mt-1 text-xs text-ink/60">Map data © OpenStreetMap contributors, via OpenFreeMap. Pan and zoom the map, then search to load pharmacies.</p>
        </div>
      )}

      {result && phase === "done" && (
        <div className="mt-6">
          <h2 className="font-serif text-3xl font-semibold">
            {withinShown.length} {withinShown.length === 1 ? "pharmacy" : "pharmacies"} within {radius} miles of {result.origin.label}
          </h2>
          {extraShown.length > 0 && (
            <p className="mt-2 text-sm text-ink/70">{extraShown.length} more {extraShown.length === 1 ? "is" : "are"} inside the Census boundary or published in this ZIP code, beyond the selected radius.</p>
          )}
          {result.origin.precision === "zip-center" && (
            <p className="mt-2 text-sm text-ink/70">Distances are measured from the center of this ZIP code until a street address is matched.</p>
          )}
          {result.warnings.map((warning) => (
            <p key={warning.source} className="mt-2 rounded-2xl bg-amber px-4 py-3 text-sm" role="status">{warning.message}</p>
          ))}
          {result.capped && <p className="mt-2 text-sm text-ink/70">Showing the closest published pharmacies in this radius. Narrow the search for a shorter list.</p>}
          {result.unpinned > 0 && (
            <p className="mt-2 text-sm text-ink/70">{result.unpinned} {result.unpinned === 1 ? "pharmacy" : "pharmacies"} could not be placed on the map. Their published address is still listed.</p>
          )}
          {offlineNote && <p className="mt-2 rounded-2xl bg-amber px-4 py-3 text-sm" role="status">{offlineNote}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="min-h-11 rounded-full border border-line bg-card px-4 text-sm font-semibold" onClick={() => void saveLocation(false)}>Save this location</button>
            <button type="button" className="min-h-11 rounded-full border border-line bg-card px-4 text-sm font-semibold" onClick={() => void saveLocation(true)}>Notify if the NPI list changes</button>
          </div>
          {saved.length > 0 && (
            <div className="mt-3">
              <h3 className="text-sm font-semibold">Saved locations</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {saved.map((place) => (
                  <button
                    key={place.label}
                    type="button"
                    className="rounded-full border border-line bg-card px-3 py-2 text-sm"
                    onClick={() => {
                      setQuery(place.label);
                      setRadius(place.radius);
                      void searchAt({
                        label: place.label,
                        latitude: place.latitude,
                        longitude: place.longitude,
                        precision: place.precision,
                        state: place.state,
                        accuracyMeters: null,
                      }, place.radius);
                    }}
                  >
                    {place.label}{place.notify ? " · alerts" : ""}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Pharmacy types">
            {PHARMACY_TYPES.map((type) => {
              const count = result.counts[type.id];
              const on = selected.includes(type.id);
              return (
                <button
                  key={type.id}
                  type="button"
                  aria-pressed={on}
                  disabled={count === 0}
                  className={`rounded-full px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine disabled:opacity-40 ${on ? "bg-pine text-card" : "bg-card text-ink"}`}
                  onClick={() => setSelected((current) => current.includes(type.id) ? current.filter((item) => item !== type.id) : [...current, type.id])}
                >
                  {type.label} ({count})
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              Filter by name
              <input value={nameFilter} onChange={(event) => setNameFilter(event.target.value)} className="mt-1 min-h-11 w-full rounded-2xl border border-line bg-card px-3" />
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <button type="button" aria-pressed={sortName} className="min-h-11 rounded-full border border-line bg-card px-4 text-sm font-semibold" onClick={() => setSortName((value) => !value)}>
                {sortName ? "Sorted by name" : "Sorted by distance"}
              </button>
              <button type="button" className="min-h-11 rounded-full border border-line bg-card px-4 text-sm font-semibold" aria-pressed={includeOther} onClick={() => setIncludeOther((value) => !value)}>
                {includeOther ? "Showing other registrations" : `Other registrations (${result.others.length})`}
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={wheelchairOnly} disabled={!wheelchairAvailable} onChange={(event) => setWheelchairOnly(event.target.checked)} />
              Wheelchair access tagged
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={driveOnly} disabled={!driveAvailable} onChange={(event) => setDriveOnly(event.target.checked)} />
              Drive-through tagged
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={openOnly} disabled={!openAvailable} onChange={(event) => setOpenOnly(event.target.checked)} />
              Open now, from mapped hours
            </label>
          </div>
          <p className="mt-2 text-sm text-ink/60">
            {wheelchairAvailable || driveAvailable || openAvailable
              ? "Wheelchair, drive-through, and open now come from OpenStreetMap matches. Pharmacies without the tag are not listed as inaccessible."
              : "Wheelchair, drive-through, and open now are not available from the current sources for these pharmacies."}
          </p>

          {shown.length === 0 && (
            <div className="mt-4 rounded-3xl border border-line bg-card p-5">
              <p>{result.pharmacies.length === 0 ? emptyResults(radius, result.origin.label) : "No pharmacies match these filters."}</p>
              {result.pharmacies.length === 0 && result.others.length > 0 && (
                <button type="button" className="mt-3 font-semibold text-pine underline" onClick={() => setIncludeOther(true)}>
                  Show {result.others.length} other pharmacy registrations
                </button>
              )}
              {result.pharmacies.length === 0 && nextRadius && (
                <button type="button" className="mt-3 block font-semibold text-pine underline" onClick={() => {
                  setRadius(nextRadius);
                  void searchAt(result.origin, nextRadius);
                }}>
                  Search {nextRadius} miles
                </button>
              )}
            </div>
          )}

          <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="order-2 lg:order-1">
              <ul className="space-y-3" aria-label="Nearby pharmacies">
                {shown.map((pharmacy) => (
                  <li key={pharmacy.npi}>
                    <PharmacyCard
                      pharmacy={pharmacy}
                      origin={result.origin}
                      active={activeNpi === pharmacy.npi}
                      onSelect={() => setActiveNpi(pharmacy.npi)}
                    />
                  </li>
                ))}
              </ul>
            </div>
            <div className="order-1 lg:order-2 lg:sticky lg:top-4">
              <PharmacyMap origin={result.origin} pharmacies={shown} boundary={result.boundary} activeNpi={activeNpi} onActive={setActiveNpi} />
              <ul className="mt-2 flex flex-wrap gap-4 text-sm text-ink/70" aria-label="Map legend">
                <li>{result.origin.label}</li>
                <li>Pharmacy</li>
                <li>Approximate distance</li>
                {result.boundary && <li>Census boundary</li>}
              </ul>
              {result.boundary && <p className="mt-1 text-xs text-ink/70">Shaded area: {result.boundary.label}. A pharmacy outside the radius stays listed when its published ZIP matches or its Census point is inside this boundary.</p>}
              <p className="mt-1 text-xs text-ink/60">Map data © OpenStreetMap contributors, via OpenFreeMap.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PharmacyCard({ pharmacy, origin, active, onSelect }: { pharmacy: Pharmacy; origin: SearchOrigin; active: boolean; onSelect: () => void }) {
  const address = fullAddress(pharmacy);
  const phone = telHref(pharmacy.phone);
  const href = `/pharmacy/${pharmacy.npi}?lat=${origin.latitude}&lon=${origin.longitude}`;
  return (
    <article
      data-npi={pharmacy.npi}
      data-pinned={pharmacy.latitude !== null ? "true" : "false"}
      data-active={active ? "true" : "false"}
      className={`rounded-3xl border bg-card p-4 ${active ? "border-pine" : "border-line"}`}
      onMouseEnter={onSelect}
      onFocus={onSelect}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-pine">{pharmacy.typeLabel}</p>
      <h3 className="mt-1 font-serif text-2xl font-semibold leading-tight">
        <Link className="underline decoration-pine/30 underline-offset-4" href={href}>{pharmacy.name}</Link>
      </h3>
      {pharmacy.aka && <p className="text-sm text-ink/70">Also listed as {pharmacy.aka}</p>}
      <p className="mt-2">{address ?? UNAVAILABLE}</p>
      <p className={`mt-1 font-semibold ${pharmacy.distanceApproximate ? "text-clay" : ""}`}>{distanceLabel(pharmacy.distanceMiles, pharmacy.distanceApproximate, origin.precision) ?? `Distance: ${UNAVAILABLE}`}</p>
      {pharmacy.boundaryNote && <p className="mt-1 text-sm text-clay">{pharmacy.boundaryNote}</p>}
      <p className="mt-1">{phone && pharmacy.phone ? <a className="font-semibold text-pine underline" href={phone}>Call {pharmacy.phone}</a> : `Phone: ${UNAVAILABLE}`}</p>
      {pharmacy.openNow !== null && (
        <p className="mt-1 text-sm" title={pharmacy.openNowNote ?? undefined}>{pharmacy.openNow ? "Open now" : "Closed now"}</p>
      )}
      <p className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
        <span className="rounded-full bg-moss px-2 py-1">Listed in the federal NPI registry</span>
        {pharmacy.osmNote && <span className="rounded-full bg-amber px-2 py-1">OpenStreetMap · not confirmed by the pharmacy</span>}
        {pharmacy.beyondSelectedRadius && <span className="rounded-full bg-amber px-2 py-1">Beyond the selected radius</span>}
      </p>
      <Link className="mt-3 inline-flex min-h-11 items-center font-semibold text-pine underline" href={href}>View pharmacy</Link>
    </article>
  );
}
