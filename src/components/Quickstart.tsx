"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckIcon, CloudRainIcon, DropIcon, ThermometerSimpleIcon, WindIcon, XIcon } from "@phosphor-icons/react";
import { api, dayLabel, hourLabel, type Hour } from "@/lib/client";

const MIN = 6;

export function Quickstart({ id, onDone }: { id: string; onDone: () => void }) {
  const [cards, setCards] = useState<Hour[] | null>(null);
  const [tz, setTz] = useState("UTC");
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<("yes" | "no")[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reduce = useReducedMotion();
  // Ratings save in the background; wait for them before showing the outlook.
  const pending = useRef<Promise<unknown>[]>([]);

  async function finish() {
    await Promise.allSettled(pending.current);
    onDone();
  }

  useEffect(() => {
    api<{ tz: string; cards: Hour[] }>(`/api/quickstart?id=${id}`)
      .then((r) => {
        setCards(r.cards);
        setTz(r.tz);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  async function answer(verdict: "yes" | "no") {
    if (!cards) return;
    const card = cards[i];
    setAnswers((a) => [...a, verdict]);
    setI((n) => n + 1);
    pending.current.push(
      api("/api/rate", { method: "POST", body: JSON.stringify({ id, source: "quickstart", verdict, ts: card.ts }) }).catch((e) =>
        setError(e.message),
      ),
    );
    if (i + 1 >= cards.length) finish();
  }

  const yes = answers.filter((a) => a === "yes").length;
  const canFinish = answers.length >= MIN && yes > 0 && yes < answers.length;
  const card = cards?.[i];

  return (
    <main className="wrap quick">
      <p className="small muted">Teach it your taste · {Math.min(i + 1, cards?.length ?? 14)} of {cards?.length ?? 14}</p>
      <div className="progress" aria-hidden><span style={{ width: `${cards ? (answers.length / cards.length) * 100 : 0}%` }} /></div>
      <h1 className="display quick-q">Would you have gone out?</h1>
      <p className="muted quick-sub">These are real hours from your past week. Answer for a walk or run, whatever you usually do.</p>

      {!cards && !error && <div className="card-skel" aria-label="Loading past hours" />}
      {error && <p className="error" role="alert">{error}</p>}

      <AnimatePresence mode="wait">
        {card && (
          <motion.section
            key={card.ts}
            className="hour-card"
            initial={reduce ? false : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? undefined : { opacity: 0, x: -24 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
          >
            <div className="hour-when">
              <span className="display">{hourLabel(card.ts, tz)}</span>
              <span className="muted">{dayLabel(card.ts, tz)}{card.is_day ? "" : " · dark"}</span>
            </div>
            <div className="rule-list">
              <div><ThermometerSimpleIcon size={20} /><span>Feels like <b>{Math.round(card.feels)}°</b> (air {Math.round(card.temp)}°)</span></div>
              <div><DropIcon size={20} /><span>Humidity <b>{Math.round(card.humidity)}%</b></span></div>
              <div><CloudRainIcon size={20} /><span>{card.rain_mm > 0.1 ? <>Raining, <b>{card.rain_mm.toFixed(1)} mm</b></> : <>Dry{card.cloud > 70 ? ", cloudy" : card.cloud < 25 ? ", clear sky" : ""}</>}</span></div>
              <div><WindIcon size={20} /><span>{card.pm25 !== null ? <>PM2.5 <b>{Math.round(card.pm25)}</b> · </> : null}wind {Math.round(card.wind)} km/h</span></div>
            </div>
            <div className="yesno">
              <button className="btn solid" onClick={() => answer("yes")}><CheckIcon weight="bold" size={20} />Yes, I’d go</button>
              <button className="btn" onClick={() => answer("no")}><XIcon weight="bold" size={20} />No thanks</button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {canFinish && i < (cards?.length ?? 0) && (
        <button className="linkish" onClick={finish}>That’s enough for now, show my window</button>
      )}
    </main>
  );
}
