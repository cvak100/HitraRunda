import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ApiError, api } from "../api";
import { ConfirmModal } from "../components/ConfirmModal";
import { DirkaBonusBar, DirkaRaceTrack } from "../components/DirkaRaceTrack";
import { NumberStepper } from "../components/NumberStepper";
import { QuestionPlay } from "../components/QuestionPlay";
import { TimerBar } from "../components/TimerBar";
import { REASONS, formatDuration, formatMode, formatPoints } from "../format";
import type { Category, GameMessage, StandingRow } from "../types";

const LOBBY_TIMES = [30, 60, 90, 120, 300];
const LOBBY_COUNTS = [5, 10, 20, 40, 50, 100];

function formatLobbyTime(seconds: number) {
  if (seconds < 120) return `${seconds} s`;
  return `${seconds / 60} min`;
}

export function GamePage() {
  const { code = "" } = useParams();
  const [message, setMessage] = useState<GameMessage | null>(null);
  const [phase, setPhase] = useState("connecting");
  const [error, setError] = useState("");
  const [pickFriend, setPickFriend] = useState(false);
  const [myId, setMyId] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [editCount, setEditCount] = useState(10);
  const [editSeconds, setEditSeconds] = useState(60);
  const [editMax, setEditMax] = useState(4);
  const [editVisibility, setEditVisibility] = useState<"public" | "private" | "unlisted">("public");
  const [editPassword, setEditPassword] = useState("");
  const [editSudden, setEditSudden] = useState(false);
  const [editBots, setEditBots] = useState(0);
  const [editTarget, setEditTarget] = useState(200);
  const [editSafe, setEditSafe] = useState(5);
  const [editCats, setEditCats] = useState<string[]>([]);
  const [copyNotice, setCopyNotice] = useState("");
  const [confirmWalkAway, setConfirmWalkAway] = useState(false);
  const [sixtyFlash, setSixtyFlash] = useState<GameMessage["feedback"] | null>(null);
  const [sixtyTickKey, setSixtyTickKey] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const myIdRef = useRef(myId);
  myIdRef.current = myId;
  const isLobbyMode = message?.mode === "multiplayer" || message?.mode === "dirka" || phase === "lobby";
  const isMulti = isLobbyMode;
  const isDirka = message?.mode === "dirka";
  const isSixty = message?.mode === "60_sekund";

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
    api<{ categories: Category[] }>("/api/categories/")
      .then((data) => setCategories(data.categories))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (!sixtyFlash) return;
    const id = window.setTimeout(() => setSixtyFlash(null), 900);
    return () => window.clearTimeout(id);
  }, [sixtyFlash, sixtyTickKey]);

  useEffect(() => {
    let stopped = false;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${proto}://${window.location.host}/ws/game/${code}/`);
    wsRef.current = socket;
    socket.onopen = () => {
      if (stopped) return;
      // Solo seje se začnejo same; multiplayer čaka v lobbyju.
      api<{
        settings?: GameMessage["settings"];
        you?: { id?: string };
        visibility?: string;
        max_players?: number;
        status?: string;
      }>(`/api/rooms/${code}/`)
        .then((room) => {
          if (stopped) return;
          if (room.you?.id) setMyId(room.you.id);
          if (room.settings?.mode === "multiplayer" || room.settings?.mode === "dirka") {
            syncLobbyEditors(room);
            // Only sync lobby while waiting. Mid-game reconnect relies on the WS snapshot —
            // lobby_sync would force everyone back to the lobby screen.
            if (room.status === "waiting") {
              socket.send(JSON.stringify({ type: "lobby_sync" }));
            }
          } else {
            socket.send(JSON.stringify({ type: "start_game" }));
          }
        })
        .catch(() => {
          if (!stopped) socket.send(JSON.stringify({ type: "start_game" }));
        });
    };
    socket.onmessage = (event) => {
      if (stopped) return;
      const incoming = JSON.parse(event.data) as GameMessage;
      if (incoming.type === "error") {
        setError(incoming.message || "Napaka v igri.");
        return;
      }
      setError("");
      if (incoming.you?.id) setMyId(incoming.you.id);
      if (incoming.phase === "lobby") {
        setMessage(incoming);
        syncLobbyEditors(incoming);
        setPhase("lobby");
        return;
      }
      if (incoming.phase === "waiting") {
        setPhase("waiting");
        setMessage(incoming);
        return;
      }
      if (incoming.phase === "question") {
        if (incoming.feedback) {
          setSixtyFlash(incoming.feedback);
          setSixtyTickKey((n) => n + 1);
        }
        setMessage((current) => mergeDirkaMessage(current, incoming, myIdRef.current));
        setPhase("question");
        return;
      }
      if (incoming.phase === "answer_progress" || incoming.phase === "waiting_answers") {
        const me = myIdRef.current;
        const iAnswered = Boolean(me && (incoming.answered_ids || []).includes(me));
        setMessage((current) => {
          const merged = mergeDirkaMessage(current, incoming, me);
          return {
            ...merged,
            phase: iAnswered
              ? "waiting_answers"
              : current?.phase === "question" || current?.phase === "submitting"
                ? "question"
                : incoming.phase,
          };
        });
        if (iAnswered) {
          setPhase("waiting_answers");
        }
        // Če še nisem oddal, ostani na question (bot/drugi so oddali prej).
        return;
      }
      if (incoming.phase === "round_review") {
        setMessage((current) => mergeDirkaMessage(current, incoming, myIdRef.current));
        setPhase("round_review");
        return;
      }
      if (incoming.phase === "review") {
        setMessage(incoming);
        setPhase("review");
        setPickFriend(false);
        return;
      }
      if (incoming.phase === "finished" || incoming.type === "game_finished") {
        if (incoming.feedback) {
          setSixtyFlash(incoming.feedback);
          setSixtyTickKey((n) => n + 1);
        }
        setMessage((current) => mergeDirkaMessage(current, incoming, myIdRef.current));
        setPhase("finished");
        setPickFriend(false);
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

  function useHelp(effect: string, friendKey?: string) {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !message?.question || phase !== "question") return;
    socket.send(
      JSON.stringify({
        type: "use_lifeline",
        effect,
        game_question_id: message.question.game_question_id,
        ...(friendKey ? { friend_key: friendKey } : {}),
      }),
    );
  }

  function skipSixty() {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !message?.question || phase !== "question") return;
    if (message.skips_left != null && message.skips_left <= 0) return;
    setPhase("submitting");
    socket.send(
      JSON.stringify({
        type: "submit_answer",
        game_question_id: message.question.game_question_id,
        skip: true,
      }),
    );
  }

  function useDirkaBonus(effect: string) {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !message?.question || phase !== "question") return;
    socket.send(
      JSON.stringify({
        type: "use_bonus",
        effect,
        game_question_id: message.question.game_question_id,
      }),
    );
  }

  function walkAway() {
    if (phase !== "question") return;
    setConfirmWalkAway(true);
  }

  function confirmWalkAwayNow() {
    const socket = wsRef.current;
    setConfirmWalkAway(false);
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    setPhase("submitting");
    socket.send(JSON.stringify({ type: "walk_away" }));
  }

  const question = message?.question;
  const ladder = message?.prize_ladder ?? [];
  const safeOrders = new Set(message?.safe_orders || []);
  const playing =
    phase === "question" ||
    phase === "submitting" ||
    phase === "review" ||
    phase === "waiting_answers" ||
    phase === "round_review" ||
    phase === "finished";
  const lifelines = message?.lifelines || {};
  const helps = message?.active_helps || {};
  const isAla = message?.mode === "ala_milijonar";
  const showLifelines = isAla && (phase === "question" || phase === "submitting");
  const canUseLifeline = phase === "question";
  const dirkaMe = isDirka && myId ? message?.players?.[myId] : undefined;
  const dirkaBonuses = dirkaMe?.bonuses || {};
  const dirkaArmed = dirkaMe?.armed || {};
  const dirkaHelps = dirkaMe?.active_helps || helps;
  const dirkaDeadline = isDirka
    ? dirkaMe?.deadline_at || (myId && message?.deadlines?.[myId]) || message?.deadline_at
    : undefined;
  const showDirkaChrome = isDirka && playing;
  const eliminatedIds = [
    ...((dirkaHelps.fifty_fifty?.eliminated_option_ids as number[] | undefined) || []),
    ...(((dirkaHelps as { hint?: { eliminated_option_ids?: number[] } }).hint?.eliminated_option_ids) || []),
  ];
  const boardPath =
    message?.mode === "ala_milijonar"
      ? "/lestvica/ala-milijonar"
      : message?.mode === "multiplayer"
        ? "/lestvica/vec-igralcev"
        : message?.mode === "dirka"
          ? "/lestvica/dirka"
          : message?.mode === "60_sekund"
            ? "/lestvica/60-sekund"
            : "/lestvica/hitrarunda";
  const sixtyDeadline = message?.clock_ends_at || message?.deadline_at;
  const skipDisabled =
    phase !== "question" || (message?.skips_left != null && (message.skips_left ?? 0) <= 0);
  const flashTone =
    sixtyFlash?.skipped ? "is-skip" : sixtyFlash?.is_correct ? "is-good" : sixtyFlash ? "is-bad" : "";
  const friends = message?.friends || [];
  const standings = message?.standings || [];
  const iAmHost = Boolean(
    (myId && message?.host_member_id && message.host_member_id === myId) ||
      message?.members?.some((item) => item.id === myId && item.is_host) ||
      (message?.you?.is_host && (message.you.id === myId || message.you.member_id === myId)),
  );
  const iAmReady = Boolean(message?.members?.find((item) => item.id === myId)?.is_ready ?? message?.you?.is_ready);

  function syncLobbyEditors(room: {
    settings?: GameMessage["settings"];
    visibility?: string;
    max_players?: number;
  }) {
    const settings = room.settings || {};
    if (settings.question_count) {
      setEditCount(LOBBY_COUNTS.includes(settings.question_count) ? settings.question_count : 10);
    }
    if (settings.time_limit_seconds) {
      setEditSeconds(LOBBY_TIMES.includes(settings.time_limit_seconds) ? settings.time_limit_seconds : 60);
    }
    if (typeof settings.sudden_death === "boolean") setEditSudden(settings.sudden_death);
    if (typeof settings.bot_count === "number") setEditBots(settings.bot_count);
    if (typeof settings.target_score === "number") setEditTarget(settings.target_score);
    if (typeof settings.safe_every === "number") setEditSafe(settings.safe_every);
    if (settings.categories?.length) setEditCats(settings.categories);
    if (room.max_players) setEditMax(room.max_players);
    if (room.visibility === "public" || room.visibility === "private" || room.visibility === "unlisted") {
      setEditVisibility(room.visibility);
    }
  }

  function sendReady(ready: boolean) {
    wsRef.current?.send(JSON.stringify({ type: "set_ready", ready }));
  }

  function startMulti() {
    wsRef.current?.send(JSON.stringify({ type: "start_game" }));
  }

  function sendInvite() {
    if (!inviteName.trim()) return;
    wsRef.current?.send(JSON.stringify({ type: "invite", nickname: inviteName.trim() }));
    setInviteName("");
  }

  function lobbyInviteUrl() {
    return `${window.location.origin}/igra/${code}`;
  }

  async function copyInviteLink() {
    const url = lobbyInviteUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopyNotice("Kopirano");
    } catch {
      setCopyNotice("Ročno označi in kopiraj");
    }
    window.setTimeout(() => setCopyNotice(""), 2000);
  }

  function humanCount() {
    return (message?.members || []).filter((item) => !item.is_bot).length || 1;
  }

  function maxBotsFor(maxPlayers = editMax) {
    return Math.max(0, Math.min(5, maxPlayers - humanCount()));
  }

  function saveLobbySettings(overrides: Partial<{
    question_count: number;
    time_limit_seconds: number;
    max_players: number;
    bot_count: number;
    sudden_death: boolean;
    target_score: number;
    safe_every: number;
    visibility: "public" | "private" | "unlisted";
  }> = {}) {
    const maxPlayers = Math.min(6, Math.max(overrides.max_players ?? editMax, humanCount(), 2));
    const botCount = Math.min(overrides.bot_count ?? editBots, Math.max(0, maxPlayers - humanCount()));
    if (botCount !== editBots) setEditBots(botCount);
    if (maxPlayers !== editMax) setEditMax(maxPlayers);
    const dirka = (message?.settings?.mode || message?.mode) === "dirka";
    wsRef.current?.send(
      JSON.stringify({
        type: "update_settings",
        ...(dirka
          ? {
              target_score: overrides.target_score ?? editTarget,
              safe_every: overrides.safe_every ?? editSafe,
            }
          : {
              question_count: overrides.question_count ?? editCount,
              time_limit_seconds: overrides.time_limit_seconds ?? editSeconds,
              sudden_death: overrides.sudden_death ?? editSudden,
            }),
        max_players: maxPlayers,
        visibility: overrides.visibility ?? editVisibility,
        password: (overrides.visibility ?? editVisibility) === "private" ? editPassword : "",
        categories: editCats.length ? editCats : message?.settings?.categories || categories.map((item) => item.slug),
        bot_count: botCount,
      }),
    );
  }

  function changeBots(value: number) {
    const next = Math.min(value, maxBotsFor());
    setEditBots(next);
    saveLobbySettings({ bot_count: next });
  }

  function changeMaxPlayers(value: number) {
    const nextMax = Math.min(6, Math.max(value, humanCount(), 2));
    const nextBots = Math.min(editBots, Math.max(0, nextMax - humanCount()));
    setEditMax(nextMax);
    setEditBots(nextBots);
    saveLobbySettings({ max_players: nextMax, bot_count: nextBots });
  }

  const dirkaPlaying = isDirka && showDirkaChrome && message;

  return (
    <section className={dirkaPlaying ? "stage stage-dirka" : "stage"}>
      <div className="play">
        <p className="eyebrow">
          {message?.mode ? formatMode(message.mode) : "Igra"} · soba {code}
          {message?.sudden_death ? " · sudden death" : ""}
        </p>
        {phase === "connecting" || phase === "waiting" ? <p className="status">Pripravljam vprašanja…</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {phase === "lobby" && message ? (
          <div className="stack">
            <h1>{message.name || "Lobby"}</h1>
            <div className="invite-link">
              <div className="invite-link-url">
                <span className="fine">Povabilo</span>
                <code>{lobbyInviteUrl()}</code>
              </div>
              <button type="button" className="primary" onClick={() => void copyInviteLink()}>
                Kopiraj link
              </button>
            </div>
            {copyNotice ? <p className="fine">{copyNotice}</p> : null}
            <p className="fine">
              {message.visibility ? `${message.visibility}` : ""}
              {message.has_password ? " · geslo" : ""}
              {message.settings?.sudden_death ? " · sudden death" : ""}
              {message.settings?.target_score ? ` · cilj ${message.settings.target_score}` : ""}
              {message.settings?.safe_every ? ` · varna zona ${message.settings.safe_every}` : ""}
              {message.settings?.bot_count ? ` · ${message.settings.bot_count} AI` : ""}
            </p>
            <h2>
              Igralci ({message.members?.length || 0}/{message.max_players || "?"})
            </h2>
            <ul className="lobby-list">
              {(message.members || []).map((member) => {
                const ready = Boolean(member.is_bot || member.is_ready);
                const isYou = member.id === myId;
                return (
                  <li key={member.id} className={ready ? "is-ready" : "is-waiting"}>
                    <div className="lobby-member-main">
                      <strong>{member.nickname}</strong>
                      <span className="fine">
                        {member.is_host ? "host" : ""}
                        {member.is_bot ? `${member.is_host ? " · " : ""}AI` : ""}
                        {isYou ? `${member.is_host || member.is_bot ? " · " : ""}ti` : ""}
                        {member.is_connected === false && !member.is_bot ? " · offline" : ""}
                      </span>
                      <span className={`lobby-ready-tag ${ready ? "is-on" : ""}`}>
                        {ready ? "pripravljen" : "ni pripravljen"}
                      </span>
                    </div>
                    {isYou && !member.is_bot ? (
                      <button
                        type="button"
                        className={`lobby-ready-btn ${iAmReady ? "is-on" : ""}`}
                        onClick={() => sendReady(!iAmReady)}
                      >
                        {iAmReady ? "Nisem pripravljen" : "Pripravljen"}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {iAmHost ? (
              <div className="actions">
                <button
                  type="button"
                  className="primary"
                  disabled={!((message.members || []).length >= 2 && (message.members || []).every((item) => item.is_ready || item.is_bot))}
                  onClick={startMulti}
                >
                  Začni igro
                </button>
              </div>
            ) : (
              <p className="fine">Čakaj, da host začne, ko so vsi pripravljeni.</p>
            )}
            {iAmHost ? (
              <>
                <div className="actions">
                  <input
                    value={inviteName}
                    onChange={(event) => setInviteName(event.target.value)}
                    placeholder="Povabi po vzdevku"
                  />
                  <button type="button" onClick={sendInvite}>
                    Povabi
                  </button>
                </div>
                <h2>Nastavitve (v živo)</h2>
                {(message.settings?.mode || message.mode) === "dirka" ? (
                  <>
                    <div className="stack-gap">
                      <span className="stepper-label">Cilj točk</span>
                      <div className="choices" role="group">
                        {[100, 200, 500, 1000].map((value) => (
                          <button
                            key={value}
                            type="button"
                            className={value === editTarget ? "is-on" : ""}
                            onClick={() => setEditTarget(value)}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </div>
                    <fieldset>
                      <legend>Varna zona</legend>
                      <label className="check">
                        <input type="radio" checked={editSafe === 5} onChange={() => setEditSafe(5)} />
                        Kratka (5)
                      </label>
                      <label className="check">
                        <input type="radio" checked={editSafe === 10} onChange={() => setEditSafe(10)} />
                        Daljša (10)
                      </label>
                    </fieldset>
                    <p className="fine">Čas na vprašanje: 30 s (fiksno).</p>
                  </>
                ) : (
                  <>
                    <NumberStepper label="Število vprašanj" value={editCount} options={LOBBY_COUNTS} onChange={setEditCount} />
                    <div className="stack-gap">
                      <span className="stepper-label">Čas na vprašanje</span>
                      <div className="choices" role="group" aria-label="Čas na vprašanje">
                        {LOBBY_TIMES.map((time) => (
                          <button key={time} type="button" className={time === editSeconds ? "is-on" : ""} onClick={() => setEditSeconds(time)}>
                            {formatLobbyTime(time)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="check">
                      <input type="checkbox" checked={editSudden} onChange={(event) => setEditSudden(event.target.checked)} />
                      Sudden death
                    </label>
                  </>
                )}
                <NumberStepper label="Največ igralcev" value={editMax} min={2} max={6} onChange={changeMaxPlayers} />
                <NumberStepper
                  label={(message.settings?.mode || message.mode) === "dirka" ? "Dirka AI" : "AI nasprotniki"}
                  value={editBots}
                  min={0}
                  max={maxBotsFor()}
                  onChange={changeBots}
                />
                <p className="fine">
                  AI se takoj doda na seznam. Največ {maxBotsFor()} (prosta mesta: {Math.max(0, editMax - humanCount())}).
                </p>
                <fieldset>
                  <legend>Vidnost</legend>
                  <label className="check">
                    <input type="radio" checked={editVisibility === "public"} onChange={() => setEditVisibility("public")} />
                    Javna
                  </label>
                  <label className="check">
                    <input type="radio" checked={editVisibility === "unlisted"} onChange={() => setEditVisibility("unlisted")} />
                    Skrita
                  </label>
                  <label className="check">
                    <input type="radio" checked={editVisibility === "private"} onChange={() => setEditVisibility("private")} />
                    Zasebna
                  </label>
                </fieldset>
                {editVisibility === "private" ? (
                  <label>
                    Geslo
                    <input value={editPassword} onChange={(event) => setEditPassword(event.target.value)} placeholder="pusti prazno = obstoječe" />
                  </label>
                ) : null}
                {categories.length > 0 ? (
                  <fieldset>
                    <legend>Kategorije</legend>
                    {categories.map((category) => (
                      <label key={category.slug} className="check">
                        <input
                          type="checkbox"
                          checked={editCats.includes(category.slug)}
                          onChange={() =>
                            setEditCats((current) =>
                              current.includes(category.slug)
                                ? current.filter((item) => item !== category.slug)
                                : [...current, category.slug],
                            )
                          }
                        />
                        {category.name}
                      </label>
                    ))}
                  </fieldset>
                ) : null}
                <button type="button" className="primary" onClick={() => saveLobbySettings()}>
                  Shrani nastavitve
                </button>
                <p className="fine">Sprememba ponastavi pripravljenost ostalih igralcev.</p>
              </>
            ) : null}
          </div>
        ) : null}
        {question && message && playing ? (
          <div className={isDirka ? "dirka-play-body" : undefined}>
            <div
              className={[
                isDirka ? "dirka-question-slot" : undefined,
                isSixty ? "sixty-play" : undefined,
                isSixty && sixtyFlash ? `sixty-flash ${flashTone}` : undefined,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="q-meta">
                <span>
                  {(message.index ?? 0) + 1}
                  {isDirka || isSixty ? "" : ` / ${message.total}`}
                </span>
                <span>{question.category_name}</span>
                <span>Težavnost {question.difficulty}</span>
                {isSixty ? (
                  <span>
                    Pravilni {message.correct_count ?? 0}
                    {message.answered_count != null ? ` / ${message.answered_count}` : ""}
                  </span>
                ) : null}
                {phase === "question" && message.stake ? <span>Igraš za {formatPoints(message.stake)}</span> : null}
                {isAla && (message.guaranteed_prize ?? 0) > 0 ? (
                  <span>Varno: {formatPoints(message.guaranteed_prize ?? 0)}</span>
                ) : null}
                {isDirka && message.target_score ? <span>Cilj {formatPoints(message.target_score)}</span> : null}
                {isDirka ? (
                  <span title="Varna zona po N pravilnih (napačen odgovor ne resetira števca, samo clean sheet).">
                    Varna zona {dirkaMe?.correct_in_segment ?? 0}/{dirkaMe?.safe_every ?? message.safe_every ?? 5}
                    {` · še ${dirkaMe?.until_safe ?? message.safe_every ?? 5}`}
                    {dirkaMe?.safe_locked ? ` · zaklenjeno ${formatPoints(dirkaMe.safe_locked)}` : ""}
                  </span>
                ) : null}
              </div>
              {isSixty ? (
                <>
                  <p
                    className={`sixty-feedback ${sixtyFlash ? flashTone : "sixty-feedback-empty"}`}
                    aria-live="polite"
                  >
                    {sixtyFlash?.label || "\u00a0"}
                  </p>
                  <div
                    className={[
                      "sixty-chrome",
                      sixtyFlash
                        ? (sixtyFlash.time_delta ?? 0) > 0
                          ? "is-tick-up"
                          : (sixtyFlash.time_delta ?? 0) < 0
                            ? "is-tick-down"
                            : ""
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {sixtyFlash && (sixtyFlash.time_delta ?? 0) !== 0 ? (
                      <span
                        key={`pulse-${sixtyTickKey}`}
                        className={`sixty-chrome-pulse ${
                          (sixtyFlash.time_delta ?? 0) > 0 ? "is-up" : "is-down"
                        }`}
                        aria-hidden
                      />
                    ) : null}
                    <div className="sixty-timer">
                      {sixtyDeadline && message.server_now ? (
                        <TimerBar
                          deadlineAt={sixtyDeadline}
                          serverNow={message.server_now}
                          onExpire={expire}
                        />
                      ) : (
                        <div className="timer sixty-timer-placeholder" aria-hidden>
                          <div className="timer-track" />
                          <span>—s</span>
                        </div>
                      )}
                      {sixtyFlash && (sixtyFlash.time_delta ?? 0) !== 0 ? (
                        <span
                          key={`delta-${sixtyTickKey}`}
                          className={`sixty-delta ${
                            (sixtyFlash.time_delta ?? 0) > 0 ? "is-up" : "is-down"
                          }`}
                        >
                          {(sixtyFlash.time_delta ?? 0) > 0
                            ? `+${sixtyFlash.time_delta} s`
                            : `${sixtyFlash.time_delta} s`}
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="sixty-skip"
                      disabled={skipDisabled}
                      onClick={skipSixty}
                    >
                      Preskoči
                      <strong>
                        {message.skips_left == null ? "∞" : message.skips_left}
                      </strong>
                    </button>
                  </div>
                </>
              ) : null}
              {showLifelines ? (
                <div className="lifelines" aria-label="Jokerji">
                  <button
                    type="button"
                    className={lifelines.fifty_fifty?.used ? "is-used" : ""}
                    disabled={!canUseLifeline || !lifelines.fifty_fifty?.available}
                    onClick={() => useHelp("fifty_fifty")}
                  >
                    Polovička{lifelines.fifty_fifty?.used ? " · porabljena" : ""}
                  </button>
                  <button
                    type="button"
                    className={lifelines.audience?.used ? "is-used" : ""}
                    disabled={!canUseLifeline || !lifelines.audience?.available}
                    onClick={() => useHelp("audience")}
                  >
                    Glas ljudstva{lifelines.audience?.used ? " · porabljen" : ""}
                  </button>
                  <button
                    type="button"
                    className={lifelines.phone_friend?.used ? "is-used" : ""}
                    disabled={!canUseLifeline || !lifelines.phone_friend?.available}
                    onClick={() => setPickFriend((current) => !current)}
                  >
                    Klic v sili{lifelines.phone_friend?.used ? " · porabljen" : ""}
                  </button>
                  {message.can_walk_away && phase === "question" ? (
                    <button type="button" className="walk-away" onClick={walkAway}>
                      Odnehaj ({formatPoints(message.prize_reached ?? 0)})
                    </button>
                  ) : null}
                </div>
              ) : null}
              {isAla && friends.length > 0 && (showLifelines || pickFriend) ? (
                <div className={`friend-pick ${pickFriend ? "is-open" : ""}`}>
                  <p className="fine">{pickFriend ? "Koga kličeš?" : "Tvoji prijatelji za klic"}</p>
                  {friends.map((friend) => (
                    <button
                      key={friend.key}
                      type="button"
                      disabled={!pickFriend || !canUseLifeline || friend.used || !lifelines.phone_friend?.available}
                      style={{ ["--friend-color" as string]: friend.avatar_color }}
                      onClick={() => useHelp("phone_friend", friend.key)}
                    >
                      <strong>{friend.name}</strong>
                      <span className="fine">{friend.title}{friend.used ? " · poklican" : ""}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {phase === "question" && isDirka && dirkaDeadline && message.server_now ? (
                <TimerBar deadlineAt={dirkaDeadline} serverNow={message.server_now} onExpire={expire} />
              ) : phase === "question" && !isDirka && !isSixty && message.deadline_at && message.server_now ? (
                <TimerBar deadlineAt={message.deadline_at} serverNow={message.server_now} onExpire={expire} />
              ) : null}
              <div className={isSixty ? "sixty-question-slot" : undefined}>
              <h1>{question.text}</h1>
              {question.image ? <img className="q-image" src={question.image} alt="" /> : null}
              {helps.phone_friend ? (
                <p className="help-banner">
                  {helps.phone_friend.friend_name}: {helps.phone_friend.message}
                </p>
              ) : null}
              {!isDirka && !isSixty && phase === "question" && (message.answered_count ?? 0) > 0 ? (
                <p className="fine">
                  Oddano {message.answered_count}/{message.player_count}
                  {(message.waiting_for || []).length > 0 ? ` · čaka: ${(message.waiting_for || []).join(", ")}` : ""}
                </p>
              ) : null}
              {!isDirka && !isSixty && phase === "waiting_answers" ? (
                <p className="status">
                  Oddano. Čakam še: {(message.waiting_for || []).join(", ") || "nikogar"} (
                  {message.answered_count}/{message.player_count})
                </p>
              ) : null}
              {phase === "question" || phase === "submitting" ? (
                <QuestionPlay
                  question={question}
                  locked={phase !== "question"}
                  result={null}
                  eliminatedOptionIds={
                    eliminatedIds.length
                      ? eliminatedIds
                      : isDirka
                        ? undefined
                        : helps.fifty_fifty?.eliminated_option_ids
                  }
                  audienceVotes={isDirka ? undefined : helps.audience?.votes}
                  onSubmit={sendAnswer}
                />
              ) : null}
              {phase === "round_review" ? (
                <RoundReview message={message} myId={myId} isHost={iAmHost} onNext={next} boardPath={boardPath} />
              ) : null}
              {phase === "review" ||
              (phase === "finished" &&
                message.mode !== "multiplayer" &&
                message.mode !== "dirka" &&
                message.mode !== "60_sekund") ? (
                <Review message={message} onNext={next} boardPath={boardPath} />
              ) : null}
              {phase === "finished" && message.mode === "60_sekund" ? (
                <SixtyFinish message={message} boardPath={boardPath} />
              ) : null}
              {phase === "finished" && (message.mode === "multiplayer" || message.mode === "dirka") ? (
                <PodiumFinish message={message} myId={myId} boardPath={boardPath} />
              ) : null}
              </div>
            </div>
            {dirkaPlaying ? (
              <div className="dirka-side">
                <DirkaBonusBar
                  bonuses={dirkaBonuses}
                  armed={dirkaArmed}
                  canUse={phase === "question"}
                  onUse={useDirkaBonus}
                  maxTypes={message.max_bonus_types || 5}
                />
                <p
                  className={`dirka-wait-status ${
                    phase === "waiting_answers"
                      ? "status"
                      : phase === "question" && (message.answered_count ?? 0) > 0
                        ? "fine"
                        : "dirka-wait-status-empty"
                  }`}
                  aria-live="polite"
                >
                  {phase === "waiting_answers"
                    ? `Oddano. Čakam še: ${(message.waiting_for || []).join(", ") || "nikogar"} (${message.answered_count}/${message.player_count})`
                    : phase === "question" && (message.answered_count ?? 0) > 0
                      ? `Oddano ${message.answered_count}/${message.player_count}${
                          (message.waiting_for || []).length > 0
                            ? ` · čaka: ${(message.waiting_for || []).join(", ")}`
                            : ""
                        }`
                      : "\u00a0"}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
        {phase === "error" ? (
          <Link className="primary" to="/igra">
            Nazaj na nastavitev
          </Link>
        ) : null}
      </div>
      {dirkaPlaying ? (
        <div className="dirka-race-top">
          <DirkaRaceTrack
            standings={standings}
            targetScore={message.target_score || message.settings?.target_score || 200}
            myId={myId}
            mySafeProgress={{
              current: dirkaMe?.correct_in_segment ?? 0,
              every: dirkaMe?.safe_every ?? message.safe_every ?? 5,
              until: dirkaMe?.until_safe ?? message.safe_every ?? 5,
            }}
          />
        </div>
      ) : null}
      <ConfirmModal
        open={confirmWalkAway}
        title="Odnehati?"
        message="Odnehaš z doseženo nagrado?"
        confirmLabel="Odneham"
        danger
        onConfirm={confirmWalkAwayNow}
        onCancel={() => setConfirmWalkAway(false)}
      />
      {message?.mode === "multiplayer" || (isMulti && !isDirka) ? (
        <ol className="ladder">
          {standings.map((row) => {
            const answeredIds = new Set(message?.answered_ids || []);
            const answerById = new Map((message?.answers || []).map((item) => [item.member_id || "", item]));
            const answer = answerById.get(row.member_id);
            const classes = [
              row.member_id === myId ? "current" : "",
              (phase === "question" || phase === "submitting" || phase === "waiting_answers") && answeredIds.has(row.member_id)
                ? "has-answered"
                : "",
              phase === "round_review" && answer
                ? answer.is_correct
                  ? "answered-correct"
                  : "answered-wrong"
                : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <li key={row.member_id} className={classes}>
                #{row.rank || "?"} {row.nickname}
                {row.is_bot ? " (AI)" : ""}
                {row.alive === false ? " · izločen" : ""}: {formatPoints(row.score)}
                {row.streak && row.streak > 1 ? ` · streak ${row.streak}` : ""}
              </li>
            );
          })}
        </ol>
      ) : !isDirka ? (
        <ol className="ladder">
          {[...ladder].reverse().map((prize, reversed) => {
            const index = ladder.length - 1 - reversed;
            const reached = index < (message?.correct_count ?? 0);
            const current = phase === "question" && index === message?.index;
            const safe = safeOrders.has(index);
            const className = [reached ? "reached" : "", current ? "current" : "", safe ? "safe" : ""].filter(Boolean).join(" ");
            return (
              <li key={index} className={className}>
                {safe ? "★ " : ""}
                {formatPoints(prize)}
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}

function mergeDirkaMessage(current: GameMessage | null, incoming: GameMessage, myId: string): GameMessage {
  if (incoming.mode !== "dirka") {
    return { ...(current || {}), ...incoming };
  }
  const players = incoming.players || current?.players;
  const mine = myId && players ? players[myId] : undefined;
  return {
    ...(current || {}),
    ...incoming,
    players,
    // Nikoli ne prevzemi tujih root bonusov / helps iz botovega dogodka.
    bonuses: mine?.bonuses || {},
    armed: mine?.armed || {},
    active_helps: mine?.active_helps || {},
    you: mine
      ? {
          ...(current?.you || {}),
          id: myId,
          member_id: myId,
          score: mine.score,
          safe_locked: mine.safe_locked,
          bonuses: mine.bonuses,
        }
      : current?.you,
    deadline_at: mine?.deadline_at || (myId && incoming.deadlines?.[myId]) || incoming.deadline_at || current?.deadline_at,
  };
}

function PodiumFinish({
  message,
  myId,
  boardPath,
}: {
  message: GameMessage;
  myId: string;
  boardPath: string;
}) {
  const rows = (message.standings || []) as StandingRow[];
  const first = rows[0];
  const second = rows[1];
  const third = rows[2];
  const rest = rows.slice(3);

  function slot(row: StandingRow | undefined, place: 1 | 2 | 3) {
    if (!row) return <div className={`podium-slot is-${place === 1 ? "first" : place === 2 ? "second" : "third"}`} />;
    return (
      <div className={`podium-slot is-${place === 1 ? "first" : place === 2 ? "second" : "third"}`}>
        <div className="podium-name">
          {row.nickname}
          {row.is_bot ? " (AI)" : ""}
          {row.member_id === myId ? " · ti" : ""}
        </div>
        <div className="podium-score">{formatPoints(row.score)}</div>
        <div className="fine">{row.correct_count} pravilnih</div>
        <div className="podium-block">{place}</div>
      </div>
    );
  }

  return (
    <div className="review good">
      <h2>Končna lestvica</h2>
      <div className="podium" aria-label="Stopničke">
        {slot(second, 2)}
        {slot(first, 1)}
        {slot(third, 3)}
      </div>
      {rest.length > 0 ? (
        <ol className="podium-rest">
          {rest.map((row) => (
            <li key={row.member_id}>
              <span>
                #{row.rank} {row.nickname}
                {row.is_bot ? " (AI)" : ""}
                {row.member_id === myId ? " · ti" : ""}
              </span>
              <strong>
                {formatPoints(row.score)} · {row.correct_count} pravilnih
              </strong>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="actions">
        <Link className="primary" to={boardPath}>
          Lestvica
        </Link>
        <Link to="/igra/vec-igralcev">Nova soba</Link>
      </div>
    </div>
  );
}

function RoundReview({
  message,
  myId,
  isHost,
  onNext,
}: {
  message: GameMessage;
  myId: string;
  isHost: boolean;
  onNext: () => void;
  boardPath: string;
}) {
  const advanceSeconds = message.advance_seconds ?? 5;
  const [secondsLeft, setSecondsLeft] = useState(advanceSeconds);

  useEffect(() => {
    setSecondsLeft(advanceSeconds);
    const started = Date.now();
    const tick = window.setInterval(() => {
      const left = Math.max(0, advanceSeconds - Math.floor((Date.now() - started) / 1000));
      setSecondsLeft(left);
    }, 200);
    return () => window.clearInterval(tick);
  }, [advanceSeconds, message.index]);

  return (
    <div className="review good">
      <h2>Rezultat runde</h2>
      {message.explanation ? <p>{message.explanation}</p> : null}
      {message.sudden_death ? (
        <p className="fine">Sudden death · še v igri: {message.alive_count ?? "?"}</p>
      ) : null}
      <ul>
        {(message.answers || []).map((row) => (
          <li key={`${row.member_id}-${row.nickname}`} className={row.is_correct ? "answered-correct" : "answered-wrong"}>
            {row.nickname}
            {row.member_id === myId ? " (ti)" : ""}: {row.timed_out ? "čas" : row.is_correct ? "prav" : "narobe"} ·{" "}
            {formatPoints(row.points)}
            {row.round_bonus ? " · rundni bonus" : ""}
            {row.streak_bonus ? ` · streak +${row.streak_bonus}` : ""}
            {row.catchup_bonus ? ` · catch-up +${row.catchup_bonus}` : ""}
            {row.eliminated ? " · izločen" : ""}
          </li>
        ))}
      </ul>
      <div className="stack">
        <p className="fine">
          {message.is_last ? "Zaključek" : "Naslednje vprašanje"} čez {secondsLeft} s…
        </p>
        {isHost ? (
          <button type="button" className="primary" onClick={onNext}>
            {message.is_last ? "Zaključi zdaj" : "Naprej zdaj"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SixtyFinish({ message, boardPath }: { message: GameMessage; boardPath: string }) {
  return (
    <div className="review good">
      <h2>Čas je potekel</h2>
      <p className="sixty-score-line">
        <strong>{formatPoints(message.score ?? message.correct_count ?? 0)}</strong> pravilnih
      </p>
      <p className="fine">
        Vprašanj: {message.answered_count ?? message.total_questions ?? 0}
        {" · "}
        Preživel: {formatDuration(message.duration_ms ?? null)}
      </p>
      <div className="actions">
        <Link className="primary" to={boardPath}>
          Lestvica
        </Link>
        <Link to="/igra/60-sekund">Igraj znova</Link>
      </div>
    </div>
  );
}

function Review({
  message,
  onNext,
  boardPath,
}: {
  message: GameMessage;
  onNext: () => void;
  boardPath: string;
}) {
  const question = message.question;
  const replayPath =
    message.mode === "ala_milijonar"
      ? "/igra/ala-milijonar"
      : message.mode === "60_sekund"
        ? "/igra/60-sekund"
        : "/igra/hitrarunda";
  const title = message.walked_away
    ? "Odnehal si"
    : message.timed_out
      ? "Čas je potekel"
      : message.is_correct
        ? "Pravilno"
        : "Napačno";
  const tone = message.walked_away || message.is_correct ? "good" : "bad";
  return (
    <div className={`review ${tone}`}>
      <h2>{title}</h2>
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
      {question && !message.walked_away ? <Complaint key={question.game_question_id} gameQuestionId={question.game_question_id} /> : null}
      {message.phase === "finished" || message.finished ? (
        <>
          <p>{REASONS[message.reason || ""] || "Igra je končana."}</p>
          <div className="actions">
            <Link className="primary" to={boardPath}>
              Lestvica
            </Link>
            <Link to={replayPath}>Igraj znova</Link>
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
