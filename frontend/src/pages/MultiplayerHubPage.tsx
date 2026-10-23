import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { NicknameField } from "../components/NicknameField";
import { NumberStepper } from "../components/NumberStepper";
import { ModePageNav } from "../gameModes";
import type { Category } from "../types";

type LobbyRoom = {
  code: string;
  name: string;
  member_count: number;
  max_players: number;
  has_password: boolean;
  host_nickname?: string;
  link?: string;
  settings: {
    question_count?: number;
    time_limit_seconds?: number;
    sudden_death?: boolean;
    bot_count?: number;
  };
};

const DEFAULT_TIMES = [30, 60, 90, 120, 300];
const DEFAULT_COUNTS = [5, 10, 20, 40, 50, 100];

function formatTime(seconds: number) {
  if (seconds < 120) return `${seconds} s`;
  return `${seconds / 60} min`;
}

export function MultiplayerHubPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"create" | "join" | "public">("create");
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [nickname, setNickname] = useState(user?.nickname ?? "");
  const [visibility, setVisibility] = useState<"public" | "private" | "unlisted">("public");
  const [password, setPassword] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [count, setCount] = useState(10);
  const [seconds, setSeconds] = useState(60);
  const [suddenDeath, setSuddenDeath] = useState(false);
  const [botCount, setBotCount] = useState(0);
  const [joinCode, setJoinCode] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [publicRooms, setPublicRooms] = useState<LobbyRoom[]>([]);
  const [invites, setInvites] = useState<LobbyRoom[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [times, setTimes] = useState(DEFAULT_TIMES);
  const [counts, setCounts] = useState(DEFAULT_COUNTS);
  const [maxPlayersCap, setMaxPlayersCap] = useState(6);
  const [maxBots, setMaxBots] = useState(5);

  useEffect(() => {
    api<{ categories: Category[] }>("/api/categories/")
      .then((data) => {
        setCategories(data.categories);
        setSelected(data.categories.map((item) => item.slug));
      })
      .catch(() => setError("Kategorij ni bilo mogoče naložiti."));
    api<{
      multiplayer?: {
        times?: number[];
        question_counts?: number[];
        max_players?: number;
        max_bots?: number;
      };
    }>("/api/game-config/")
      .then((cfg) => {
        const mp = cfg.multiplayer;
        if (mp?.times?.length) {
          setTimes(mp.times);
          setSeconds((current) => (mp.times!.includes(current) ? current : mp.times![0]));
        }
        if (mp?.question_counts?.length) {
          setCounts(mp.question_counts);
          setCount((current) => (mp.question_counts!.includes(current) ? current : mp.question_counts![0]));
        }
        if (mp?.max_players) {
          setMaxPlayersCap(mp.max_players);
          setMaxPlayers((current) => Math.min(current, mp.max_players!));
        }
        if (typeof mp?.max_bots === "number") {
          setMaxBots(mp.max_bots);
          setBotCount((current) => Math.min(current, mp.max_bots!));
        }
      })
      .catch(() => undefined);
    api<{ rooms: LobbyRoom[] }>("/api/rooms/public/?mode=multiplayer")
      .then((data) => setPublicRooms(data.rooms))
      .catch(() => setPublicRooms([]));
    api<{ rooms: LobbyRoom[] }>("/api/rooms/invites/?mode=multiplayer")
      .then((data) => setInvites(data.rooms))
      .catch(() => setInvites([]));
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const room = await api<{ code: string }>("/api/rooms/", {
        method: "POST",
        body: JSON.stringify({
          mode: "multiplayer",
          nickname,
          visibility,
          password: visibility === "private" ? password : "",
          max_players: maxPlayers,
          question_count: count,
          time_limit_seconds: seconds,
          categories: selected,
          sudden_death: suddenDeath,
          bot_count: botCount,
        }),
      });
      navigate(`/igra/${room.code}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sobe ni bilo mogoče ustvariti.");
    } finally {
      setPending(false);
    }
  }

  async function onJoin(event: FormEvent, code = joinCode, pass = joinPassword) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const room = await api<{ code: string }>(`/api/rooms/${code.trim().toUpperCase()}/join/`, {
        method: "POST",
        body: JSON.stringify({ nickname, password: pass }),
      });
      navigate(`/igra/${room.code}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Pridružitev ni uspela.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Hitra tekma</p>
      <h1>Skupna soba</h1>
      <ModePageNav boardTo="/lestvica/vec-igralcev" />
      <div className="tabs content-tabs" role="tablist">
        <button type="button" className={tab === "create" ? "is-on" : ""} onClick={() => setTab("create")}>
          Ustvari
        </button>
        <button type="button" className={tab === "join" ? "is-on" : ""} onClick={() => setTab("join")}>
          Pridruži se
        </button>
        <button type="button" className={tab === "public" ? "is-on" : ""} onClick={() => setTab("public")}>
          Javne sobe
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}

      {tab === "create" ? (
        <form className="stack" onSubmit={onCreate}>
          <NicknameField value={nickname} onChange={setNickname} required />
          <fieldset>
            <legend>Vidnost</legend>
            <label className="check">
              <input type="radio" checked={visibility === "public"} onChange={() => setVisibility("public")} />
              Javna
            </label>
            <label className="check">
              <input type="radio" checked={visibility === "unlisted"} onChange={() => setVisibility("unlisted")} />
              Skrita (samo link)
            </label>
            <label className="check">
              <input type="radio" checked={visibility === "private"} onChange={() => setVisibility("private")} />
              Zasebna (geslo)
            </label>
          </fieldset>
          {visibility === "private" ? (
            <label>
              Geslo
              <input value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
          ) : null}
          <NumberStepper
            label="Največ igralcev"
            value={maxPlayers}
            min={2}
            max={maxPlayersCap}
            onChange={(value) => {
              setMaxPlayers(value);
              setBotCount((current) => Math.min(current, Math.max(0, Math.min(maxBots, value - 1))));
            }}
          />
          <fieldset>
            <legend>Kategorije</legend>
            {categories.map((category) => (
              <label key={category.slug} className="check">
                <input
                  type="checkbox"
                  checked={selected.includes(category.slug)}
                  onChange={() =>
                    setSelected((current) =>
                      current.includes(category.slug) ? current.filter((item) => item !== category.slug) : [...current, category.slug],
                    )
                  }
                />
                {category.name}
              </label>
            ))}
          </fieldset>
          <NumberStepper label="Število vprašanj" value={count} options={counts} onChange={setCount} />
          <div className="stack-gap">
            <span className="stepper-label">Čas na vprašanje</span>
            <div className="choices" role="group" aria-label="Čas na vprašanje">
              {times.map((time) => (
                <button key={time} type="button" className={time === seconds ? "is-on" : ""} onClick={() => setSeconds(time)}>
                  {formatTime(time)}
                </button>
              ))}
            </div>
          </div>
          <NumberStepper
            label="AI nasprotniki"
            value={botCount}
            min={0}
            max={Math.max(0, Math.min(maxBots, maxPlayers - 1))}
            onChange={setBotCount}
          />
          <p className="fine">AI + ti ne sme preseči največ igralcev ({maxPlayers}).</p>
          <label className="check">
            <input type="checkbox" checked={suddenDeath} onChange={(event) => setSuddenDeath(event.target.checked)} />
            Sudden death (napačen odgovor te izloči)
          </label>
          <button className="primary" type="submit" disabled={pending || selected.length === 0}>
            Ustvari sobo
          </button>
        </form>
      ) : null}

      {tab === "join" ? (
        <form className="stack" onSubmit={(event) => void onJoin(event)}>
          <NicknameField value={nickname} onChange={setNickname} required />
          <label>
            Koda sobe
            <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} maxLength={8} required />
          </label>
          <label>
            Geslo (če je zasebna)
            <input value={joinPassword} onChange={(event) => setJoinPassword(event.target.value)} />
          </label>
          <button className="primary" type="submit" disabled={pending}>
            Pridruži se
          </button>
          {invites.length > 0 ? (
            <>
              <h2>Povabila</h2>
              <div className="admin-list">
                {invites.map((room) => (
                  <article key={room.code} className="admin-card">
                    <h2>{room.name || room.code}</h2>
                    <p className="fine">
                      Host: {room.host_nickname || "—"} · {room.member_count}/{room.max_players}
                    </p>
                    <p className="fine">
                      <code>/igra/{room.code}</code>
                    </p>
                    <button type="button" className="primary" onClick={(event) => void onJoin(event, room.code, "")}>
                      Sprejmi
                    </button>
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </form>
      ) : null}

      {tab === "public" ? (
        <div className="stack">
          <NicknameField value={nickname} onChange={setNickname} required />
          {publicRooms.length === 0 ? <p className="fine">Ni odprtih javnih sob.</p> : null}
          <div className="admin-list">
            {publicRooms.map((room) => (
              <article key={room.code} className="admin-card">
                <h2>{room.name || "Hitra tekma"}</h2>
                <p className="fine">
                  Host: <strong>{room.host_nickname || "—"}</strong> · {room.member_count}/{room.max_players} igralcev
                </p>
                <p className="fine">
                  Koda: <code>{room.code}</code> · <code>/igra/{room.code}</code>
                </p>
                <p className="fine">
                  {room.settings.question_count ?? "?"} vprašanj · {formatTime(room.settings.time_limit_seconds ?? 60)}
                  {room.settings.bot_count ? ` · ${room.settings.bot_count} AI` : ""}
                  {room.settings.sudden_death ? " · sudden death" : ""}
                  {room.has_password ? " · geslo" : ""}
                </p>
                <button
                  type="button"
                  className="primary"
                  disabled={pending}
                  onClick={(event) => void onJoin(event, room.code, room.has_password ? joinPassword : "")}
                >
                  Pridruži se
                </button>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
