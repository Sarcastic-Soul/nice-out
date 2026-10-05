"use client";

import { useState } from "react";
import { MagnifyingGlassIcon, NavigationArrowIcon, SignpostIcon } from "@phosphor-icons/react";
import { api, newId, storedId } from "@/lib/client";

type Place = { name: string; lat: number; lon: number; tz: string };

export function Welcome({ onDone, moving }: { onDone: (id: string) => void; moving?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);

  async function save(lat: number, lon: number, tz: string, name?: string) {
    setBusy(true);
    setError(null);
    try {
      const id = storedId() ?? newId();
      await api("/api/person", { method: "POST", body: JSON.stringify({ id, lat, lon, tz, name }) });
      onDone(id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  function useLocation() {
    if (!navigator.geolocation) return setError("This browser can't share location. Search for your area instead.");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => save(pos.coords.latitude, pos.coords.longitude, Intl.DateTimeFormat().resolvedOptions().timeZone),
      () => {
        setBusy(false);
        setError("Location was blocked. Search for your area instead.");
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    const r = await api<{ results: Place[] }>(`/api/person?q=${encodeURIComponent(query)}`).catch(() => ({ results: [] }));
    setResults(r.results);
    if (!r.results.length) setError("Nothing found. Try a nearby city.");
  }

  return (
    <main className="wrap welcome">
      <div className="brand"><SignpostIcon weight="fill" size={22} />Nice Out</div>
      <h1 className="display welcome-title">
        {moving ? "Where are you now?" : <>Weather apps tell everyone the same thing. This one learns <em>you</em>.</>}
      </h1>
      {!moving && (
        <p className="welcome-lede">
          Rate a few past hours, and an open tabular model (TabPFN) learns what “nice out” means to you: the heat, humidity,
          rain and air you actually enjoy. Then it tells you the next window to go outside, so you can close the app and go.
        </p>
      )}
      <div className="welcome-actions">
        <button className="btn solid" onClick={useLocation} disabled={busy}>
          <NavigationArrowIcon weight="bold" size={20} />
          {busy ? "Setting up…" : "Use my location"}
        </button>
        <form onSubmit={search} className="welcome-search">
          <label htmlFor="q" className="small muted">Or search your area</label>
          <div className="search-row">
            <input id="q" className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pune" autoComplete="off" />
            <button className="btn" aria-label="Search"><MagnifyingGlassIcon weight="bold" size={20} /></button>
          </div>
        </form>
        {results.length > 0 && (
          <ul className="results">
            {results.map((p) => (
              <li key={`${p.lat},${p.lon}`}>
                <button onClick={() => save(p.lat, p.lon, p.tz, p.name)} disabled={busy}>{p.name}</button>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      <p className="small muted fineprint">
        Your location is rounded to about 5 km before it’s stored. No account, no email: you’re a random id in this browser.
      </p>
    </main>
  );
}
