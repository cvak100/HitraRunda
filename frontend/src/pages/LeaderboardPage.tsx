import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";

import { SortableTh } from "../components/AdminToolbar";
import { Avatar } from "../components/Avatar";
import { Modal } from "../components/Modal";
import { SearchField, SearchIcon } from "../components/SearchField";
import { api } from "../api";
import { useAuth } from "../auth";
import { formatDuration, formatMode, formatPoints, formatWhen } from "../format";
import type { GameMode, OverallRow, ScoreRow } from "../types";

type SortKey = "nickname" | "score" | "prize_reached" | "correct_count" | "played_at" | "duration_ms";
type OverallSortKey = "nickname" | "total_points" | "wins" | "games";
type BoardView = "best" | "totals";

type BoardLimit = "10" | "100" | "all";

function modeFromPath(pathname: string): GameMode {
  if (pathname.includes("/ala-milijonar")) return "ala_milijonar";
  if (pathname.includes("/vec-igralcev")) return "multiplayer";
  if (pathname.includes("/dirka")) return "dirka";
  if (pathname.includes("/60-sekund")) return "60_sekund";
  return "hitrarunda";
}

export function LeaderboardPage() {
  const location = useLocation();
  const mode = modeFromPath(location.pathname);
  const showWins = mode === "multiplayer" || mode === "dirka";
  const { user } = useAuth();
  const navigate = useNavigate();
  const [boardView, setBoardView] = useState<BoardView>("best");
  const [mine, setMine] = useState(false);
  const [limit, setLimit] = useState<BoardLimit>("10");
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [totalsRows, setTotalsRows] = useState<OverallRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  const isTotals = boardView === "totals" && !mine;
  const hasSearch = Boolean(submitted.trim());

  useEffect(() => {
    setQuery("");
    setSubmitted("");
    setSearchOpen(false);
  }, [mode]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("mode", mode);
    if (submitted.trim()) params.set("q", submitted.trim());
    if (!mine) params.set("limit", limit);

    if (isTotals) {
      params.set("view", "totals");
      api<{ results: OverallRow[]; total: number }>(`/api/leaderboard/?${params}`)
        .then((data) => {
          setTotalsRows(data.results);
          setRows([]);
          setTotal(data.total);
          setError("");
        })
        .catch(() => setError("Lestvice ni bilo mogoče naložiti."));
      return;
    }

    if (mine && !user) {
      setRows([]);
      setTotalsRows([]);
      setTotal(0);
      setError("");
      return;
    }
    const path = mine ? "/api/me/results/" : "/api/leaderboard/";
    api<{ results: ScoreRow[]; total: number }>(`${path}?${params}`)
      .then((data) => {
        setRows(data.results);
        setTotalsRows([]);
        setTotal(data.total);
        setError("");
      })
      .catch(() => setError("Lestvice ni bilo mogoče naložiti."));
  }, [mine, limit, submitted, user, mode, isTotals]);

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
          Hitra tekma
        </NavLink>
        <NavLink to="/lestvica/dirka" role="tab">
          Dirka
        </NavLink>
        <NavLink to="/lestvica/60-sekund" role="tab">
          60 sekund
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
          {!mine ? (
            <div className="choices" role="group" aria-label="Pogled">
              <button
                type="button"
                className={boardView === "best" ? "is-on" : ""}
                onClick={() => setBoardView("best")}
              >
                Najboljši
              </button>
              <button
                type="button"
                className={boardView === "totals" ? "is-on" : ""}
                onClick={() => setBoardView("totals")}
              >
                Skupno
              </button>
            </div>
          ) : (
            <p className="fine board-mine-note">Zadnjih 100 iger v tem načinu</p>
          )}
        </div>
        <div className="board-toolbar-end" aria-hidden="true" />
      </div>

      <Modal title="Išči na lestvici" open={searchOpen} onClose={() => setSearchOpen(false)}>
        <SearchField
          value={query}
          onChange={setQuery}
          autoFocus
          onSubmit={() => {
            setSubmitted(query);
            setSearchOpen(false);
          }}
        />
        <div className="actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="primary"
            onClick={() => {
              setSubmitted(query);
              setSearchOpen(false);
            }}
          >
            Išči
          </button>
          {hasSearch || query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSubmitted("");
                setSearchOpen(false);
              }}
            >
              Počisti
            </button>
          ) : null}
        </div>
      </Modal>

      {mine && !user ? (
        <p>
          Za zgodovino se <Link to="/prijava">prijavi</Link>.
        </p>
      ) : (
        <>
          <div className="board-count-row">
            <p className="fine">
              {(isTotals ? totalsRows.length : rows.length)} od {total}
            </p>
            {!mine ? (
              <div className="board-count-controls">
                <div className="choices choices-compact" role="group" aria-label="Obseg">
                  <button type="button" className={limit === "10" ? "is-on" : ""} onClick={() => setLimit("10")}>
                    Top 10
                  </button>
                  <button type="button" className={limit === "100" ? "is-on" : ""} onClick={() => setLimit("100")}>
                    Top 100
                  </button>
                  <button type="button" className={limit === "all" ? "is-on" : ""} onClick={() => setLimit("all")}>
                    Vsi
                  </button>
                </div>
                <button
                  type="button"
                  className={`icon-button board-search-btn${hasSearch ? " is-on" : ""}`}
                  aria-label={hasSearch ? `Iskanje: ${submitted}` : "Išči"}
                  title={hasSearch ? submitted : "Išči"}
                  onClick={() => setSearchOpen(true)}
                >
                  <SearchIcon />
                </button>
              </div>
            ) : null}
          </div>
          {isTotals ? (
            <TotalsTable rows={totalsRows} empty="Še ni rezultatov." showWins={showWins} />
          ) : (
            <ScoreTable
              rows={rows}
              empty={mine ? "Še nisi končal igre." : "Še ni rezultatov."}
              defaultSort={mine ? "played_at" : "score"}
              mode={mode}
              onOpen={(row) => navigate(`/lestvica/rezultat/${row.id}`)}
            />
          )}
        </>
      )}
    </section>
  );
}

function sortValue(row: ScoreRow, key: SortKey) {
  if (key === "played_at") return new Date(row.played_at).getTime();
  if (key === "nickname") return row.nickname.toLowerCase();
  if (key === "duration_ms") return row.duration_ms ?? 0;
  return row[key] ?? 0;
}

function ScoreTable({
  rows,
  empty,
  onOpen,
  defaultSort,
  mode,
}: {
  rows: ScoreRow[];
  empty: string;
  onOpen: (row: ScoreRow) => void;
  defaultSort: SortKey;
  mode: GameMode;
}) {
  const [sort, setSort] = useState<SortKey>(defaultSort);
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const isSixty = mode === "60_sekund";
  const showPrize = mode === "hitrarunda" || mode === "ala_milijonar";

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
            <SortableTh
              label={isSixty ? "Pravilni" : "Točke"}
              column="score"
              sort={sort}
              direction={direction}
              onSort={toggleSort}
            />
            {isSixty ? (
              <SortableTh label="Vprašanj" column="correct_count" sort={sort} direction={direction} onSort={toggleSort} />
            ) : null}
            {showPrize ? (
              <SortableTh label="Nagrada" column="prize_reached" sort={sort} direction={direction} onSort={toggleSort} />
            ) : null}
            {isSixty ? (
              <SortableTh label="Čas" column="duration_ms" sort={sort} direction={direction} onSort={toggleSort} />
            ) : (
              <SortableTh label="Pravilni" column="correct_count" sort={sort} direction={direction} onSort={toggleSort} />
            )}
            <SortableTh label="Kdaj" column="played_at" sort={sort} direction={direction} onSort={toggleSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.id} className="is-link" onClick={() => onOpen(row)}>
              <td>
                <span className="board-player">
                  <Avatar avatar={row.avatar} color={row.preferred_color || "#7dcea0"} size={32} title={row.nickname} />
                  <span>{row.nickname}</span>
                </span>
              </td>
              <td>{formatPoints(row.score)}</td>
              {isSixty ? (
                <td>
                  {row.correct_count}/{row.total_questions}
                </td>
              ) : null}
              {showPrize ? <td>{formatPoints(row.prize_reached)}</td> : null}
              {isSixty ? (
                <td>{formatDuration(row.duration_ms)}</td>
              ) : (
                <td>
                  {row.correct_count}/{row.total_questions}
                </td>
              )}
              <td>{formatWhen(row.played_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TotalsTable({
  rows,
  empty,
  showWins,
}: {
  rows: OverallRow[];
  empty: string;
  showWins: boolean;
}) {
  const [sort, setSort] = useState<OverallSortKey>("total_points");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      const av = sort === "nickname" ? a.nickname.toLowerCase() : a[sort];
      const bv = sort === "nickname" ? b.nickname.toLowerCase() : b[sort];
      const cmp = typeof av === "string" ? av.localeCompare(String(bv), "sl") : Number(av) - Number(bv);
      return direction === "asc" ? cmp : -cmp;
    });
    return list;
  }, [rows, sort, direction]);

  function toggleSort(column: string) {
    const key = column as OverallSortKey;
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
            <SortableTh label="Skupaj točk" column="total_points" sort={sort} direction={direction} onSort={toggleSort} />
            {showWins ? (
              <SortableTh label="Zmage" column="wins" sort={sort} direction={direction} onSort={toggleSort} />
            ) : null}
            <SortableTh label="Igre" column="games" sort={sort} direction={direction} onSort={toggleSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.user_id}>
              <td>
                <span className="board-player">
                  <Avatar avatar={row.avatar} color={row.preferred_color || "#7dcea0"} size={32} title={row.nickname} />
                  <span>{row.nickname}</span>
                </span>
              </td>
              <td>{formatPoints(row.total_points)}</td>
              {showWins ? <td>{row.wins}</td> : null}
              <td>{row.games}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
