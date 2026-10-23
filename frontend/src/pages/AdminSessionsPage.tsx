import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AdminToolbar, SortableTh } from "../components/AdminToolbar";
import { api } from "../api";
import { REASONS, formatPoints, formatWhen } from "../format";
import type { GameSessionRow } from "../types";

const STATUS: Record<string, string> = {
  finished: "Zaključena",
  active: "V teku",
  preparing: "Priprava",
  aborted: "Prekinjena",
};

type SortKey = "code" | "nickname" | "status" | "score" | "correct_count" | "played_at";

export function AdminSessionsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [sessions, setSessions] = useState<GameSessionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<SortKey>("played_at");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");

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

  const rows = useMemo(() => {
    const list = [...sessions];
    list.sort((a, b) => {
      let cmp = 0;
      if (sort === "played_at") cmp = new Date(a.played_at).getTime() - new Date(b.played_at).getTime();
      else if (sort === "nickname" || sort === "code" || sort === "status") {
        cmp = String(a[sort] ?? "").localeCompare(String(b[sort] ?? ""), "sl", { numeric: true });
      } else {
        cmp = Number(a[sort] ?? -1) - Number(b[sort] ?? -1);
      }
      return direction === "asc" ? cmp : -cmp;
    });
    return list;
  }, [sessions, sort, direction]);

  function toggleSort(column: string) {
    const key = column as SortKey;
    if (sort === key) setDirection((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDirection(key === "nickname" || key === "code" || key === "status" ? "asc" : "desc");
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Admin</p>
      <h1>Igre</h1>
      <p className="fine">Zaključeno igro lahko odpreš in vidiš vse odigrane stopnje.</p>
      {error ? <p className="error">{error}</p> : null}
      <AdminToolbar query={query} onQueryChange={setQuery} onSearch={() => setSubmitted(query)} />
      <p className="fine">
        {rows.length} od {total}
      </p>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh label="Soba" column="code" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Igralec" column="nickname" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Stanje" column="status" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Točke" column="score" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Pravilni" column="correct_count" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Kdaj" column="played_at" sort={sort} direction={direction} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6}>Ni iger.</td>
              </tr>
            ) : null}
            {rows.map((session) => {
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
