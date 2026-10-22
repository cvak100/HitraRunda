import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { formatMode } from "../format";
import type { Category, GameMode, PhoneFriend } from "../types";

const TIMES = [10, 15, 20, 30, 45, 60];

function modeFromPath(pathname: string): GameMode | null {
  if (pathname.includes("/ala-milijonar")) return "ala_milijonar";
  if (pathname.includes("/hitrarunda")) return "hitrarunda";
  return null;
}

export function SetupPage() {
  const location = useLocation();
  const mode = modeFromPath(location.pathname);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [friends, setFriends] = useState<PhoneFriend[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [friendKeys, setFriendKeys] = useState<string[]>([]);
  const [count, setCount] = useState(10);
  const [seconds, setSeconds] = useState(20);
  const [nickname, setNickname] = useState(user?.nickname ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api<{ categories: Category[] }>("/api/categories/")
      .then((data) => {
        setCategories(data.categories);
        setSelected(data.categories.map((category) => category.slug));
      })
      .catch(() => setError("Kategorij ni bilo mogoče naložiti."));
    if (mode === "ala_milijonar") {
      api<{ friends: PhoneFriend[] }>("/api/friends/")
        .then((data) => setFriends(data.friends))
        .catch(() => setFriends([]));
    }
  }, [mode]);

  const available = useMemo(
    () =>
      categories
        .filter((category) => selected.includes(category.slug))
        .reduce(
          (sum, category) =>
            sum + (mode === "ala_milijonar" ? category.classic_question_count ?? 0 : category.question_count),
          0,
        ),
    [categories, selected, mode],
  );
  const maxCount = Math.min(15, available);
  const alaReady = mode !== "ala_milijonar" || (available >= 15 && friendKeys.length === 3);

  useEffect(() => {
    if (mode === "ala_milijonar") setCount(15);
    else if (available >= 5) setCount((current) => Math.min(Math.max(current, 5), Math.min(15, available)));
  }, [available, mode]);

  if (!mode) {
    return (
      <section className="panel">
        <p className="error">Neznana igra.</p>
        <Link to="/igra">Nazaj</Link>
      </section>
    );
  }

  function toggle(slug: string) {
    setSelected((current) => (current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]));
  }

  function toggleFriend(key: string) {
    setFriendKeys((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key);
      if (current.length >= 3) return current;
      return [...current, key];
    });
  }

  async function generate() {
    const data = await api<{ nickname: string }>("/api/auth/nickname/");
    setNickname(data.nickname);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        nickname,
        mode,
        question_count: mode === "ala_milijonar" ? 15 : count,
        categories: selected,
        time_limit_seconds: seconds,
      };
      if (mode === "ala_milijonar") body.friend_keys = friendKeys;
      const room = await api<{ code: string }>("/api/rooms/", {
        method: "POST",
        body: JSON.stringify(body),
      });
      navigate(`/igra/${room.code}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sobe ni bilo mogoče odpreti.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">{formatMode(mode)}</p>
      <h1>Nastavi rundo</h1>
      <p className="fine">
        <Link to="/igra">← Druge igre</Link>
        {" · "}
        <Link to={mode === "ala_milijonar" ? "/lestvica/ala-milijonar" : "/lestvica/hitrarunda"}>Lestvica</Link>
      </p>
      <form onSubmit={onSubmit} className="stack">
        <label>
          Vzdevek v tej igri
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={30} required />
        </label>
        <button type="button" onClick={() => void generate()}>
          Naključni vzdevek
        </button>
        <fieldset>
          <legend>Kategorije</legend>
          {categories.map((category) => (
            <label key={category.slug} className="check">
              <input type="checkbox" checked={selected.includes(category.slug)} onChange={() => toggle(category.slug)} />
              {category.name}
              <span className="fine">
                {mode === "ala_milijonar" ? category.classic_question_count ?? 0 : category.question_count} vprašanj
              </span>
            </label>
          ))}
        </fieldset>
        {mode === "hitrarunda" ? (
          <label>
            Število vprašanj: {count}
            <input
              type="range"
              min={5}
              max={Math.max(5, maxCount)}
              value={Math.min(count, Math.max(5, maxCount))}
              disabled={available < 5}
              onChange={(event) => setCount(Number(event.target.value))}
            />
          </label>
        ) : (
          <p className="fine">
            Vedno 15 vprašanj s 4 odgovori, stopnjevano po težavnosti 1→5 (po 3 na stopnjo). Varne točke na 5. in
            10. vprašanju, odnehaj in 3 jokerji (na voljo {available}).
          </p>
        )}
        {mode === "ala_milijonar" ? (
          <fieldset>
            <legend>Prijatelji za klic v sili ({friendKeys.length}/3)</legend>
            <div className="friend-grid">
              {friends.map((friend) => {
                const on = friendKeys.includes(friend.key);
                return (
                  <button
                    key={friend.key}
                    type="button"
                    className={`friend-card ${on ? "is-on" : ""}`}
                    style={{ ["--friend-color" as string]: friend.avatar_color }}
                    onClick={() => toggleFriend(friend.key)}
                  >
                    <strong>{friend.name}</strong>
                    <span>{friend.title}</span>
                    <span className="fine">{friend.bio}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}
        <div className="choices" role="group" aria-label="Čas na vprašanje">
          {TIMES.map((time) => (
            <button key={time} type="button" className={time === seconds ? "is-on" : ""} onClick={() => setSeconds(time)}>
              {time} s
            </button>
          ))}
        </div>
        <p className="fine">Prvi napačen ali prepozen odgovor konča igro.</p>
        {error ? <p className="error">{error}</p> : null}
        <button
          className="primary"
          type="submit"
          disabled={pending || selected.length === 0 || !alaReady || (mode === "hitrarunda" && available < 5)}
        >
          Začni
        </button>
      </form>
    </section>
  );
}
