import { useEffect, useRef, useState } from "react";

type Props = {
  deadlineAt: string;
  serverNow: string;
  onExpire: () => void;
};

export function TimerBar({ deadlineAt, serverNow, onExpire }: Props) {
  const [left, setLeft] = useState(0);
  const [total, setTotal] = useState(1);
  const fired = useRef(false);
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
    const id = window.setInterval(() => {
      const remaining = end - (Date.now() + offset);
      setLeft(Math.max(0, remaining));
      if (remaining <= 0 && !fired.current) {
        fired.current = true;
        expireRef.current();
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [deadlineAt]);

  const ratio = Math.max(0, Math.min(1, left / total));
  const seconds = Math.ceil(left / 1000);
  return (
    <div className={seconds <= 5 ? "timer urgent" : "timer"} aria-live="polite">
      <div className="timer-track">
        <div className="timer-bar" style={{ transform: `scaleX(${ratio})` }} />
      </div>
      <span>{seconds}s</span>
    </div>
  );
}
