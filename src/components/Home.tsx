"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowClockwiseIcon,
  CloudRainIcon,
  CloudSunIcon,
  DropIcon,
  MapPinIcon,
  SignpostIcon,
  SunIcon,
  ThermometerSimpleIcon,
  WindIcon,
} from "@phosphor-icons/react";
import { api, clock, dayLabel, hourLabel, todayLine, type Outlook } from "@/lib/client";
import { Ask } from "./Ask";

const GOOD = 0.6;
const MIN_RATINGS = 6;

type Hours = Outlook["hours"];

const WHEN = [
  { label: "Just now", mins: 15 },
  { label: "1 hour ago", mins: 60 },
  { label: "2 hours ago", mins: 120 },
  { label: "3 hours ago", mins: 180 },
  { label: "5 hours ago", mins: 300 },
];

const weekday = (ts: string, tz: string) => new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: tz }).format(new Date(ts));

function reasonIcon(text: string) {
  if (/PM2\.5|Air/.test(text)) return <WindIcon size={20} />;
  if (/rain/i.test(text)) return <CloudRainIcon size={20} />;
  if (/humid|sticky/i.test(text)) return <DropIcon size={20} />;
  if (/Dark/.test(text)) return <SunIcon size={20} />;
  return <ThermometerSimpleIcon size={20} />;
}

export function Home({ id, onMove, onTeach }: { id: string; onMove: () => void; onTeach: () => void }) {
  const [o, setO] = useState<Outlook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOutlook = useCallback(
    () =>
      api<Outlook>(`/api/outlook?id=${id}`)
        .then((x) => {
          setO(x);
          setError(null);
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false)),
    [id],
  );

  useEffect(() => {
    fetchOutlook();
  }, [fetchOutlook]);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchOutlook();
  };

  const tz = o?.person.tz ?? "UTC";

  return (
    <main className="wrap">
      <header className="topbar">
        <div className="brand"><SignpostIcon weight="fill" size={22} />Nice Out</div>
        {o && (
          <button className="place" onClick={onMove} title="Change place">
            <MapPinIcon size={16} />
            {o.person.place_name} · {todayLine(tz)}
          </button>
        )}
      </header>

      {!o && loading && <Loading />}
      {!o && error && (
        <div className="error-block" role="alert">
          <p>{error}</p>
          <div className="row">
            <button className="btn" onClick={load}><ArrowClockwiseIcon weight="bold" size={20} />Try again</button>
            {error === "Unknown person" && <button className="btn" onClick={onMove}>Set up your place</button>}
          </div>
        </div>
      )}

      {o && (
        <>
          <Hero o={o} />
          {o.mode === "rule" && (
            <div className="rule-note">
              <p>
                {o.n_ratings === 0 ? "Nothing learned yet. " : `${o.n_ratings} rating${o.n_ratings === 1 ? "" : "s"} so far. `}
                This is a generic weather rule for now. TabPFN takes over once you’ve rated {MIN_RATINGS} hours, with at least one yes and one no.
              </p>
              <button className="btn" onClick={onTeach}>Rate past hours</button>
            </div>
          )}
          <Chart hours={o.hours} tz={tz} />
          <section className="lower">
            <LogOuting id={id} tz={tz} onSaved={load} />
            <ScoreBlock o={o} />
          </section>
          <Ask id={id} />
          <footer className="small muted foot">
            Forecast and air quality from Open-Meteo. Predictions by TabPFN-3.5 from Prior Labs.{" "}
            <a href="https://github.com/Sarcastic-Soul/nice-out">Source on GitHub</a>
          </footer>
        </>
      )}
    </main>
  );
}

function Loading() {
  return (
    <section className="hero" aria-busy="true">
      <div className="marker marker-loading">
        <small>Asking TabPFN about the next 36 hours…</small>
        <div className="time skel-line" />
        <div className="to skel-line short" />
      </div>
      <p className="small muted">
        It fits a model to your ratings and scores every hour of the forecast. Takes a few seconds the first time each hour, then it&rsquo;s cached.
      </p>
    </section>
  );
}

function Hero({ o }: { o: Outlook }) {
  const reduce = useReducedMotion();
  const tz = o.person.tz;
  const w = o.window;
  const nowHour = o.hours[0]?.ts;
  const learned =
    o.mode === "tabpfn"
      ? `learned from ${o.n_ratings} of your ratings`
      : "generic rule, not yet yours";

  let head: React.ReactNode;
  if (w) {
    const isNow = w.start === nowHour;
    const end = clock(w.end, tz);
    const start = clock(w.start, tz);
    const day = dayLabel(w.start, tz);
    head = (
      <>
        <small>{isNow ? "Good right now" : day === "Today" ? "Go out at" : `${day}, go out at`}</small>
        <div className="time">{isNow ? "Now" : start.time}{!isNow && <span className="ampm">{start.ampm}</span>}</div>
        <div className="to">until {end.time} {end.ampm}{dayLabel(w.end, tz) !== day ? ` ${dayLabel(w.end, tz).toLowerCase()}` : ""}</div>
        <p className="odds">{Math.round(w.p * 100)}% chance you’ll enjoy it · {learned}</p>
      </>
    );
  } else if (o.best) {
    // Nothing clears 60%, but still point at a time: the app's job is to get you out.
    const b = o.best;
    const start = clock(b.ts, tz);
    const day = dayLabel(b.ts, tz);
    head = (
      <>
        <small>Nothing great in the next 36 hours. Best bet{day === "Today" ? "" : `, ${day.toLowerCase()}`}:</small>
        <div className="time">{start.time}<span className="ampm">{start.ampm}</span></div>
        <div className="to">for an hour, feels like {Math.round(b.feels)}°</div>
        <p className="odds">{Math.round(b.p * 100)}% chance you’ll enjoy it · {learned}</p>
      </>
    );
  } else {
    head = (
      <>
        <small>Next 36 hours</small>
        <div className="time time-sm">No forecast</div>
        <p className="odds">Weather data didn’t load. Try again in a minute.</p>
      </>
    );
  }

  return (
    <section className="hero">
      <motion.div
        className={`marker${w ? "" : " marker-off"}`}
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0, duration: 0.5 }}
      >
        {head}
      </motion.div>
      <div className="rule-list why">
        {o.reasons.length > 0 ? (
          o.reasons.map((r) => (
            <div key={r}>{reasonIcon(r)}<span>{r}</span></div>
          ))
        ) : (
          <div><CloudSunIcon size={20} /><span>Check back later. The forecast refreshes every hour.</span></div>
        )}
        {o.later.length > 0 && (
          <p className="small muted later">
            Also good:{" "}
            {o.later
              .map((l) => `${dayLabel(l.start, tz) === "Today" ? "" : dayLabel(l.start, tz) + " "}${hourLabel(l.start, tz)}–${hourLabel(l.end, tz)}`)
              .join(" · ")}
          </p>
        )}
      </div>
    </section>
  );
}

function Chart({ hours, tz }: { hours: Hours; tz: string }) {
  const [sel, setSel] = useState<number | null>(null);
  const h = sel !== null ? hours[sel] : null;
  return (
    <section className="chart">
      <h2 className="display">Next 36 hours, for you</h2>
      <div className="bars" style={{ gridTemplateColumns: `repeat(${hours.length}, 1fr)` }}>
        {hours.map((x, i) => (
          <button
            key={x.ts}
            className={`bar${!x.awake ? " night" : x.p >= GOOD ? " go" : ""}${sel === i ? " sel" : ""}`}
            style={{ height: x.awake ? `${6 + x.p * 94}%` : "4%" }}
            onClick={() => setSel(sel === i ? null : i)}
            aria-label={`${dayLabel(x.ts, tz)} ${hourLabel(x.ts, tz)}: ${x.awake ? `${Math.round(x.p * 100)}%` : "night"}`}
          />
        ))}
      </div>
      <div className="ticks" style={{ gridTemplateColumns: `repeat(${hours.length}, 1fr)` }} aria-hidden>
        {hours.map((x) => (
          <span key={x.ts}>{x.hour_local % 6 === 0 ? (x.hour_local === 0 ? weekday(x.ts, tz) : hourLabel(x.ts, tz).replace(" ", "")) : ""}</span>
        ))}
      </div>
      <p className="small muted detail" aria-live="polite">
        {h
          ? `${dayLabel(h.ts, tz)} ${hourLabel(h.ts, tz)}: ${h.awake ? `${Math.round(h.p * 100)}%` : "night, not suggested"} · feels ${Math.round(h.feels)}° · humidity ${Math.round(h.humidity)}% · rain ${Math.round(h.rain_prob)}%${h.pm25 !== null ? ` · PM2.5 ${Math.round(h.pm25)}` : ""}${h.is_day ? "" : " · dark"}`
          : "Tap a bar for that hour. Green means you'll probably enjoy it. Night hours are left out."}
      </p>
    </section>
  );
}

function LogOuting({ id, tz, onSaved }: { id: string; tz: string; onSaved: () => void }) {
  const [mins, setMins] = useState(15);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function log(verdict: "great" | "fine" | "bad") {
    setBusy(true);
    setMsg(null);
    const ts = new Date(Date.now() - mins * 60_000).toISOString();
    try {
      const r = await api<{ predicted: number | null }>("/api/rate", {
        method: "POST",
        body: JSON.stringify({ id, source: "outing", verdict, ts }),
      });
      const said = r.predicted !== null ? ` It had given that hour ${Math.round(r.predicted * 100)}%.` : "";
      setMsg(`Logged ${verdict} for ${hourLabel(ts, tz)}.${said}`);
      onSaved();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h3 className="display">Back from outside?</h3>
      <label className="small muted when">
        When were you out?
        <select value={mins} onChange={(e) => setMins(Number(e.target.value))}>
          {WHEN.map((w) => <option key={w.mins} value={w.mins}>{w.label}</option>)}
        </select>
      </label>
      <div className="btns">
        <button className="btn stack" disabled={busy} onClick={() => log("great")}><SunIcon size={22} />Great</button>
        <button className="btn stack" disabled={busy} onClick={() => log("fine")}><CloudSunIcon size={22} />Fine</button>
        <button className="btn stack" disabled={busy} onClick={() => log("bad")}><CloudRainIcon size={22} />Bad</button>
      </div>
      <p className="small muted" aria-live="polite">{msg ?? "Each one becomes a training row, so it gets better the more you go out."}</p>
    </div>
  );
}

function ScoreBlock({ o }: { o: Outlook }) {
  const s = o.score;
  if (!s) {
    return (
      <div className="score">
        <span className="n muted-n">–/–</span>
        <p>
          Log 5 outings and you’ll see how often it called them right, next to a generic weather rule.
          {o.n_outings > 0 && ` ${o.n_outings} logged so far.`}
        </p>
      </div>
    );
  }
  return (
    <div className="score">
      <span className="n">{s.model_right}/{s.total}</span>
      <p>
        {s.kind === "outings" ? "real outings called right before you went." : "of your ratings called right when held out of training."}{" "}
        A generic &ldquo;feels like 16–30°, dry, clean air&rdquo; rule got {s.rule_right}.
      </p>
    </div>
  );
}
