import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";

import { ApiError, api } from "../api";
import { Avatar } from "../components/Avatar";
import { NumberStepper } from "../components/NumberStepper";
import { formatMode, formatPoints } from "../format";

type CategoryOpt = { slug: string; name: string };
type BotOpt = {
  key: string;
  name: string;
  color: string;
  avatar?: string;
  accuracy?: number;
  modes: string[];
};

type SimResult = {
  room_code: string;
  session_id: number;
  mode: string;
  status: string;
  rounds_played: number;
  reason: string;
  log?: string[];
  results: {
    id: number;
    nickname: string;
    score: number;
    correct_count: number;
    total_questions: number;
    counts_for_leaderboard: boolean;
  }[];
};

type Meta = {
  modes: { key: string; label: string }[];
  categories: CategoryOpt[];
  bots: BotOpt[];
  options: {
    bot_counts: number[];
    question_counts: number[];
    time_limits: number[];
    targets: number[];
    safe_every: number[];
  };
  defaults: {
    mode: string;
    bot_count: number;
    question_count: number;
    time_limit_seconds: number;
    target_score: number;
    safe_every: number;
    sudden_death: boolean;
    count_for_leaderboard: boolean;
    categories: string[];
    bot_keys: string[];
  };
};

const FALLBACK_OPTIONS = {
  bot_counts: [2, 3, 4, 5, 6, 7, 8],
  question_counts: [5, 10, 20, 40],
  time_limits: [30, 60, 90, 120],
  targets: [100, 200, 500, 1000],
  safe_every: [5, 10],
};

/** Panel za Ukazi — simulacija bot tekem. */
export function SimulatePanel() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [mode, setMode] = useState("multiplayer");
  const [botCount, setBotCount] = useState(3);
  const [questionCount, setQuestionCount] = useState(10);
  const [timeLimit, setTimeLimit] = useState(30);
  const [targetScore, setTargetScore] = useState(200);
  const [safeEvery, setSafeEvery] = useState(5);
  const [suddenDeath, setSuddenDeath] = useState(false);
  const [onBoard, setOnBoard] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);
  const [botKeys, setBotKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [statusLine, setStatusLine] = useState("");
  const [result, setResult] = useState<SimResult | null>(null);

  useEffect(() => {
    api<Meta>("/api/admin/simulate/")
      .then((data) => {
        setMeta(data);
        setMode(data.defaults.mode);
        setBotCount(data.defaults.bot_count);
        setQuestionCount(data.defaults.question_count);
        setTimeLimit(data.defaults.time_limit_seconds);
        setTargetScore(data.defaults.target_score);
        setSafeEvery(data.defaults.safe_every);
        setSuddenDeath(data.defaults.sudden_death);
        setOnBoard(data.defaults.count_for_leaderboard);
        setCategories(data.defaults.categories?.length ? data.defaults.categories : data.categories.map((c) => c.slug));
        setBotKeys(data.defaults.bot_keys || []);
      })
      .catch(() => setError("Metapodatkov za simulacijo ni bilo mogoče naložiti."));
  }, []);

  const options = meta?.options || FALLBACK_OPTIONS;

  const botsForMode = useMemo(() => {
    const all = meta?.bots || [];
    return all.filter((bot) => !bot.modes?.length || bot.modes.includes(mode));
  }, [meta, mode]);

  useEffect(() => {
    if (!meta) return;
    const available = new Set(botsForMode.map((b) => b.key));
    setBotKeys((current) => {
      const kept = current.filter((key) => available.has(key));
      if (kept.length >= 2) return kept;
      return botsForMode.map((b) => b.key);
    });
  }, [mode, botsForMode, meta]);

  function toggleCategory(slug: string) {
    setCategories((current) =>
      current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug],
    );
  }

  function toggleBot(key: string) {
    setBotKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (categories.length < 1) {
      setError("Izberi vsaj eno kategorijo.");
      return;
    }
    if (botKeys.length < 2) {
      setError("Izberi vsaj 2 bota.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    setStatusLine("Pripravljam sobo in bote…");
    const tick = window.setInterval(() => {
      setStatusLine((prev) => {
        if (prev.includes("…")) return prev.endsWith("…") ? prev.slice(0, -1) + ".." : prev + ".";
        return prev + "…";
      });
    }, 700);
    try {
      setStatusLine("Zaganjam simulacijo (lahko traja nekaj sekund)…");
      const data = await api<SimResult>("/api/admin/simulate/", {
        method: "POST",
        body: JSON.stringify({
          mode,
          bot_count: botCount,
          bot_keys: botKeys,
          question_count: questionCount,
          time_limit_seconds: timeLimit,
          target_score: targetScore,
          safe_every: safeEvery,
          sudden_death: suddenDeath,
          count_for_leaderboard: onBoard,
          categories,
        }),
      });
      setResult(data);
      setStatusLine(`Končano · ${data.rounds_played} rund · ${data.status}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Simulacija ni uspela.");
      setStatusLine("");
    } finally {
      window.clearInterval(tick);
      setBusy(false);
    }
  }

  const isDirka = mode === "dirka";
  const boardPath =
    mode === "dirka" ? "/lestvica/dirka" : mode === "multiplayer" ? "/lestvica/vec-igralcev" : "/lestvica";

  return (
    <article className="admin-card">
      <h2>Simulacija tekem</h2>
      <p>
        Zažene pravo tekmo z boti (brez živih igralcev), da napolni lestvico in preveri potek. Rezultati botov lahko
        štejejo za javno lestvico.
      </p>
      {error ? <p className="error">{error}</p> : null}
      {statusLine ? <p className="fine sim-status">{statusLine}</p> : null}

      <form className="stack sim-form" onSubmit={onSubmit}>
        <label>
          Način
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            disabled={busy}
          >
            {(meta?.modes || [
              { key: "multiplayer", label: "Hitra tekma" },
              { key: "dirka", label: "Dirka" },
            ]).map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <NumberStepper
          label="Število botov"
          value={botCount}
          options={options.bot_counts}
          onChange={setBotCount}
        />

        {!isDirka ? (
          <NumberStepper
            label="Število vprašanj"
            value={questionCount}
            options={options.question_counts}
            onChange={setQuestionCount}
          />
        ) : (
          <>
            <NumberStepper
              label="Cilj točk"
              value={targetScore}
              options={options.targets}
              onChange={setTargetScore}
            />
            <NumberStepper
              label="Varna zona vsakih"
              value={safeEvery}
              options={options.safe_every}
              onChange={setSafeEvery}
            />
          </>
        )}

        <NumberStepper
          label="Čas na vprašanje"
          value={timeLimit}
          options={options.time_limits}
          format={(v) => `${v} s`}
          onChange={setTimeLimit}
        />

        {!isDirka ? (
          <label className="check">
            <input
              type="checkbox"
              checked={suddenDeath}
              disabled={busy}
              onChange={(e) => setSuddenDeath(e.target.checked)}
            />
            Sudden death
          </label>
        ) : null}

        <label className="check">
          <input
            type="checkbox"
            checked={onBoard}
            disabled={busy}
            onChange={(e) => setOnBoard(e.target.checked)}
          />
          Boti grejo na javno lestvico
        </label>

        <fieldset>
          <legend>
            Boti za {isDirka ? "Dirko" : "Hitra tekma"} ({botKeys.length} izbranih)
          </legend>
          <p className="fine">Število botov zgoraj lahko ponovi profile, če izbereš manj tipov kot število.</p>
          <div className="sim-bot-grid">
            {botsForMode.map((bot) => {
              const on = botKeys.includes(bot.key);
              return (
                <button
                  key={bot.key}
                  type="button"
                  className={`sim-bot-pick ${on ? "is-on" : ""}`}
                  disabled={busy}
                  onClick={() => toggleBot(bot.key)}
                >
                  <Avatar avatar={bot.avatar || "ris"} color={bot.color} size={36} title={bot.name} />
                  <span>
                    <strong>{bot.name}</strong>
                    <span className="fine">{Math.round((bot.accuracy ?? 0.7) * 100)} %</span>
                  </span>
                </button>
              );
            })}
            {botsForMode.length === 0 ? <p className="fine">Ni botov za ta način.</p> : null}
          </div>
          <div className="actions" style={{ marginTop: 8 }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => setBotKeys(botsForMode.map((b) => b.key))}
            >
              Vsi
            </button>
            <button type="button" disabled={busy} onClick={() => setBotKeys([])}>
              Noben
            </button>
          </div>
        </fieldset>

        <fieldset>
          <legend>Kategorije ({categories.length})</legend>
          <div className="choices" style={{ flexWrap: "wrap" }}>
            {(meta?.categories || []).map((cat) => (
              <button
                key={cat.slug}
                type="button"
                className={categories.includes(cat.slug) ? "is-on" : ""}
                disabled={busy}
                onClick={() => toggleCategory(cat.slug)}
              >
                {cat.name}
              </button>
            ))}
          </div>
          <div className="actions" style={{ marginTop: 8 }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => setCategories((meta?.categories || []).map((c) => c.slug))}
            >
              Vse
            </button>
            <button type="button" disabled={busy} onClick={() => setCategories([])}>
              Nobena
            </button>
          </div>
        </fieldset>

        <div className="actions">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Simuliram…" : "Zaženi simulacijo"}
          </button>
        </div>
      </form>

      {result ? (
        <div className="stack" style={{ marginTop: 16 }}>
          <h3>Rezultat</h3>
          <p className="fine">
            {formatMode(result.mode)} · soba {result.room_code} · {result.rounds_played} rund · {result.status}
            {result.reason ? ` · ${result.reason}` : ""}
          </p>
          {result.log?.length ? (
            <div className="sim-log" aria-label="Potek simulacije">
              <strong>Potek</strong>
              <ol>
                {result.log.map((line, index) => (
                  <li key={`${index}-${line.slice(0, 24)}`}>{line}</li>
                ))}
              </ol>
            </div>
          ) : null}
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Igralec</th>
                  <th>Točke</th>
                  <th>Pravilni</th>
                  <th>Lestvica</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((row) => (
                  <tr key={row.id}>
                    <td>{row.nickname}</td>
                    <td>{formatPoints(row.score)}</td>
                    <td>
                      {row.correct_count}/{row.total_questions}
                    </td>
                    <td>{row.counts_for_leaderboard ? "da" : "ne"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions">
            <Link className="primary" to={boardPath}>
              Odpri lestvico
            </Link>
            {result.session_id ? <Link to={`/nadzor/igre/${result.session_id}`}>Seja</Link> : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

/** Stara pot → Ukazi. */
export function AdminSimulatePage() {
  return <Navigate to="/nadzor/ukazi" replace />;
}
