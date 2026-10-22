import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { SearchField } from "../components/SearchField";
import { api } from "../api";
import { useAuth } from "../auth";
import { formatPoints, formatWhen } from "../format";
import type { ScoreRow } from "../types";

type BoardLimit = "10" | "100" | "all";

export function LeaderboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"board" | "mine">("board");
  const [limit, setLimit] = useState<BoardLimit>("10");
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (submitted.trim()) params.set("q", submitted.trim());
    if (tab === "board") params.set("limit", limit);
    const path = tab === "board" ? "/api/leaderboard/" : "/api/me/results/";
    if (tab === "mine" && !user) {
      setRows([]);
      setTotal(0);
      return;
    }
    api<{ results: ScoreRow[]; total: number }>(`${path}?${params}`)
      .then((data) => {
        setRows(data.results);
        setTotal(data.total);
        setError("");
      })
      .catch(() => setError("Lestvice ni bilo mogoče naložiti."));
  }, [tab, limit, submitted, user]);

  return (
    <section className="panel">
      <p className="eyebrow">Milijonar</p>
      <h1>Lestvica</h1>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "board"} className={tab === "board" ? "is-on" : ""} onClick={() => setTab("board")}>
          Lestvica
        </button>
        <button type="button" role="tab" aria-selected={tab === "mine"} className={tab === "mine" ? "is-on" : ""} onClick={() => setTab("mine")}>
          Moji rezultati
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="toolbar">
        {tab === "board" ? (
          <div className="choices">
            <button type="button" className={limit === "10" ? "is-on" : ""} onClick={() => setLimit("10")}>
              Top 10
            </button>
            <button type="button" className={limit === "100" ? "is-on" : ""} onClick={() => setLimit("100")}>
              Top 100
            </button>
            <button type="button" className={limit === "all" ? "is-on" : ""} onClick={() => setLimit("all")}>
              Vse
            </button>
          </div>
        ) : (
          <p className="fine">Zadnjih 100 iger</p>
        )}
        <SearchField value={query} onChange={setQuery} onSubmit={() => setSubmitted(query)} />
      </div>
      {tab === "mine" && !user ? (
        <p>
          Za zgodovino se <Link to="/prijava">prijavi</Link>.
        </p>
      ) : (
        <>
          <p className="fine">
            {rows.length} od {total}
          </p>
          <ScoreTable rows={rows} empty={tab === "mine" ? "Še nisi končal igre." : "Še ni rezultatov."} onOpen={(row) => navigate(`/lestvica/${row.id}`)} />
        </>
      )}
    </section>
  );
}

function ScoreTable({ rows, empty, onOpen }: { rows: ScoreRow[]; empty: string; onOpen: (row: ScoreRow) => void }) {
  if (!rows.length) return <p className="fine">{empty}</p>;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Igralec</th>
            <th>Točke</th>
            <th>Nagrada</th>
            <th>Pravilni</th>
            <th>Kdaj</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="is-link" onClick={() => onOpen(row)}>
              <td>{row.nickname}</td>
              <td>{formatPoints(row.score)}</td>
              <td>{formatPoints(row.prize_reached)}</td>
              <td>
                {row.correct_count}/{row.total_questions}
              </td>
              <td>{formatWhen(row.played_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
