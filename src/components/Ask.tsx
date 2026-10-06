"use client";

import { useState } from "react";
import { ChatCircleTextIcon, PaperPlaneRightIcon } from "@phosphor-icons/react";
import { api } from "@/lib/client";

type Msg = { role: "you" | "guide"; text: string };

const IDEAS = ["When can I do a 1-hour run tomorrow?", "Why is the afternoon bad?", "What do I usually like?"];

// Chat with the Mastra agent. It has the TabPFN forecast, your history and
// the outing log as tools, and remembers you between visits.
export function Ask({ id }: { id: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(message: string) {
    if (!message.trim() || busy) return;
    setMsgs((m) => [...m, { role: "you", text: message }]);
    setText("");
    setBusy(true);
    try {
      const r = await api<{ text: string }>("/api/chat", { method: "POST", body: JSON.stringify({ id, message }) });
      // Plain text only: drop any markdown emphasis the model slips in.
      setMsgs((m) => [...m, { role: "guide", text: r.text.replace(/\*\*|__|`/g, "") }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "guide", text: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ask">
      <h3 className="display"><ChatCircleTextIcon size={22} />Ask about a plan</h3>
      {msgs.length === 0 && (
        <div className="ideas">
          {IDEAS.map((q) => (
            <button key={q} onClick={() => send(q)} disabled={busy}>{q}</button>
          ))}
        </div>
      )}
      {msgs.length > 0 && (
        <ol className="thread" aria-live="polite">
          {msgs.map((m, i) => (
            <li key={i} className={m.role}>
              <span className="who small">{m.role === "you" ? "You" : "Guide"}</span>
              <p>{m.text}</p>
            </li>
          ))}
          {busy && <li className="guide"><span className="who small">Guide</span><p className="muted">Checking your forecast…</p></li>}
        </ol>
      )}
      <form
        className="search-row"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Is Saturday morning good for a long walk?"
          aria-label="Ask a question"
          maxLength={500}
        />
        <button className="btn" aria-label="Send" disabled={busy}><PaperPlaneRightIcon weight="bold" size={20} /></button>
      </form>
    </section>
  );
}
