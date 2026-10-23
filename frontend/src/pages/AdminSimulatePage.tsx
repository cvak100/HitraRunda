import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";

import { ApiError, api } from "../api";
import { Avatar } from "../components/Avatar";
import { CategoryPicker } from "../components/CategoryPicker";
import { NumberStepper } from "../components/NumberStepper";
import { formatMode, formatPoints } from "../format";
import { boardPath as modeBoardPath } from "../gameModes";

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
    hr_question_counts?: number[];
    time_limits: number[];
    hr_time_limits?: number[];
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
  hr_question_counts: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  time_limits: [30, 60, 90, 120],
  hr_time_limits: [10, 15, 20, 30, 45, 60],
  targets: [100, 200, 500, 1000],
  safe_every: [5, 10],
};

const LOBBY_MODES = new Set(["multiplayer", "dirka"]);
const SOLO_MODES = new Set(["hitrarunda", "ala_milijonar", "60_sekund"]);

/** Panel za Ukazi — simulacija bot tekem (privzeto zloženo). */
export function SimulatePanel() {
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [mode, setMode] = useState("multiplayer");
  const [botCount, setBotCount] = useState(3);
  const [questionCount, setQuestionCount] = useState(10);
  const [timeLimit, setTimeLimit] = useState(30);
  const [targetScore, setTargetScore] = useState(200);
  const [safeEvery, setSafeEvery] = useState(5);
  const [suddenDeath, setSuddenDeath] = useState(false);
  const [onBoard, setOnBoard] = useState(true);
  const [playToEnd, setPlayToEnd] = useState(true);
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

  const isLobby = LOBBY_MODES.has(mode);
  const isSolo = SOLO_MODES.has(mode);
  const isDirka = mode === "dirka";
  const isAla = mode === "ala_milijonar";
  const isSixty = mode === "60_sekund";
  const isHitra = mode === "hitrarunda";

  const botsForMode = useMemo(() => {
    const all = meta?.bots || [];
    if (isSolo) return all;
    return all.filter((bot) => !bot.modes?.length || bot.modes.includes(mode));
  }, [meta, mode, isSolo]);

  useEffect(() => {
    if (!meta) return;
    const available = new Set(botsForMode.map((b) => b.key));
    setBotKeys((current) => {
      const kept = current.filter((key) => available.has(key));
      if (isSolo) {
        if (kept.length >= 1) return kept.slice(0, 1);
        return botsForMode[0] ? [botsForMode[0].key] : [];
      }
      if (kept.length >= 2) return kept;
      return botsForMode.map((b) => b.key);
    });
  }, [mode, botsForMode, meta, isSolo]);

  function toggleBot(key: string) {
    if (isSolo) {
      setBotKeys([key]);
      return;
    }
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
    if (isLobby && botKeys.length < 2) {
      setError("Izberi vsaj 2 bota.");
      return;
    }
    if (isSolo && botKeys.length < 1) {
      setError("Izberi bota (profil natančnosti).");
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
          play_to_end: isSolo ? playToEnd : undefined,
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

  const boardPath = modeBoardPath(mode);

  const questionOpts = isHitra
    ? options.hr_question_counts || FALLBACK_OPTIONS.hr_question_counts
    : options.question_counts;
  const timeOpts = isHitra || isAla ? options.hr_time_limits || FALLBACK_OPTIONS.hr_time_limits : options.time_limits;

  return (
    <article className="admin-card admin-card-collapse">
      <button
        type="button"
        className="admin-collapse-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          <h2>Simulacija tekem</h2>
          {!open ? (
            <p className="fine">Zažene tekmo z boti — klikni za nastavitve.</p>
          ) : null}
        </span>
        <span className="admin-collapse-chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <>
      <p>
        Zaženi pravo tekmo z boti (brez živih igralcev), da napolni lestvico in preveri potek. Pri solo načinih
        igra en bot-profil; pri Hitri tekmi/Dirki več botov.
      </p>
      {isSixty ? (
        <p className="fine">
          60 sekund: simulacija ne čaka realnega časa — ob koncu zanke umetno poteka časovni bazen (samo za
          admin seed).
        </p>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      {statusLine ? <p className="fine sim-status">{statusLine}</p> : null}

      <form className="stack sim-form" onSubmit={onSubmit}>
        <fieldset className="sim-mode-field">
          <legend>Način</legend>
          <div className="choices" style={{ flexWrap: "wrap" }} role="group" aria-label="Način">
            {(meta?.modes || [
              { key: "hitrarunda", label: "Hitra runda" },
              { key: "ala_milijonar", label: "Ala milijonar" },
              { key: "multiplayer", label: "Hitra tekma" },
              { key: "dirka", label: "Dirka" },
              { key: "60_sekund", label: "60 sekund" },
            ]).map((item) => (
              <button
                key={item.key}
                type="button"
                className={mode === item.key ? "is-on" : ""}
                disabled={busy}
                onClick={() => setMode(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </fieldset>

        {isLobby ? (
          <NumberStepper
            label="Število botov"
            value={botCount}
            options={options.bot_counts}
            onChange={setBotCount}
          />
        ) : null}

        {isDirka ? (
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
        ) : null}

        {isHitra || mode === "multiplayer" ? (
          <NumberStepper
            label="Število vprašanj"
            value={questionCount}
            options={questionOpts}
            onChange={setQuestionCount}
          />
        ) : null}

        {!isDirka && !isSixty && !isAla ? (
          <NumberStepper
            label="Čas na vprašanje"
            value={timeLimit}
            options={timeOpts}
            format={(v) => `${v} s`}
            onChange={setTimeLimit}
          />
        ) : null}

        {mode === "multiplayer" ? (
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
          {isSolo ? "Rezultat gre na javno lestvico" : "Boti grejo na javno lestvico"}
        </label>

        {isSolo && !isSixty ? (
          <label className="check">
            <input
              type="checkbox"
              checked={playToEnd}
              disabled={busy}
              onChange={(e) => setPlayToEnd(e.target.checked)}
            />
            Igraj do konca (100 % natančnost — seed lestvice)
          </label>
        ) : null}

        <fieldset>
          <legend>
            {isSolo
              ? `Bot profil (${botKeys.length ? "1 izbran" : "izberi"})`
              : `Boti (${botKeys.length} izbranih)`}
          </legend>
          <p className="fine">
            {isSolo
              ? "Solo tekmo odigra izbrani bot (natančnost in ime na lestvici)."
              : "Število botov zgoraj lahko ponovi profile, če izbereš manj tipov kot število."}
          </p>
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
            {botsForMode.length === 0 ? <p className="fine">Ni botov.</p> : null}
          </div>
          {isLobby ? (
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
          ) : null}
        </fieldset>

        <CategoryPicker
          categories={meta?.categories || []}
          value={categories}
          onChange={setCategories}
          disabled={busy}
          showSelectAll
        />

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
        </>
      ) : null}
    </article>
  );
}

/** Panel za Ukazi — generira N random botov z nastavljivimi parametri. */
export function GenerateBotsPanel() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(10);
  const [accuracyMin, setAccuracyMin] = useState(55);
  const [accuracyMax, setAccuracyMax] = useState(85);
  const [delayMin, setDelayMin] = useState(1.2);
  const [delayMax, setDelayMax] = useState(7.5);
  const [modes, setModes] = useState<string[]>(["multiplayer", "dirka"]);
  const [onBoard, setOnBoard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createdNames, setCreatedNames] = useState<string[]>([]);

  function toggleMode(mode: string) {
    setModes((current) =>
      current.includes(mode) ? current.filter((item) => item !== mode) : [...current, mode],
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (modes.length < 1) {
      setError("Izberi vsaj en način.");
      return;
    }
    if (accuracyMin > accuracyMax) {
      setError("Min. natančnost ne sme biti večja od max.");
      return;
    }
    if (delayMin > delayMax) {
      setError("Min. zakasnitev ne sme biti večja od max.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    setCreatedNames([]);
    try {
      const data = await api<{ detail: string; created: number; bots: { name: string }[] }>(
        "/api/admin/bots/generate/",
        {
          method: "POST",
          body: JSON.stringify({
            count,
            accuracy_min: accuracyMin / 100,
            accuracy_max: accuracyMax / 100,
            delay_min: delayMin,
            delay_max: delayMax,
            modes,
            count_for_leaderboard: onBoard,
            is_active: true,
          }),
        },
      );
      setNotice(data.detail);
      setCreatedNames((data.bots || []).map((b) => b.name));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Generiranje ni uspelo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="admin-card admin-card-collapse">
      <button
        type="button"
        className="admin-collapse-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          <h2>Novi random boti</h2>
          {!open ? <p className="fine">Ustvari N botov z nastavljenimi parametri.</p> : null}
        </span>
        <span className="admin-collapse-chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <>
          <p>
            Doda nove bote z naključnimi imeni/avatarji. Natančnost vsakega bota je naključna znotraj tvojega
            razpona; zakasnitev ostane v nastavljenem oknu.
          </p>
          {error ? <p className="error">{error}</p> : null}
          {notice ? <p className="fine sim-status">{notice}</p> : null}

          <form className="stack sim-form" onSubmit={onSubmit}>
            <NumberStepper
              label="Število botov"
              value={count}
              min={1}
              max={50}
              step={1}
              onChange={setCount}
            />
            <NumberStepper
              label="Natančnost min %"
              value={accuracyMin}
              min={0}
              max={100}
              step={5}
              format={(v) => `${v} %`}
              onChange={setAccuracyMin}
            />
            <NumberStepper
              label="Natančnost max %"
              value={accuracyMax}
              min={0}
              max={100}
              step={5}
              format={(v) => `${v} %`}
              onChange={setAccuracyMax}
            />
            <NumberStepper
              label="Zakasnitev min (s)"
              value={delayMin}
              min={0.2}
              max={20}
              step={0.1}
              format={(v) => `${v.toFixed(1)} s`}
              onChange={(v) => setDelayMin(Math.round(v * 10) / 10)}
            />
            <NumberStepper
              label="Zakasnitev max (s)"
              value={delayMax}
              min={0.5}
              max={30}
              step={0.5}
              format={(v) => `${v.toFixed(1)} s`}
              onChange={(v) => setDelayMax(Math.round(v * 10) / 10)}
            />

            <fieldset>
              <legend>Načini</legend>
              <div className="choices" style={{ flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={modes.includes("multiplayer") ? "is-on" : ""}
                  disabled={busy}
                  onClick={() => toggleMode("multiplayer")}
                >
                  Hitra tekma
                </button>
                <button
                  type="button"
                  className={modes.includes("dirka") ? "is-on" : ""}
                  disabled={busy}
                  onClick={() => toggleMode("dirka")}
                >
                  Dirka
                </button>
              </div>
            </fieldset>

            <label className="check">
              <input
                type="checkbox"
                checked={onBoard}
                disabled={busy}
                onChange={(e) => setOnBoard(e.target.checked)}
              />
              Boti grejo na javno lestvico
            </label>

            <div className="actions">
              <button type="submit" className="primary" disabled={busy}>
                {busy ? "Ustvarjam…" : `Ustvari ${count} botov`}
              </button>
            </div>
          </form>

          {createdNames.length ? (
            <p className="fine" style={{ marginTop: 12 }}>
              {createdNames.join(" · ")}
            </p>
          ) : null}
        </>
      ) : null}
    </article>
  );
}

/** Stara pot → Ukazi. */
export function AdminSimulatePage() {
  return <Navigate to="/nadzor/ukazi" replace />;
}
