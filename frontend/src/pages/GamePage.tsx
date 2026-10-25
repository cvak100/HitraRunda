import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError, api } from "../api";
import { Avatar } from "../components/Avatar";
import { ConfirmModal } from "../components/ConfirmModal";
import { DirkaRaceTrack } from "../components/DirkaRaceTrack";
import { GameLobby } from "../components/game/GameLobby";
import { GamePlayBody } from "../components/game/GamePlayBody";
import { PodiumFinish } from "../components/game/PodiumFinish";
import { formatMode, formatPoints } from "../format";
import { boardPath as modeBoardPath } from "../gameModes";
import {
  cancelSfxSequence,
  playSfx,
  playSfxSequence,
  startQuestionCountdown,
  startSyncedCountdown,
  stopQuestionCountdown,
  unlockSfx,
  type SfxName,
} from "../sound";
import type { Category, GameMessage, StandingRow } from "../types";

const DEFAULT_LOBBY_TIMES = [30, 60, 90, 120, 300];
const DEFAULT_DIRKA_TIMES = [10, 15, 20, 30, 60];
const DEFAULT_LOBBY_COUNTS = [5, 10, 20, 40, 50, 100];
const DEFAULT_TARGETS = [100, 200, 500, 1000];
const DEFAULT_SAFE = [5, 10];

export function GamePage() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState<GameMessage | null>(null);
  const [phase, setPhase] = useState("connecting");
  const [error, setError] = useState("");
  const [reconnectNote, setReconnectNote] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [rematchBusy, setRematchBusy] = useState(false);
  const [pickFriend, setPickFriend] = useState(false);
  const [myId, setMyId] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [lobbyTimes, setLobbyTimes] = useState(DEFAULT_LOBBY_TIMES);
  const [dirkaTimes, setDirkaTimes] = useState(DEFAULT_DIRKA_TIMES);
  const [lobbyCounts, setLobbyCounts] = useState(DEFAULT_LOBBY_COUNTS);
  const [lobbyTargets, setLobbyTargets] = useState(DEFAULT_TARGETS);
  const [lobbySafe, setLobbySafe] = useState(DEFAULT_SAFE);
  const [maxPlayersCap, setMaxPlayersCap] = useState(6);
  const [maxBots, setMaxBots] = useState(5);
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
  /** Dirka proga: standings šele ob koncu runde, ne med answer_progress. */
  const [dirkaRaceStandings, setDirkaRaceStandings] = useState<StandingRow[]>([]);
  const [dirkaRaceSafe, setDirkaRaceSafe] = useState<{
    current: number;
    every: number;
    until: number;
  } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const myIdRef = useRef(myId);
  myIdRef.current = myId;
  const lobbyMemberIdsRef = useRef<string[] | null>(null);
  const lastNextQuestionIdRef = useRef<string>("");
  const skipNextSfxRef = useRef(false);
  const countdownActiveRef = useRef(false);
  const [countdownStep, setCountdownStep] = useState<number | null>(null);
  const [kickingId, setKickingId] = useState("");
  const isLobbyMode = message?.mode === "multiplayer" || message?.mode === "dirka" || phase === "lobby";
  const isMulti = isLobbyMode;
  const isDirka = message?.mode === "dirka";
  const isSixty = message?.mode === "60_sekund";

  const sendAnswer = useCallback((body: Record<string, unknown>) => {
    const socket = wsRef.current;
    const current = message;
    if (!socket || socket.readyState !== WebSocket.OPEN || !current?.question || phaseRef.current !== "question") return;
    unlockSfx();
    // Hitra runda / Ala: correct|wrong pride ob review — klik tukaj se podvoji.
    // MP/Dirka/60s: klik ostane (feedback je drugače).
    const mode = current.mode;
    if (!body.timeout && mode !== "hitrarunda" && mode !== "ala_milijonar") {
      playSfx("click");
    }
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
    api<{
      multiplayer?: {
        times?: number[];
        question_counts?: number[];
        max_players?: number;
        max_bots?: number;
      };
      dirka?: {
        targets?: number[];
        safe_every?: number[];
        times?: number[];
        time_limit_seconds?: number;
        max_bots?: number;
      };
    }>("/api/game-config/")
      .then((cfg) => {
        const mp = cfg.multiplayer;
        if (mp?.times?.length) setLobbyTimes(mp.times);
        if (mp?.question_counts?.length) setLobbyCounts(mp.question_counts);
        if (mp?.max_players) setMaxPlayersCap(mp.max_players);
        if (typeof mp?.max_bots === "number") setMaxBots(mp.max_bots);
        if (cfg.dirka?.targets?.length) setLobbyTargets(cfg.dirka.targets);
        if (cfg.dirka?.safe_every?.length) setLobbySafe(cfg.dirka.safe_every);
        if (cfg.dirka?.times?.length) setDirkaTimes(cfg.dirka.times);
        if (typeof cfg.dirka?.max_bots === "number") setMaxBots(cfg.dirka.max_bots);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!sixtyFlash) return;
    const id = window.setTimeout(() => setSixtyFlash(null), 900);
    return () => window.clearTimeout(id);
  }, [sixtyFlash, sixtyTickKey]);

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let retryTimer: number | undefined;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";

    function handleMessage(incoming: GameMessage) {
      if (incoming.type === "error" || incoming.phase === "closed" || incoming.phase === "error") {
        const msg = incoming.message || "Napaka v igri.";
        setError(msg);
        if (incoming.phase === "closed") {
          setPhase("closed");
          stopped = true;
        }
        return;
      }
      setError("");
      setReconnectNote("");
      if (incoming.you?.id) setMyId(incoming.you.id);
      if (incoming.phase === "countdown") {
        if (!incoming.countdown_ends_at || !incoming.server_now) return;
        countdownActiveRef.current = true;
        setMessage(incoming);
        setPhase("countdown");
        setCountdownStep(3);
        startSyncedCountdown(incoming.countdown_ends_at, incoming.server_now, (step) => {
          setCountdownStep(step);
        });
        return;
      }
      if (incoming.phase === "lobby") {
        if (countdownActiveRef.current || phaseRef.current === "countdown") {
          return;
        }
        const me = incoming.you?.id || myIdRef.current;
        const ids = (incoming.members || []).map((m) => m.id);
        const prev = lobbyMemberIdsRef.current;
        if (me && prev?.includes(me) && !ids.includes(me)) {
          playSfx("room_kick");
          lobbyMemberIdsRef.current = null;
          setPhase("closed");
          setError(incoming.kicked_message || "Host te je vrgel iz sobe.");
          setMessage(incoming);
          return;
        }
        if (prev) {
          if (incoming.lobby_event === "kicked") playSfx("room_kick");
          else {
            const added = ids.some((id) => !prev.includes(id));
            const removed = prev.some((id) => !ids.includes(id));
            if (added) playSfx("room_join");
            else if (removed || incoming.lobby_event === "left") playSfx("room_leave");
          }
        }
        lobbyMemberIdsRef.current = ids;
        setMessage(incoming);
        syncLobbyEditors(incoming);
        setPhase("lobby");
        setRematchBusy(false);
        return;
      }
      if (incoming.phase === "waiting") {
        // Snapshot ob connect ne sme prekiniti countdown UI (zvok bi tekel, zaslon pa "Pripravljam…").
        if (countdownActiveRef.current || phaseRef.current === "countdown") {
          return;
        }
        setPhase("waiting");
        setMessage(incoming);
        return;
      }
      if (incoming.phase === "question") {
        const qid = String(incoming.question?.game_question_id || "");
        if (incoming.bonus && incoming.bonus_member_id === myIdRef.current) {
          playSfx("bonus_use");
        }
        if (incoming.feedback) {
          setSixtyFlash(incoming.feedback);
          setSixtyTickKey((n) => n + 1);
          if (incoming.feedback.skipped) playSfx("click");
          else if (incoming.feedback.is_correct) playSfx("correct");
          else playSfx("wrong");
        } else if (qid && lastNextQuestionIdRef.current !== qid) {
          // Novo vprašanje — enkrat "next". Po countdown go prvo vprašanje brez next.
          lastNextQuestionIdRef.current = qid;
          cancelSfxSequence();
          if (skipNextSfxRef.current) {
            skipNextSfxRef.current = false;
          } else {
            playSfx("next");
          }
        }
        countdownActiveRef.current = false;
        stopQuestionCountdown();
        setCountdownStep(null);
        setMessage((current) => mergeDirkaMessage(current, incoming, myIdRef.current));
        commitDirkaRace(incoming, myIdRef.current, setDirkaRaceStandings, setDirkaRaceSafe);
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
            // Proga ostane na prejšnjem stanju — točke šele ob round_review.
            standings: current?.standings ?? merged.standings,
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
        return;
      }
      if (incoming.phase === "round_review") {
        const me = myIdRef.current;
        const mine = (incoming.answers || []).find((row) => row.member_id === me);
        const seq: SfxName[] = [];
        if (mine?.timed_out || mine?.skipped) seq.push("click");
        else if (mine?.is_correct) seq.push("correct");
        else if (mine) seq.push("wrong");
        const gained =
          mine?.bonuses_gained?.length
            ? mine.bonuses_gained
            : mine?.bonus_gained
              ? [mine.bonus_gained]
              : [];
        for (let i = 0; i < gained.length; i++) seq.push("bonus_gain");
        if (mine?.safe_reward) seq.push("safe_zone");
        if (seq.length) playSfxSequence(seq);
        setMessage((current) => mergeDirkaMessage(current, incoming, me));
        commitDirkaRace(incoming, me, setDirkaRaceStandings, setDirkaRaceSafe);
        setPhase("round_review");
        return;
      }
      if (incoming.phase === "review") {
        if (incoming.is_correct) {
          const crossedSafe =
            incoming.mode === "ala_milijonar" &&
            (incoming.safe_orders || []).includes((incoming.correct_count ?? 0) - 1);
          if (crossedSafe) playSfxSequence(["correct", "safe_zone"]);
          else playSfx("correct");
        } else if (!incoming.walked_away && !incoming.timed_out) playSfx("wrong");
        else if (incoming.timed_out) playSfx("click");
        setMessage(incoming);
        setPhase("review");
        setPickFriend(false);
        return;
      }
      if (incoming.phase === "finished" || incoming.type === "game_finished") {
        countdownActiveRef.current = false;
        stopQuestionCountdown();
        setCountdownStep(null);
        const endSeq: SfxName[] = [];
        if (incoming.feedback) {
          setSixtyFlash(incoming.feedback);
          setSixtyTickKey((n) => n + 1);
          if (incoming.feedback.skipped) endSeq.push("click");
          else if (incoming.feedback.is_correct) endSeq.push("correct");
          else endSeq.push("wrong");
        } else if (incoming.mode === "hitrarunda" || incoming.mode === "ala_milijonar") {
          if (incoming.is_correct) {
            endSeq.push("correct");
            if (
              incoming.mode === "ala_milijonar" &&
              (incoming.safe_orders || []).includes((incoming.correct_count ?? 0) - 1)
            ) {
              endSeq.push("safe_zone");
            }
          } else if (incoming.timed_out) endSeq.push("click");
          else if (!incoming.walked_away) endSeq.push("wrong");
        }
        endSeq.push("finish");
        playSfxSequence(endSeq);
        setMessage((current) => {
          const merged = mergeDirkaMessage(current, incoming, myIdRef.current);
          // 60s: ne obdrži starega clock_ends_at, sicer timer še teče ob finish zaslonu.
          if (merged.mode === "60_sekund") {
            const end = incoming.clock_ends_at || incoming.deadline_at || incoming.server_now;
            return {
              ...merged,
              clock_ends_at: end,
              deadline_at: end,
              clock_remaining_ms: 0,
            };
          }
          return merged;
        });
        commitDirkaRace(incoming, myIdRef.current, setDirkaRaceStandings, setDirkaRaceSafe);
        setPhase("finished");
        setPickFriend(false);
      }
    }

    function connect() {
      if (stopped) return;
      const socket = new WebSocket(`${proto}://${window.location.host}/ws/game/${code}/`);
      wsRef.current = socket;
      socket.onopen = () => {
        if (stopped) return;
        attempt = 0;
        setReconnectNote("");
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
              if (room.status === "waiting") {
                socket.send(JSON.stringify({ type: "lobby_sync" }));
              } else if (room.status === "playing") {
                // Mid-game: strežnik pošlje snapshot ob connect; dodatno sync za zanesljivost.
                socket.send(JSON.stringify({ type: "lobby_sync" }));
              }
            } else if (
              (room.settings?.mode === "hitrarunda" ||
                room.settings?.mode === "ala_milijonar" ||
                room.settings?.mode === "60_sekund") &&
              room.status === "waiting"
            ) {
              // Samo pred prvo igro — ne ob osvežitvi končane sobe (finished).
              countdownActiveRef.current = true;
              setCountdownStep(3);
              setPhase("countdown");
              startQuestionCountdown(
                (step) => {
                  if (!stopped) setCountdownStep(step);
                },
                () => {
                  if (stopped || socket.readyState !== WebSocket.OPEN) return;
                  skipNextSfxRef.current = true;
                  // Ostani na "1 · Zdaj" dokler ne pride vprašanje (sicer blisk Pripravljeni).
                  socket.send(JSON.stringify({ type: "start_game" }));
                },
              );
            } else if (room.status === "finished" || room.status === "closed") {
              // Snapshot pride po WS; ne zaženi countdown/start_game.
            } else {
              socket.send(JSON.stringify({ type: "start_game" }));
            }
          })
          .catch((err) => {
            if (stopped) return;
            const detail = err instanceof ApiError ? err.message : "";
            if (detail.includes("zaprta") || detail.includes("ne obstaja")) {
              setError(detail || "Soba ni na voljo.");
              setPhase("closed");
              stopped = true;
              socket.close();
              return;
            }
            socket.send(JSON.stringify({ type: "start_game" }));
          });
      };
      socket.onmessage = (event) => {
        if (stopped) return;
        try {
          handleMessage(JSON.parse(event.data) as GameMessage);
        } catch {
          setError("Neveljavno sporočilo strežnika.");
        }
      };
      socket.onclose = () => {
        if (stopped) return;
        attempt += 1;
        if (attempt > 8) {
          setError("Povezava je prekinjena. Osveži stran ali se vrni v lobby.");
          setPhase("error");
          setReconnectNote("");
          return;
        }
        const delay = Math.min(8000, 600 * 2 ** (attempt - 1));
        setReconnectNote(`Ponovna povezava čez ${Math.ceil(delay / 1000)} s… (${attempt}/8)`);
        setPhase((current) =>
          current === "finished" || current === "closed" || current === "countdown"
            ? current
            : "connecting",
        );
        retryTimer = window.setTimeout(connect, delay);
      };
    }

    connect();
    return () => {
      stopped = true;
      countdownActiveRef.current = false;
      stopQuestionCountdown();
      if (retryTimer) window.clearTimeout(retryTimer);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reconnect loop binds to room code only
  }, [code]);

  async function leaveRoom() {
    if (leaving) return;
    setLeaving(true);
    try {
      await api(`/api/rooms/${code}/leave/`, { method: "POST", body: "{}" });
    } catch {
      // Vseeno odidi — WS/HTTP lahko že odpade.
    }
    lobbyMemberIdsRef.current = null;
    wsRef.current?.close();
    const mode = message?.settings?.mode || message?.mode;
    navigate(mode === "dirka" ? "/igra/dirka" : mode === "multiplayer" ? "/igra/vec-igralcev" : "/igra");
  }

  async function kickMember(memberId: string) {
    if (!memberId || kickingId) return;
    setKickingId(memberId);
    try {
      await api(`/api/rooms/${code}/kick/`, {
        method: "POST",
        body: JSON.stringify({ member_id: memberId }),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kick ni uspel.");
    } finally {
      setKickingId("");
    }
  }

  function next() {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    unlockSfx();
    // Zvok "next" samo ob prejetem question dogodku (sicer 2×: tukaj + handleMessage).
    socket.send(JSON.stringify({ type: "next_question" }));
  }

  function requestRematch() {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || rematchBusy) return;
    setRematchBusy(true);
    socket.send(JSON.stringify({ type: "rematch" }));
    window.setTimeout(() => setRematchBusy(false), 2500);
  }

  function useHelp(effect: string, friendKey?: string) {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !message?.question || phase !== "question") return;
    unlockSfx();
    playSfx("bonus_use");
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
  const dirkaMe = isDirka && myId ? message?.players?.[myId] : undefined;
  const showDirkaChrome = isDirka && playing;
  const boardPath = modeBoardPath(message?.mode);
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
      setEditCount(lobbyCounts.includes(settings.question_count) ? settings.question_count : lobbyCounts[0] ?? 10);
    }
    if (settings.time_limit_seconds) {
      const times = settings.mode === "dirka" ? dirkaTimes : lobbyTimes;
      setEditSeconds(
        times.includes(settings.time_limit_seconds) ? settings.time_limit_seconds : times[0] ?? 30,
      );
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
    unlockSfx();
    playSfx(ready ? "correct" : "click");
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
    return Math.max(0, Math.min(maxBots, maxPlayers - humanCount()));
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
    const maxPlayers = Math.min(maxPlayersCap, Math.max(overrides.max_players ?? editMax, humanCount(), 2));
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
              time_limit_seconds: overrides.time_limit_seconds ?? editSeconds,
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
        <div className="stage-head-row">
          <p className="eyebrow">
            {message?.mode ? formatMode(message.mode) : "Igra"} · soba {code}
            {message?.sudden_death ? " · sudden death" : ""}
          </p>
          {phase === "lobby" ||
          phase === "question" ||
          phase === "waiting_answers" ||
          phase === "round_review" ||
          phase === "submitting" ? (
            <button type="button" className="ghost-leave" disabled={leaving} onClick={() => void leaveRoom()}>
              {leaving ? "…" : "Zapusti"}
            </button>
          ) : null}
        </div>
        {phase === "countdown" || countdownStep != null ? (
          <div className="question-countdown" aria-live="polite">
            <p className="eyebrow">
              {countdownStep === 3
                ? "Pripravljeni…"
                : countdownStep === 2
                  ? "Pozor…"
                  : "Zdaj…"}
            </p>
            <p key={String(countdownStep ?? 1)} className="question-countdown-n">
              {countdownStep ?? 1}
            </p>
          </div>
        ) : phase === "connecting" || phase === "waiting" ? (
          <p className="status">{reconnectNote || "Pripravljam vprašanja…"}</p>
        ) : null}
        {reconnectNote && phase !== "connecting" && phase !== "waiting" ? (
          <p className="fine">{reconnectNote}</p>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        {phase === "closed" || phase === "error" ? (
          <div className="stack">
            <h1>{phase === "closed" ? "Soba je zaprta" : "Povezava prekinjena"}</h1>
            <p className="fine">{error || "Vrni se v izbiro igre in poskusi znova."}</p>
            <div className="actions">
              <Link className="primary" to="/igra">
                Nazaj na igre
              </Link>
              {phase === "error" ? (
                <button type="button" onClick={() => window.location.reload()}>
                  Osveži
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {phase === "lobby" && message ? (
          <GameLobby
            message={message}
            myId={myId}
            iAmHost={iAmHost}
            iAmReady={iAmReady}
            leaving={leaving}
            inviteName={inviteName}
            setInviteName={setInviteName}
            copyNotice={copyNotice}
            categories={categories}
            lobbyTimes={(message.settings?.mode || message.mode) === "dirka" ? dirkaTimes : lobbyTimes}
            lobbyCounts={lobbyCounts}
            lobbyTargets={lobbyTargets}
            lobbySafe={lobbySafe}
            maxPlayersCap={maxPlayersCap}
            editCount={editCount}
            setEditCount={setEditCount}
            editSeconds={editSeconds}
            setEditSeconds={setEditSeconds}
            editMax={editMax}
            editVisibility={editVisibility}
            setEditVisibility={setEditVisibility}
            editPassword={editPassword}
            setEditPassword={setEditPassword}
            editSudden={editSudden}
            setEditSudden={setEditSudden}
            editBots={editBots}
            editTarget={editTarget}
            setEditTarget={setEditTarget}
            editSafe={editSafe}
            setEditSafe={setEditSafe}
            editCats={editCats}
            setEditCats={setEditCats}
            lobbyInviteUrl={lobbyInviteUrl}
            copyInviteLink={() => void copyInviteLink()}
            sendReady={sendReady}
            startMulti={startMulti}
            leaveRoom={() => void leaveRoom()}
            kickMember={(id) => void kickMember(id)}
            kickingId={kickingId}
            sendInvite={sendInvite}
            saveLobbySettings={() => saveLobbySettings()}
            changeBots={changeBots}
            changeMaxPlayers={changeMaxPlayers}
            maxBotsFor={maxBotsFor}
          />
        ) : null}
        {phase === "finished" && message && (message.mode === "multiplayer" || message.mode === "dirka") ? (
          <PodiumFinish
            message={message}
            myId={myId}
            boardPath={boardPath}
            canRematch={iAmHost}
            onRematch={requestRematch}
            rematchBusy={rematchBusy}
          />
        ) : null}
        {question &&
        message &&
        playing &&
        !(phase === "finished" && (message.mode === "multiplayer" || message.mode === "dirka")) ? (
          <GamePlayBody
            message={message}
            phase={phase}
            myId={myId}
            iAmHost={iAmHost}
            isDirka={isDirka}
            isSixty={isSixty}
            boardPath={boardPath}
            sixtyFlash={sixtyFlash}
            sixtyTickKey={sixtyTickKey}
            expire={expire}
            sendAnswer={sendAnswer}
            skipSixty={skipSixty}
            useHelp={useHelp}
            useDirkaBonus={useDirkaBonus}
            walkAway={walkAway}
            next={next}
            pickFriend={pickFriend}
            setPickFriend={setPickFriend}
          />
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
            standings={dirkaRaceStandings.length ? dirkaRaceStandings : standings}
            targetScore={message.target_score || message.settings?.target_score || 200}
            myId={myId}
            mySafeProgress={
              dirkaRaceSafe || {
                current: dirkaMe?.correct_in_segment ?? 0,
                every: dirkaMe?.safe_every ?? message.safe_every ?? 5,
                until: dirkaMe?.until_safe ?? message.safe_every ?? 5,
              }
            }
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
        <div className="mp-ladder-wrap">
          <ol className="ladder">
            {standings.map((row) => {
              const answeredIds = new Set(message?.answered_ids || []);
              const answerById = new Map((message?.answers || []).map((item) => [item.member_id || "", item]));
              const answer = answerById.get(row.member_id);
              const classes = [
                row.member_id === myId ? "current" : "",
                (phase === "question" || phase === "submitting" || phase === "waiting_answers") &&
                answeredIds.has(row.member_id)
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
                  <span className="ladder-player">
                    <Avatar avatar={row.avatar} color={row.color || "#7dcea0"} size={28} title={row.nickname} />
                    <span>
                      #{row.rank || "?"} {row.nickname}
                      {row.is_bot ? " (AI)" : ""}
                      {row.alive === false ? " · izločen" : ""}
                    </span>
                  </span>
                  <span>
                    {formatPoints(row.score)}
                    {row.streak && row.streak > 1 ? ` · streak ${row.streak}` : ""}
                  </span>
                </li>
              );
            })}
          </ol>
          {phase === "waiting_answers" ||
          (phase === "question" && (message?.answered_count ?? 0) > 0) ? (
            <p
              className={["wait-banner", phase === "question" ? "wait-banner-soft" : ""]
                .filter(Boolean)
                .join(" ")}
              aria-live="polite"
            >
              Čakam še: {(message?.waiting_for || []).join(", ") || "nikogar"}
              <span className="wait-banner-count">
                {" "}
                ({message?.answered_count}/{message?.player_count})
              </span>
            </p>
          ) : null}
        </div>
      ) : message?.mode === "ala_milijonar" && ladder.length > 0 ? (
        <ol className="ladder">
          {[...ladder].reverse().map((prize, reversed) => {
            const index = ladder.length - 1 - reversed;
            const reached = index < (message?.correct_count ?? 0);
            const current = phase === "question" && index === message?.index;
            const safe = safeOrders.has(index);
            const className = [reached ? "reached" : "", current ? "current" : "", safe ? "safe" : ""].filter(Boolean).join(" ");
            return (
              <li key={index} className={className}>
                <span className="ladder-mark" aria-hidden>
                  {safe ? "★" : ""}
                </span>
                <span className="ladder-amount">{formatPoints(prize)}</span>
              </li>
            );
          })}
        </ol>
      ) : message?.mode === "hitrarunda" && playing ? (
        <aside className="hr-score-side" aria-label="Točke">
          <p className="eyebrow">Točke</p>
          <p className="hr-score-value">{formatPoints(message.score ?? 0)}</p>
          <p className="fine">
            {formatPoints(message.prize_reached ?? 0)} + bonus{" "}
            {formatPoints(message.speed_bonus_total ?? 0)}
          </p>
          <p className="fine">
            {message.correct_count ?? 0}/{message.total_questions ?? message.total ?? 0} pravilnih
          </p>
        </aside>
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

function commitDirkaRace(
  incoming: GameMessage,
  myId: string,
  setStandings: (rows: StandingRow[]) => void,
  setSafe: (safe: { current: number; every: number; until: number } | null) => void,
) {
  if (incoming.mode !== "dirka") return;
  if (incoming.standings) setStandings(incoming.standings);
  const me = myId ? incoming.players?.[myId] : undefined;
  setSafe({
    current: me?.correct_in_segment ?? 0,
    every: me?.safe_every ?? incoming.safe_every ?? 5,
    until: me?.until_safe ?? incoming.safe_every ?? 5,
  });
}

