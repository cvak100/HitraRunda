import { useEffect, useRef, useState } from "react";

import { playSfx, startSixtyTensionClock, stopSixtyTensionClock } from "../sound";

type Props = {
  deadlineAt: string;
  serverNow: string;
  onExpire: () => void;
  /** Poudari števiko (npr. 60 sekund). */
  emphasizeNumber?: boolean;
  /** 60 s: naraščajoči tick-clock (sixty_tension_b) namesto urgent tick ob ≤5 s. */
  tensionClock?: boolean;
};

export function TimerBar({
  deadlineAt,
  serverNow,
  onExpire,
  emphasizeNumber = false,
  tensionClock = false,
}: Props) {
  const [left, setLeft] = useState(0);
  const [total, setTotal] = useState(1);
  const fired = useRef(false);
  const lastTickSecond = useRef<number | null>(null);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;
  // Sync clock offset only when the deadline itself changes — not on every
  // answer_progress broadcast (those refresh server_now and would refill the bar).
  const serverNowRef = useRef(serverNow);
  serverNowRef.current = serverNow;

  useEffect(() => {
    const end = Date.parse(deadlineAt);
    const offset = Date.parse(serverNowRef.current) - Date.now();
    const initialLeft = Math.max(0, end - (Date.now() + offset));
    setTotal(Math.max(1, initialLeft));
    setLeft(initialLeft);
    fired.current = false;
    lastTickSecond.current = null;

    if (tensionClock) {
      // Skala ~60 s: več časa = mirnejši tick; proti 0 = hitreje/višje.
      const SCALE_MS = 60_000;
      startSixtyTensionClock(() => {
        const remaining = Math.max(0, end - (Date.now() + offset));
        return Math.min(1, remaining / SCALE_MS);
      });
    } else {
      stopSixtyTensionClock();
    }

    const id = window.setInterval(() => {
      const remaining = end - (Date.now() + offset);
      setLeft(Math.max(0, remaining));
      const sec = Math.ceil(Math.max(0, remaining) / 1000);
      if (!tensionClock && sec <= 5 && sec > 0 && lastTickSecond.current !== sec) {
        lastTickSecond.current = sec;
        playSfx("tick");
      }
      if (remaining <= 0 && !fired.current) {
        fired.current = true;
        if (tensionClock) stopSixtyTensionClock();
        expireRef.current();
      }
    }, 100);
    return () => {
      window.clearInterval(id);
      if (tensionClock) stopSixtyTensionClock();
    };
  }, [deadlineAt, tensionClock]);

  const ratio = Math.max(0, Math.min(1, left / total));
  const seconds = Math.ceil(left / 1000);
  const urgent = seconds <= 5;

  return (
    <div
      className={["timer", urgent ? "urgent" : "", emphasizeNumber ? "timer-emphasis" : ""]
        .filter(Boolean)
        .join(" ")}
      aria-live="polite"
      aria-label={`Še ${seconds} sekund`}
    >
      <div className="timer-track">
        <div className="timer-bar" style={{ transform: `scaleX(${ratio})` }} />
      </div>
      <span className="timer-seconds">{seconds}s</span>
    </div>
  );
}
