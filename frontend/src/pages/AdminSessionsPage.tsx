import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { SearchField } from "../components/SearchField";
import { api } from "../api";
import { REASONS, formatPoints, formatWhen } from "../format";
import type { GameSessionRow } from "../types";

const STATUS: Record<string, string> = {
  finished: "Zaključena",
  active: "V teku",
  preparing: "Priprava",
  aborted: "Prekinjena",
};

export function AdminSessionsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [sessions, setSessions] = useState<GameSessionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (submitted.trim()) params.set("q", submitted.trim());
    api<{ sessions: GameSessionRow[]; total: number }>(`/api/admin/sessions/?${params}`)
      .then((data) => {
        setSessions(data.sessions);
        setTotal(data.total);
      })
      .catch(() => setError("Iger ni bilo mogoče naložiti."));
  }, [submitted]);

  return (
    <section className="panel">
      <p className="eyebrow">Admin</p>
      <h1>Igre</h1>
      <p className="fine">Zaključeno igro lahko odpreš in vidiš vse odigrane stopnje.</p>
      {error ? <p className="error">{error}</p> : null}
      <div className="toolbar">
        <p className="fine">
          {sessions.length} od {total}
        </p>
        <SearchField value={query} onChange={setQuery} onSubmit={() => setSubmitted(query)} />
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Soba</th>
              <th>Igralec</th>
              <th>Stanje</th>
              <th>Točke</th>
              <th>Pravilni</th>
              <th>Kdaj</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr>
                <td colSpan={6}>Ni iger.</td>
              </tr>
            ) : null}
            {sessions.map((session) => {
              const open = session.status === "finished";
              return (
                <tr
                  key={session.id}
                  className={open ? "is-link" : ""}
                  onClick={() => {
                    if (open) navigate(`/nadzor/igre/${session.id}`);
                  }}
                >
                  <td>{session.code}</td>
                  <td>{session.nickname || "—"}</td>
                  <td>{STATUS[session.status] || session.status}</td>
                  <td>{session.score == null ? "—" : formatPoints(session.score)}</td>
                  <td>{session.correct_count == null ? "—" : `${session.correct_count}/${session.total_questions}`}</td>
                  <td>
                    {formatWhen(session.played_at)}
                    {session.reason ? ` · ${REASONS[session.reason] || session.reason}` : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
