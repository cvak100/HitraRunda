import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { SearchField } from "../components/SearchField";
import { api } from "../api";
import { useAuth } from "../auth";
import { formatMode, formatPoints, formatWhen } from "../format";
import type { GameMode, ScoreRow } from "../types";

type BoardLimit = "10" | "100" | "all";

function modeFromPath(pathname: string): GameMode | null {
  if (pathname.includes("/ala-milijonar")) return "ala_milijonar";
  if (pathname.includes("/hitrarunda")) return "hitrarunda";
  return null;
}

export function LeaderboardHubPage() {
  return (
    <section className="panel">
      <p className="eyebrow">Lestvice</p>
      <h1>Izberi igro</h1>
      <div className="game-split">
        <div className="game-block">
          <p className="eyebrow">Hitra runda</p>
          <h2>Lestvica Hitra runda</h2>
          <p>Rezultati kratkih rund brez jokerjev.</p>
          <Link className="primary" to="/lestvica/hitrarunda">
            Odpri lestvico
          </Link>
        </div>
        <div className="game-block">
          <p className="eyebrow">Ala milijonar</p>
          <h2>Lestvica Ala milijonar</h2>
          <p>Rezultati 15-stopenjskih iger z jokerji.</p>
          <Link className="primary" to="/lestvica/ala-milijonar">
            Odpri lestvico
          </Link>
        </div>
      </div>
    </section>
  );
}

export function LeaderboardPage() {
  const location = useLocation();
  const mode = modeFromPath(location.pathname);
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
    if (!mode) return;
    const params = new URLSearchParams();
    params.set("mode", mode);
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
  }, [tab, limit, submitted, user, mode]);

  if (!mode) {
    return (
      <section className="panel">
        <p className="error">Neznana lestvica.</p>
        <Link to="/lestvica">Nazaj</Link>
      </section>
    );
  }

  return (
    <section className="panel">
      <p className="eyebrow">{formatMode(mode)}</p>
      <h1>Lestvica</h1>
      <p className="fine">
        <Link to="/lestvica">← Druge lestvice</Link>
        {" · "}
        <Link to={mode === "ala_milijonar" ? "/igra/ala-milijonar" : "/igra/hitrarunda"}>Igraj</Link>
      </p>
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
          <p className="fine">Zadnjih 100 iger v tem načinu</p>
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
          <ScoreTable rows={rows} empty={tab === "mine" ? "Še nisi končal igre." : "Še ni rezultatov."} onOpen={(row) => navigate(`/lestvica/rezultat/${row.id}`)} />
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
