import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { api } from "../api";
import { REASONS, formatDuration, formatPoints, formatWhen } from "../format";
import { BackNav } from "../gameModes";
import type { SessionDetail as SessionDetailData } from "../types";

const STATUS: Record<string, string> = {
  finished: "Zaključena",
  active: "V teku",
  preparing: "Priprava",
  aborted: "Prekinjena",
};

export function ResultPage() {
  const { resultId = "" } = useParams();
  return <SessionDetail url={`/api/results/${resultId}/`} backTo="/lestvica" />;
}

export function AdminSessionDetailPage() {
  const { sessionId = "" } = useParams();
  return <SessionDetail url={`/api/admin/sessions/${sessionId}/`} backTo="/nadzor/igre" />;
}

export function SessionDetail({ url, backTo }: { url: string; backTo: string }) {
  const [session, setSession] = useState<SessionDetailData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<SessionDetailData>(url)
      .then(setSession)
      .catch(() => setError("Te igre ni mogoče odpreti."));
  }, [url]);

  return (
    <section className="panel">
      {session ? <p className="eyebrow">Soba {session.code}</p> : null}
      <h1>{session?.nickname || "Igra"}</h1>
      <BackNav to={backTo} />
      {error ? <p className="error">{error}</p> : null}
      {!session && !error ? <p className="status">Nalagam…</p> : null}
      {session ? (
        <>
          <p className="fine">
            {STATUS[session.status] || session.status}
            {session.played_at ? ` · ${formatWhen(session.played_at)}` : ""}
            {session.duration_ms != null ? ` · ${formatDuration(session.duration_ms)}` : ""}
          </p>
          <p>
            {formatPoints(session.score)} točk · nagrada {formatPoints(session.prize_reached)} · bonus{" "}
            {formatPoints(session.speed_bonus)} · {session.correct_count}/{session.total_questions}
          </p>
          {session.reason ? <p>{REASONS[session.reason] || session.reason}</p> : null}
          {session.missing_session ? <p className="fine">Stopnje te igre niso več shranjene.</p> : null}
          <ol className="stages">
            {session.stages.map((stage) => (
              <li key={stage.order} className={stage.is_correct ? "good" : stage.is_correct === false ? "bad" : ""}>
                <p className="fine">
                  {stage.order}. {stage.category_name} · težavnost {stage.difficulty}
                  {stage.time_taken_ms != null ? ` · ${formatDuration(stage.time_taken_ms)}` : ""}
                  {stage.speed_bonus ? ` · bonus ${formatPoints(stage.speed_bonus)}` : ""}
                </p>
                <h2>{stage.text}</h2>
                <p>
                  {stage.timed_out
                    ? "Čas je potekel"
                    : stage.is_correct
                      ? "Pravilno"
                      : stage.is_correct === false
                        ? "Napačno"
                        : "Brez odgovora"}
                </p>
                <p>Odgovor: {stage.given}</p>
                <p>Pravilno: {stage.correct}</p>
                {stage.explanation ? <p>{stage.explanation}</p> : null}
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </section>
  );
}
