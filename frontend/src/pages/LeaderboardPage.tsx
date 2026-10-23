import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";

import { SortableTh } from "../components/AdminToolbar";
import { SearchField } from "../components/SearchField";
import { api } from "../api";
import { useAuth } from "../auth";
import { formatMode, formatPoints, formatWhen } from "../format";
import type { GameMode, ScoreRow } from "../types";

type SortKey = "nickname" | "score" | "prize_reached" | "correct_count" | "played_at";

type BoardLimit = "10" | "100" | "all";

function modeFromPath(pathname: string): GameMode {
  if (pathname.includes("/ala-milijonar")) return "ala_milijonar";
  if (pathname.includes("/vec-igralcev")) return "multiplayer";
  return "hitrarunda";
}

export function LeaderboardPage() {
  const location = useLocation();
  const mode = modeFromPath(location.pathname);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mine, setMine] = useState(false);
  const [limit, setLimit] = useState<BoardLimit>("10");
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    setMine(false);
    setQuery("");
    setSubmitted("");
  }, [mode]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("mode", mode);
    if (submitted.trim()) params.set("q", submitted.trim());
    if (!mine) params.set("limit", limit);
    if (mine && !user) {
      setRows([]);
      setTotal(0);
      setError("");
      return;
    }
    const path = mine ? "/api/me/results/" : "/api/leaderboard/";
    api<{ results: ScoreRow[]; total: number }>(`${path}?${params}`)
      .then((data) => {
        setRows(data.results);
        setTotal(data.total);
        setError("");
      })
      .catch(() => setError("Lestvice ni bilo mogoče naložiti."));
  }, [mine, limit, submitted, user, mode]);

  return (
    <section className="panel">
      <p className="eyebrow">Lestvica</p>
      <h1>{formatMode(mode)}</h1>

      <div className="tabs content-tabs" role="tablist" aria-label="Igra">
        <NavLink to="/lestvica/hitrarunda" role="tab" end>
          Hitra runda
        </NavLink>
        <NavLink to="/lestvica/ala-milijonar" role="tab">
          Ala milijonar
        </NavLink>
        <NavLink to="/lestvica/vec-igralcev" role="tab">
          Več igralcev
        </NavLink>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="board-toolbar">
        <div className="board-toolbar-start">
          <button type="button" className="board-mine-btn" onClick={() => setMine((current) => !current)}>
            <span className={mine ? undefined : "is-shown"}>Moji rezultati</span>
            <span className={mine ? "is-shown" : undefined}>Nazaj na lestvico</span>
          </button>
        </div>
        <div className="board-toolbar-center">
          <div className={`choices${mine ? " is-ghost" : ""}`} role="group" aria-label="Obseg" aria-hidden={mine}>
            <button type="button" className={limit === "10" ? "is-on" : ""} onClick={() => setLimit("10")} tabIndex={mine ? -1 : undefined}>
              Top 10
            </button>
            <button type="button" className={limit === "100" ? "is-on" : ""} onClick={() => setLimit("100")} tabIndex={mine ? -1 : undefined}>
              Top 100
            </button>
            <button type="button" className={limit === "all" ? "is-on" : ""} onClick={() => setLimit("all")} tabIndex={mine ? -1 : undefined}>
              Vsi
            </button>
          </div>
          {mine ? <p className="fine board-mine-note">Zadnjih 100 iger v tem načinu</p> : null}
        </div>
        <div className="board-toolbar-end">
          <div className={mine ? "is-ghost" : undefined} aria-hidden={mine}>
            <SearchField value={query} onChange={setQuery} onSubmit={() => setSubmitted(query)} />
          </div>
        </div>
      </div>

      {mine && !user ? (
        <p>
          Za zgodovino se <Link to="/prijava">prijavi</Link>.
        </p>
      ) : (
        <>
          <p className="fine">
            {rows.length} od {total}
          </p>
          <ScoreTable
            rows={rows}
            empty={mine ? "Še nisi končal igre." : "Še ni rezultatov."}
            defaultSort={mine ? "played_at" : "score"}
            onOpen={(row) => navigate(`/lestvica/rezultat/${row.id}`)}
          />
        </>
      )}
    </section>
  );
}

function sortValue(row: ScoreRow, key: SortKey) {
  if (key === "played_at") return new Date(row.played_at).getTime();
  if (key === "nickname") return row.nickname.toLowerCase();
  return row[key] ?? 0;
}

function ScoreTable({
  rows,
  empty,
  onOpen,
  defaultSort,
}: {
  rows: ScoreRow[];
  empty: string;
  onOpen: (row: ScoreRow) => void;
  defaultSort: SortKey;
}) {
  const [sort, setSort] = useState<SortKey>(defaultSort);
  const [direction, setDirection] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    setSort(defaultSort);
    setDirection("desc");
  }, [defaultSort]);

  const sorted = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      const av = sortValue(a, sort);
      const bv = sortValue(b, sort);
      const cmp = typeof av === "string" ? av.localeCompare(String(bv), "sl") : Number(av) - Number(bv);
      return direction === "asc" ? cmp : -cmp;
    });
    return list;
  }, [rows, sort, direction]);

  function toggleSort(column: string) {
    const key = column as SortKey;
    if (sort === key) setDirection((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDirection(key === "nickname" ? "asc" : "desc");
    }
  }

  if (!rows.length) return <p className="fine">{empty}</p>;

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <SortableTh label="Igralec" column="nickname" sort={sort} direction={direction} onSort={toggleSort} />
            <SortableTh label="Točke" column="score" sort={sort} direction={direction} onSort={toggleSort} />
            <SortableTh label="Nagrada" column="prize_reached" sort={sort} direction={direction} onSort={toggleSort} />
            <SortableTh label="Pravilni" column="correct_count" sort={sort} direction={direction} onSort={toggleSort} />
            <SortableTh label="Kdaj" column="played_at" sort={sort} direction={direction} onSort={toggleSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
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
