import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ApiError, api } from "../api";
import { QuestionPlay } from "../components/QuestionPlay";
import { TimerBar } from "../components/TimerBar";
import { REASONS, formatPoints } from "../format";
import type { GameMessage } from "../types";

export function GamePage() {
  const { code = "" } = useParams();
  const [message, setMessage] = useState<GameMessage | null>(null);
  const [phase, setPhase] = useState("connecting");
  const [error, setError] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const sendAnswer = useCallback((body: Record<string, unknown>) => {
    const socket = wsRef.current;
    const current = message;
    if (!socket || socket.readyState !== WebSocket.OPEN || !current?.question || phaseRef.current !== "question") return;
    setPhase("submitting");
    socket.send(
      JSON.stringify({
        type: "submit_answer",
        game_question_id: current.question.game_question_id,
        ...body,
      }),
    );
  }, [message]);

  const expire = useCallback(() => {
    if (phaseRef.current !== "question") return;
    sendAnswer({ timeout: true });
  }, [sendAnswer]);

  useEffect(() => {
    let stopped = false;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${proto}://${window.location.host}/ws/game/${code}/`);
    wsRef.current = socket;
    socket.onopen = () => {
      if (!stopped) socket.send(JSON.stringify({ type: "start_game" }));
    };
    socket.onmessage = (event) => {
      if (stopped) return;
      const incoming = JSON.parse(event.data) as GameMessage;
      if (incoming.type === "error") {
        setError(incoming.message || "Napaka v igri.");
        setPhase("error");
        return;
      }
      setError("");
      if (incoming.phase === "waiting") {
        setPhase("waiting");
        setMessage(incoming);
        return;
      }
      if (incoming.phase === "question") {
        setMessage(incoming);
        setPhase("question");
        return;
      }
      if (incoming.phase === "review") {
        setMessage(incoming);
        setPhase("review");
        return;
      }
      if (incoming.phase === "finished" || incoming.type === "game_finished") {
        setMessage((current) => ({ ...current, ...incoming }));
        setPhase("finished");
      }
    };
    socket.onclose = () => {
      if (!stopped) {
        setError("Povezava je prekinjena.");
        setPhase("error");
      }
    };
    return () => {
      stopped = true;
      socket.close();
    };
  }, [code]);

  function next() {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "next_question" }));
  }

  const question = message?.question;
  const ladder = message?.prize_ladder ?? [];
  const playing = phase === "question" || phase === "submitting" || phase === "review" || phase === "finished";

  return (
    <section className="stage">
      <div className="play">
        <p className="eyebrow">Soba {code}</p>
        {phase === "connecting" || phase === "waiting" ? <p className="status">Pripravljam vprašanja…</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {question && message && playing ? (
          <>
            <div className="q-meta">
              <span>
                {(message.index ?? 0) + 1} / {message.total}
              </span>
              <span>{question.category_name}</span>
              <span>Težavnost {question.difficulty}</span>
              {phase === "question" && message.stake ? <span>Igraš za {formatPoints(message.stake)}</span> : null}
            </div>
            {phase === "question" && message.deadline_at && message.server_now ? (
              <TimerBar deadlineAt={message.deadline_at} serverNow={message.server_now} onExpire={expire} />
            ) : null}
            <h1>{question.text}</h1>
            {question.image ? <img className="q-image" src={question.image} alt="" /> : null}
            <QuestionPlay question={question} locked={phase !== "question"} result={phase === "question" ? null : message} onSubmit={sendAnswer} />
            {phase === "review" || phase === "finished" ? <Review message={message} onNext={next} /> : null}
          </>
        ) : null}
        {phase === "error" ? (
          <Link className="primary" to="/igra">
            Nazaj na nastavitev
          </Link>
        ) : null}
      </div>
      <ol className="ladder">
        {[...ladder].reverse().map((prize, reversed) => {
          const index = ladder.length - 1 - reversed;
          const reached = index < (message?.correct_count ?? 0);
          const current = phase === "question" && index === message?.index;
          const className = reached ? "reached" : current ? "current" : "";
          return (
            <li key={index} className={className}>
              {formatPoints(prize)}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Review({ message, onNext }: { message: GameMessage; onNext: () => void }) {
  const question = message.question;
  return (
    <div className={message.is_correct ? "review good" : "review bad"}>
      <h2>{message.timed_out ? "Čas je potekel" : message.is_correct ? "Pravilno" : "Napačno"}</h2>
      {message.explanation ? <p>{message.explanation}</p> : null}
      {question && message.correct_option_ids && question.question_type === "ordering" ? (
        <p>Pravilen vrstni red: {message.correct_option_ids.map((id) => question.options?.find((option) => option.id === id)?.text).join(" → ")}</p>
      ) : null}
      {message.correct_pairs ? (
        <ul>
          {message.correct_pairs.map((pair) => (
            <li key={pair.left_id}>
              {pair.left} → {pair.right}
            </li>
          ))}
        </ul>
      ) : null}
      {message.correct_value !== undefined ? (
        <p>
          Pravilno: {formatPoints(message.correct_value)}
          {message.tolerance ? ` (± ${formatPoints(message.tolerance)})` : ""}. Tvoja ocena:{" "}
          {message.selected_value !== undefined ? formatPoints(message.selected_value) : "—"}.
        </p>
      ) : null}
      <p>
        Nagrada {formatPoints(message.prize_reached ?? 0)} + bonus {formatPoints(message.speed_bonus_total ?? 0)} ={" "}
        <strong>{formatPoints(message.score ?? 0)}</strong>
      </p>
      {question ? <Complaint key={question.game_question_id} gameQuestionId={question.game_question_id} /> : null}
      {message.phase === "finished" || message.finished ? (
        <>
          <p>{REASONS[message.reason || ""] || "Igra je končana."}</p>
          <div className="actions">
            <Link className="primary" to="/lestvica">
              Lestvica
            </Link>
            <Link to="/igra">Igraj znova</Link>
          </div>
        </>
      ) : (
        <button type="button" className="primary" onClick={onNext}>
          Naprej{message.next_stake ? ` za ${formatPoints(message.next_stake)}` : ""}
        </button>
      )}
    </div>
  );
}

function Complaint({ gameQuestionId }: { gameQuestionId: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");

  async function send() {
    setError("");
    try {
      const result = await api<{ detail: string }>("/api/reports/", {
        method: "POST",
        body: JSON.stringify({ game_question_id: gameQuestionId, note }),
      });
      setSent(result.detail);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Pritožbe ni bilo mogoče oddati.");
    }
  }

  if (sent) return <p className="fine">{sent}</p>;

  return (
    <div className="stack">
      {open ? (
        <>
          <label>
            Kaj ni v redu?
            <textarea value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <div className="actions">
            <button type="button" className="primary" onClick={() => void send()}>
              Pošlji pritožbo
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              Prekliči
            </button>
          </div>
        </>
      ) : (
        <button type="button" onClick={() => setOpen(true)}>
          Pritožba
        </button>
      )}
    </div>
  );
}
