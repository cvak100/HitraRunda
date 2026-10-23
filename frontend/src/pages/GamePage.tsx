import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ApiError, api } from "../api";
import { QuestionPlay } from "../components/QuestionPlay";
import { TimerBar } from "../components/TimerBar";
import { REASONS, formatMode, formatPoints } from "../format";
import type { Category, GameMessage } from "../types";

const LOBBY_TIMES = [10, 15, 20, 30, 45, 60];

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
  const [editSeconds, setEditSeconds] = useState(20);
  const [editMax, setEditMax] = useState(4);
  const [editVisibility, setEditVisibility] = useState<"public" | "private" | "unlisted">("public");
  const [editPassword, setEditPassword] = useState("");
  const [editSudden, setEditSudden] = useState(false);
  const [editBots, setEditBots] = useState(0);
  const [editCats, setEditCats] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const myIdRef = useRef(myId);
  myIdRef.current = myId;
  const isMulti = message?.mode === "multiplayer" || phase === "lobby";

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
      }>(`/api/rooms/${code}/`)
        .then((room) => {
          if (stopped) return;
          if (room.you?.id) setMyId(room.you.id);
          if (room.settings?.mode === "multiplayer") {
            syncLobbyEditors(room);
            socket.send(JSON.stringify({ type: "lobby_sync" }));
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
        setMessage(incoming);
        setPhase("question");
        return;
      }
      if (incoming.phase === "answer_progress" || incoming.phase === "waiting_answers") {
        const me = myIdRef.current;
        const iAnswered = Boolean(me && (incoming.answered_ids || []).includes(me));
        setMessage((current) => ({
          ...current,
          ...incoming,
          you: current?.you,
          phase: iAnswered ? "waiting_answers" : current?.phase === "question" || current?.phase === "submitting" ? "question" : incoming.phase,
        }));
        if (iAnswered) {
          setPhase("waiting_answers");
        }
        // Če še nisem oddal, ostani na question (bot/drugi so oddali prej).
        return;
      }
      if (incoming.phase === "round_review") {
        setMessage(incoming);
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
        setMessage((current) => ({ ...current, ...incoming }));
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

  function walkAway() {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || phase !== "question") return;
    if (!window.confirm("Odnehaš z doseženo nagrado?")) return;
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
  const boardPath =
    message?.mode === "ala_milijonar"
      ? "/lestvica/ala-milijonar"
      : message?.mode === "multiplayer"
        ? "/lestvica/vec-igralcev"
        : "/lestvica/hitrarunda";
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
    if (settings.question_count) setEditCount(settings.question_count);
    if (settings.time_limit_seconds) setEditSeconds(settings.time_limit_seconds);
    if (typeof settings.sudden_death === "boolean") setEditSudden(settings.sudden_death);
    if (typeof settings.bot_count === "number") setEditBots(settings.bot_count);
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

  function saveLobbySettings() {
    wsRef.current?.send(
      JSON.stringify({
        type: "update_settings",
        question_count: editCount,
        time_limit_seconds: editSeconds,
        max_players: editMax,
        visibility: editVisibility,
        password: editVisibility === "private" ? editPassword : "",
        categories: editCats.length ? editCats : categories.map((item) => item.slug),
        sudden_death: editSudden,
        bot_count: editBots,
      }),
    );
  }

  return (
    <section className="stage">
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
            <p className="fine">
              Link: <code>{window.location.origin}/igra/{code}</code>
              {message.visibility ? ` · ${message.visibility}` : ""}
              {message.has_password ? " · geslo" : ""}
              {message.settings?.sudden_death ? " · sudden death" : ""}
              {message.settings?.bot_count ? ` · ${message.settings.bot_count} AI` : ""}
            </p>
            <h2>
              Igralci ({message.members?.length || 0}/{message.max_players || "?"})
            </h2>
            <ul className="lobby-list">
              {(message.members || []).map((member) => (
                <li key={member.id}>
                  <strong>{member.nickname}</strong>
                  {member.is_host ? " · host" : ""}
                  {member.is_bot ? " · AI" : ""}
                  {member.id === myId ? " · ti" : ""}
                  {" · "}
                  {member.is_bot || member.is_ready ? "pripravljen" : "čaka"}
                  {member.is_connected === false && !member.is_bot ? " · offline" : ""}
                </li>
              ))}
            </ul>
            <div className="actions">
              <button type="button" onClick={() => sendReady(!iAmReady)} className={iAmReady ? "is-on" : ""}>
                {iAmReady ? "Nisem pripravljen" : "Pripravljen"}
              </button>
              {iAmHost ? (
                <button
                  type="button"
                  className="primary"
                  disabled={!((message.members || []).length >= 2 && (message.members || []).every((item) => item.is_ready || item.is_bot))}
                  onClick={startMulti}
                >
                  Začni igro
                </button>
              ) : null}
            </div>
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
                <label>
                  Število vprašanj: {editCount}
                  <input type="range" min={5} max={15} value={editCount} onChange={(event) => setEditCount(Number(event.target.value))} />
                </label>
                <div className="choices" role="group" aria-label="Čas">
                  {LOBBY_TIMES.map((time) => (
                    <button key={time} type="button" className={time === editSeconds ? "is-on" : ""} onClick={() => setEditSeconds(time)}>
                      {time} s
                    </button>
                  ))}
                </div>
                <label>
                  Največ igralcev: {editMax}
                  <input type="range" min={2} max={6} value={editMax} onChange={(event) => setEditMax(Number(event.target.value))} />
                </label>
                <label>
                  AI nasprotniki: {editBots}
                  <input type="range" min={0} max={3} value={editBots} onChange={(event) => setEditBots(Number(event.target.value))} />
                </label>
                <label className="check">
                  <input type="checkbox" checked={editSudden} onChange={(event) => setEditSudden(event.target.checked)} />
                  Sudden death
                </label>
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
                <button type="button" className="primary" onClick={saveLobbySettings}>
                  Shrani nastavitve
                </button>
                <p className="fine">Sprememba ponastavi pripravljenost ostalih igralcev.</p>
              </>
            ) : (
              <p className="fine">Čakaj, da host začne, ko so vsi pripravljeni.</p>
            )}
          </div>
        ) : null}
        {question && message && playing ? (
          <>
            <div className="q-meta">
              <span>
                {(message.index ?? 0) + 1} / {message.total}
              </span>
              <span>{question.category_name}</span>
              <span>Težavnost {question.difficulty}</span>
              {phase === "question" && message.stake ? <span>Igraš za {formatPoints(message.stake)}</span> : null}
              {isAla && (message.guaranteed_prize ?? 0) > 0 ? (
                <span>Varno: {formatPoints(message.guaranteed_prize ?? 0)}</span>
              ) : null}
            </div>
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
            {phase === "question" && message.deadline_at && message.server_now ? (
              <TimerBar deadlineAt={message.deadline_at} serverNow={message.server_now} onExpire={expire} />
            ) : null}
            <h1>{question.text}</h1>
            {question.image ? <img className="q-image" src={question.image} alt="" /> : null}
            {helps.phone_friend ? (
              <p className="help-banner">
                {helps.phone_friend.friend_name}: {helps.phone_friend.message}
              </p>
            ) : null}
            {phase === "question" && (message.answered_count ?? 0) > 0 ? (
              <p className="fine">
                Oddano {message.answered_count}/{message.player_count}
                {(message.waiting_for || []).length > 0 ? ` · čaka: ${(message.waiting_for || []).join(", ")}` : ""}
              </p>
            ) : null}
            {phase === "waiting_answers" ? (
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
                eliminatedOptionIds={helps.fifty_fifty?.eliminated_option_ids}
                audienceVotes={helps.audience?.votes}
                onSubmit={sendAnswer}
              />
            ) : null}
            {phase === "round_review" ? (
              <RoundReview message={message} myId={myId} isHost={iAmHost} onNext={next} boardPath={boardPath} />
            ) : null}
            {phase === "review" || (phase === "finished" && message.mode !== "multiplayer") ? (
              <Review message={message} onNext={next} boardPath={boardPath} />
            ) : null}
            {phase === "finished" && message.mode === "multiplayer" ? (
              <RoundReview message={message} myId={myId} isHost={iAmHost} onNext={next} boardPath={boardPath} finished />
            ) : null}
          </>
        ) : null}
        {phase === "error" ? (
          <Link className="primary" to="/igra">
            Nazaj na nastavitev
          </Link>
        ) : null}
      </div>
      {message?.mode === "multiplayer" || isMulti ? (
        <ol className="ladder">
          {standings.map((row) => (
            <li key={row.member_id} className={row.member_id === myId ? "current" : ""}>
              #{row.rank || "?"} {row.nickname}
              {row.is_bot ? " (AI)" : ""}
              {row.alive === false ? " · izločen" : ""}: {formatPoints(row.score)}
              {row.streak && row.streak > 1 ? ` · streak ${row.streak}` : ""}
            </li>
          ))}
        </ol>
      ) : (
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
      )}
    </section>
  );
}

function RoundReview({
  message,
  myId,
  isHost,
  onNext,
  boardPath,
  finished,
}: {
  message: GameMessage;
  myId: string;
  isHost: boolean;
  onNext: () => void;
  boardPath: string;
  finished?: boolean;
}) {
  const advanceSeconds = message.advance_seconds ?? 5;
  const [secondsLeft, setSecondsLeft] = useState(advanceSeconds);
  const done = Boolean(finished || message.phase === "finished");

  useEffect(() => {
    if (done) return;
    setSecondsLeft(advanceSeconds);
    const started = Date.now();
    const tick = window.setInterval(() => {
      const left = Math.max(0, advanceSeconds - Math.floor((Date.now() - started) / 1000));
      setSecondsLeft(left);
    }, 200);
    return () => window.clearInterval(tick);
  }, [done, advanceSeconds, message.index]);

  return (
    <div className="review good">
      <h2>{done ? "Končna lestvica" : "Rezultat runde"}</h2>
      {message.explanation ? <p>{message.explanation}</p> : null}
      {message.sudden_death ? (
        <p className="fine">Sudden death · še v igri: {message.alive_count ?? "?"}</p>
      ) : null}
      <ul>
        {(message.answers || []).map((row) => (
          <li key={`${row.member_id}-${row.nickname}`}>
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
      <ol>
        {(message.standings || []).map((row) => (
          <li key={row.member_id}>
            #{row.rank} {row.nickname}
            {row.is_bot ? " (AI)" : ""}
            {row.alive === false ? " · izločen" : ""}: {formatPoints(row.score)} ({row.correct_count}{" "}
            pravilnih)
          </li>
        ))}
      </ol>
      {done ? (
        <div className="actions">
          <Link className="primary" to={boardPath}>
            Lestvica
          </Link>
          <Link to="/igra/vec-igralcev">Nova soba</Link>
        </div>
      ) : (
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
      )}
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
  const replayPath = message.mode === "ala_milijonar" ? "/igra/ala-milijonar" : "/igra/hitrarunda";
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
