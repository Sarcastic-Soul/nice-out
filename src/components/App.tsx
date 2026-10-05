"use client";

import { useSyncExternalStore, useState } from "react";
import { storedId } from "@/lib/client";
import { Welcome } from "./Welcome";
import { Quickstart } from "./Quickstart";
import { Home } from "./Home";

type Screen = "welcome" | "move" | "quick" | "home";

const noop = () => () => {};

export function App() {
  // The id lives in localStorage, so it is only known in the browser.
  const saved = useSyncExternalStore(noop, storedId, () => undefined);
  const [id, setId] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen | null>(null);

  if (saved === undefined) return null;
  const who = id ?? saved;
  const current: Screen = screen ?? (who ? "home" : "welcome");

  if (current === "welcome" || current === "move" || !who)
    return (
      <Welcome
        moving={current === "move"}
        onDone={(newId) => {
          setId(newId);
          setScreen(current === "move" ? "home" : "quick");
        }}
      />
    );
  if (current === "quick") return <Quickstart id={who} onDone={() => setScreen("home")} />;
  return <Home key={who} id={who} onMove={() => setScreen("move")} onTeach={() => setScreen("quick")} />;
}
