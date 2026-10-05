"use client";

import type { Hour } from "./weather";
import type { Outlook } from "./outlook";

export type { Hour, Outlook };

const KEY = "nice-out:id";

export function storedId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function newId() {
  const id = crypto.randomUUID();
  try {
    localStorage.setItem(KEY, id);
  } catch {}
  return id;
}

export function forget() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j as T;
}

// "6:00" and "am" separately, so the hero can set them at different sizes.
export function clock(ts: string, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).formatToParts(new Date(ts));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { time: `${get("hour")}:${get("minute")}`, ampm: get("dayPeriod").toLowerCase() };
}

export function hourLabel(ts: string, tz: string) {
  const c = clock(ts, tz);
  return `${c.time.replace(":00", "")} ${c.ampm}`;
}

export function dayLabel(ts: string, tz: string) {
  const d = new Date(ts);
  const fmt = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(x);
  const today = fmt(new Date());
  const tomorrow = fmt(new Date(Date.now() + 86400_000));
  const yesterday = fmt(new Date(Date.now() - 86400_000));
  const key = fmt(d);
  if (key === today) return "Today";
  if (key === tomorrow) return "Tomorrow";
  if (key === yesterday) return "Yesterday";
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(d);
}

export function todayLine(tz: string) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(new Date());
}
