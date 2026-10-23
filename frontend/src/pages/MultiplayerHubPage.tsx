import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import type { Category } from "../types";

type LobbyRoom = {
  code: string;
  name: string;
  member_count: number;
  max_players: number;
  has_password: boolean;
  settings: { question_count?: number; time_limit_seconds?: number };
};

const TIMES = [10, 15, 20, 30, 45, 60];

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
  const [seconds, setSeconds] = useState(20);
  const [suddenDeath, setSuddenDeath] = useState(false);
  const [botCount, setBotCount] = useState(0);
  const [joinCode, setJoinCode] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [publicRooms, setPublicRooms] = useState<LobbyRoom[]>([]);
  const [invites, setInvites] = useState<LobbyRoom[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api<{ categories: Category[] }>("/api/categories/")
      .then((data) => {
        setCategories(data.categories);
        setSelected(data.categories.map((item) => item.slug));
      })
      .catch(() => setError("Kategorij ni bilo mogoče naložiti."));
    api<{ rooms: LobbyRoom[] }>("/api/rooms/public/")
      .then((data) => setPublicRooms(data.rooms))
      .catch(() => setPublicRooms([]));
    api<{ rooms: LobbyRoom[] }>("/api/rooms/invites/")
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
      <p className="eyebrow">Več igralcev</p>
      <h1>Skupna soba</h1>
      <p className="fine">
        <Link to="/igra">← Druge igre</Link>
      </p>
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
          <label>
            Vzdevek
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={30} required />
          </label>
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
          <label>
            Največ igralcev: {maxPlayers}
            <input type="range" min={2} max={6} value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))} />
          </label>
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
          <label>
            Število vprašanj: {count}
            <input type="range" min={5} max={15} value={count} onChange={(event) => setCount(Number(event.target.value))} />
          </label>
          <div className="choices" role="group" aria-label="Čas">
            {TIMES.map((time) => (
              <button key={time} type="button" className={time === seconds ? "is-on" : ""} onClick={() => setSeconds(time)}>
                {time} s
              </button>
            ))}
          </div>
          <label>
            AI nasprotniki: {botCount}
            <input type="range" min={0} max={3} value={botCount} onChange={(event) => setBotCount(Number(event.target.value))} />
          </label>
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
          <label>
            Vzdevek
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={30} required />
          </label>
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
                      {room.member_count}/{room.max_players} · {room.code}
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
          <label>
            Vzdevek
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={30} required />
          </label>
          {publicRooms.length === 0 ? <p className="fine">Ni odprtih javnih sob.</p> : null}
          <div className="admin-list">
            {publicRooms.map((room) => (
              <article key={room.code} className="admin-card">
                <h2>{room.name || room.code}</h2>
                <p className="fine">
                  {room.member_count}/{room.max_players} · {room.settings.question_count ?? "?"} vprašanj ·{" "}
                  {room.settings.time_limit_seconds ?? "?"} s
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
