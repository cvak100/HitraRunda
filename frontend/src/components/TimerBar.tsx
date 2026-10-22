import { useEffect, useRef, useState } from "react";

type Props = {
  deadlineAt: string;
  serverNow: string;
  onExpire: () => void;
};

export function TimerBar({ deadlineAt, serverNow, onExpire }: Props) {
  const deadline = Date.parse(deadlineAt);
  const server = Date.parse(serverNow);
  const total = Math.max(1, deadline - server);
  const [left, setLeft] = useState(total);
  const fired = useRef(false);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    const end = Date.parse(deadlineAt);
    const offset = Date.parse(serverNow) - Date.now();
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
  }, [deadlineAt, serverNow]);

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
