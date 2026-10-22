import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import type { Category } from "../types";

const TIMES = [10, 15, 20, 30, 45, 60];

export function SetupPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
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
  }, []);

  const available = useMemo(
    () => categories.filter((category) => selected.includes(category.slug)).reduce((sum, category) => sum + category.question_count, 0),
    [categories, selected],
  );
  const maxCount = Math.min(15, available);

  useEffect(() => {
    if (available >= 5) setCount((current) => Math.min(Math.max(current, 5), Math.min(15, available)));
  }, [available]);

  function toggle(slug: string) {
    setSelected((current) => (current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]));
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
      const room = await api<{ code: string }>("/api/rooms/", {
        method: "POST",
        body: JSON.stringify({
          nickname,
          question_count: count,
          categories: selected,
          time_limit_seconds: seconds,
        }),
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
      <p className="eyebrow">Milijonar</p>
      <h1>Nastavi rundo</h1>
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
              <input
                type="checkbox"
                checked={selected.includes(category.slug)}
                onChange={() => toggle(category.slug)}
              />
              {category.name}
              <span className="fine">{category.question_count} vprašanj</span>
            </label>
          ))}
        </fieldset>
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
        <div className="choices" role="group" aria-label="Čas na vprašanje">
          {TIMES.map((time) => (
            <button key={time} type="button" className={time === seconds ? "is-on" : ""} onClick={() => setSeconds(time)}>
              {time} s
            </button>
          ))}
        </div>
        <p className="fine">Na voljo je {available} vprašanj v izbranih kategorijah. Prvi napačen ali prepozen odgovor konča igro.</p>
        {error ? <p className="error">{error}</p> : null}
        <button className="primary" type="submit" disabled={pending || available < 5 || selected.length === 0}>
          Začni
        </button>
      </form>
    </section>
  );
}
