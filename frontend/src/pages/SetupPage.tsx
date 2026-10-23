import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { NicknameField } from "../components/NicknameField";
import { formatMode } from "../format";
import { BackNav, ModePageNav } from "../gameModes";
import type { Category, GameMode, PhoneFriend } from "../types";

const TIMES = [10, 15, 20, 30, 45, 60];
const SKIP_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Neomejeno" },
  { value: 3, label: "3" },
  { value: 5, label: "5" },
  { value: 10, label: "10" },
];
const PROFILE_OPTIONS = [
  { value: "mild", label: "Blago" },
  { value: "normal", label: "Normalno" },
  { value: "sharp", label: "Ostro" },
] as const;

function modeFromPath(pathname: string): GameMode | null {
  if (pathname.includes("/ala-milijonar")) return "ala_milijonar";
  if (pathname.includes("/hitrarunda")) return "hitrarunda";
  if (pathname.includes("/60-sekund")) return "60_sekund";
  return null;
}

function boardPath(mode: GameMode) {
  if (mode === "ala_milijonar") return "/lestvica/ala-milijonar";
  if (mode === "60_sekund") return "/lestvica/60-sekund";
  return "/lestvica/hitrarunda";
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
  const [skipLimit, setSkipLimit] = useState<number | null>(null);
  const [difficultyProfile, setDifficultyProfile] = useState<"mild" | "normal" | "sharp">("normal");
  const [nickname, setNickname] = useState(user?.nickname ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const isSixty = mode === "60_sekund";

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
    else if (mode === "hitrarunda" && available >= 5) {
      setCount((current) => Math.min(Math.max(current, 5), Math.min(15, available)));
    }
  }, [available, mode]);

  if (!mode) {
    return (
      <section className="panel">
        <h1>Neznana igra</h1>
        <BackNav to="/igra" />
        <p className="error">Te poti ni med znanimi načini.</p>
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

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        nickname,
        mode,
        categories: selected,
      };
      if (mode === "ala_milijonar") {
        body.question_count = 15;
        body.time_limit_seconds = 90;
        body.friend_keys = friendKeys;
      } else if (isSixty) {
        body.skip_limit = skipLimit;
        body.difficulty_profile = difficultyProfile;
      } else {
        body.question_count = count;
        body.time_limit_seconds = seconds;
      }
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
      <ModePageNav boardTo={boardPath(mode)} />
      <form onSubmit={onSubmit} className="stack">
        <NicknameField label="Vzdevek v tej igri" value={nickname} onChange={setNickname} required />
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
        ) : null}
        {mode === "ala_milijonar" ? (
          <p className="fine">
            Vedno 15 vprašanj s 4 odgovori, 90 s na vprašanje, težavnost 1→5 (po 3 na stopnjo). Varne točke na 5. in
            10. vprašanju, odnehaj in 3 jokerji (na voljo {available}).
          </p>
        ) : null}
        {isSixty ? (
          <>
            <p className="fine">
              60 s skupni čas. Pravilno +2 s, napačno −5 s, preskok −2 s.
            </p>
            <fieldset>
              <legend>Preskoki</legend>
              <div className="choices" role="group" aria-label="Preskoki">
                {SKIP_OPTIONS.map((option) => (
                  <button
                    key={String(option.value)}
                    type="button"
                    className={skipLimit === option.value ? "is-on" : ""}
                    onClick={() => setSkipLimit(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Težavnost skozi čas</legend>
              <div className="choices" role="group" aria-label="Težavnostni profil">
                {PROFILE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={difficultyProfile === option.value ? "is-on" : ""}
                    onClick={() => setDifficultyProfile(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="fine">
                Normalno: po 1 min tež. 4–5, po 2 min samo 5. Blago počasneje, ostro hitreje.
              </p>
            </fieldset>
          </>
        ) : null}
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
        {mode === "hitrarunda" ? (
          <div className="choices" role="group" aria-label="Čas na vprašanje">
            {TIMES.map((time) => (
              <button key={time} type="button" className={time === seconds ? "is-on" : ""} onClick={() => setSeconds(time)}>
                {time} s
              </button>
            ))}
          </div>
        ) : null}
        {mode === "hitrarunda" || mode === "ala_milijonar" ? (
          <p className="fine">Prvi napačen ali prepozen odgovor konča igro.</p>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        <button
          className="primary"
          type="submit"
          disabled={
            pending ||
            selected.length === 0 ||
            !alaReady ||
            (mode === "hitrarunda" && available < 5) ||
            (isSixty && available < 5)
          }
        >
          Začni
        </button>
      </form>
    </section>
  );
}
