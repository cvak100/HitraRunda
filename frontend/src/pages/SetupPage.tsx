import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { CategoryPicker } from "../components/CategoryPicker";
import { ChoiceGroup } from "../components/ChoiceGroup";
import { FriendRoster, pickRandomFriendKeys } from "../components/FriendRoster";
import { NicknameField } from "../components/NicknameField";
import { NumberStepper } from "../components/NumberStepper";
import { formatMode } from "../format";
import { BackNav, ModePageNav, ModeRules, boardPath } from "../gameModes";
import type { Category, GameMode, PhoneFriend } from "../types";

const DEFAULT_TIMES = [10, 15, 20, 30, 45, 60];
const DEFAULT_SKIP: { value: number | null; label: string }[] = [
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
  if (pathname.includes("/zastave")) return "zastave";
  return null;
}

type ScopeOpt = { id: string; label: string; count: number };

export function SetupPage() {
  const location = useLocation();
  const mode = modeFromPath(location.pathname);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [friends, setFriends] = useState<PhoneFriend[]>([]);
  const [friendKeys, setFriendKeys] = useState<string[]>([]);
  const [friendsPick, setFriendsPick] = useState(3);
  const [selected, setSelected] = useState<string[]>([]);
  const [count, setCount] = useState(10);
  const [seconds, setSeconds] = useState(20);
  const [skipLimit, setSkipLimit] = useState<number | null>(null);
  const [difficultyProfile, setDifficultyProfile] = useState<"mild" | "normal" | "sharp">("normal");
  const [nickname, setNickname] = useState(user?.nickname ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [times, setTimes] = useState(DEFAULT_TIMES);
  const [skipOptions, setSkipOptions] = useState(DEFAULT_SKIP);
  const [alaSeconds, setAlaSeconds] = useState(90);
  const [continents, setContinents] = useState<ScopeOpt[]>([]);
  const [regions, setRegions] = useState<ScopeOpt[]>([]);
  const [selectedContinents, setSelectedContinents] = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);

  const isSixty = mode === "60_sekund";
  const isFlags = mode === "zastave";
  const allContinentIds = useMemo(() => continents.map((c) => c.id), [continents]);
  const flagsPoolCount = useMemo(() => {
    if (selectedRegions.length) {
      return regions
        .filter((r) => selectedRegions.includes(r.id))
        .reduce((sum, r) => sum + (r.count || 0), 0);
    }
    return continents
      .filter((c) => selectedContinents.includes(c.id))
      .reduce((sum, c) => sum + (c.count || 0), 0);
  }, [continents, regions, selectedContinents, selectedRegions]);
  const flagsScopeReady =
    (selectedRegions.length > 0 || selectedContinents.length > 0) && flagsPoolCount >= 4;

  useEffect(() => {
    if (!isFlags) {
      api<{ categories: Category[] }>("/api/categories/")
        .then((data) => {
          setCategories(data.categories);
          setSelected(data.categories.map((category) => category.slug));
        })
        .catch(() => setError("Kategorij ni bilo mogoče naložiti."));
    }
    api<{
      enabled_modes?: string[];
      hitrarunda?: { times?: number[] };
      ala_milijonar?: { time_limit_seconds?: number; friends_pick?: number };
      sixty?: { skip_limits?: Array<number | null> };
      zastave?: {
        times?: number[];
        time_limit_seconds?: number;
        continents?: ScopeOpt[];
        regions?: ScopeOpt[];
      };
    }>("/api/game-config/")
      .then((cfg) => {
        if (mode && cfg.enabled_modes && !cfg.enabled_modes.includes(mode)) {
          setError("Ta način trenutno ni na voljo.");
        }
        if (cfg.hitrarunda?.times?.length && !isFlags) {
          setTimes(cfg.hitrarunda.times);
          setSeconds((current) =>
            cfg.hitrarunda!.times!.includes(current) ? current : cfg.hitrarunda!.times![0],
          );
        }
        if (cfg.ala_milijonar?.time_limit_seconds) setAlaSeconds(cfg.ala_milijonar.time_limit_seconds);
        if (cfg.ala_milijonar?.friends_pick) setFriendsPick(cfg.ala_milijonar.friends_pick);
        if (cfg.sixty?.skip_limits?.length) {
          const opts = cfg.sixty.skip_limits.map((value) => ({
            value,
            label: value === null ? "Neomejeno" : String(value),
          }));
          setSkipOptions(opts);
          setSkipLimit((current) => (opts.some((o) => o.value === current) ? current : opts[0].value));
        }
        if (cfg.zastave) {
          if (cfg.zastave.times?.length) {
            setTimes(cfg.zastave.times);
            const def = cfg.zastave.time_limit_seconds ?? cfg.zastave.times[0];
            setSeconds((current) =>
              cfg.zastave!.times!.includes(current) ? current : def,
            );
          }
          if (cfg.zastave.continents?.length) {
            setContinents(cfg.zastave.continents);
            setSelectedContinents(cfg.zastave.continents.map((c) => c.id));
            setSelectedRegions([]);
          }
          if (cfg.zastave.regions?.length) {
            setRegions(cfg.zastave.regions);
          }
        }
      })
      .catch(() => undefined);
    if (mode === "ala_milijonar") {
      api<{ friends: PhoneFriend[]; pick?: number }>("/api/friends/")
        .then((data) => {
          const list = data.friends || [];
          const pick = data.pick || 3;
          setFriends(list);
          setFriendsPick(pick);
          setFriendKeys(pickRandomFriendKeys(list, pick));
        })
        .catch(() => {
          setFriends([]);
          setFriendKeys([]);
        });
    }
  }, [mode, isFlags]);

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
  const maxCount = Math.min(100, available);
  const alaReady =
    mode !== "ala_milijonar" || (available >= 15 && friendKeys.length === friendsPick);

  useEffect(() => {
    if (mode === "ala_milijonar") setCount(15);
    else if (mode === "hitrarunda" && available >= 5) {
      setCount((current) => Math.min(Math.max(current, 5), Math.min(100, available)));
    }
  }, [available, mode]);

  function toggleFriend(key: string) {
    setFriendKeys((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key);
      if (current.length >= friendsPick) return current;
      return [...current, key];
    });
  }

  if (!mode) {
    return (
      <section className="panel">
        <h1>Neznana igra</h1>
        <BackNav to="/igra" />
        <p className="error">Te poti ni med znanimi načini.</p>
      </section>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        nickname,
        mode,
        categories: isFlags ? [] : selected,
      };
      if (mode === "ala_milijonar") {
        body.question_count = 15;
        body.time_limit_seconds = alaSeconds;
        body.friend_keys = friendKeys;
      } else if (isSixty) {
        body.skip_limit = skipLimit;
        body.difficulty_profile = difficultyProfile;
      } else if (isFlags) {
        if (selectedRegions.length) {
          body.regions = selectedRegions;
          body.continents = [];
        } else {
          body.continents = selectedContinents;
          body.regions = [];
        }
        body.time_limit_seconds = seconds;
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
      <ModePageNav boardTo={boardPath(mode)} mode={mode} />
      <ModeRules mode={mode} />
      <form onSubmit={onSubmit} className="stack">
        <NicknameField label="Vzdevek v tej igri" value={nickname} onChange={setNickname} required />
        {mode === "hitrarunda" ? (
          <>
            <NumberStepper
              label="Število vprašanj"
              value={Math.min(count, Math.max(5, maxCount))}
              min={5}
              max={Math.max(5, maxCount)}
              onChange={setCount}
            />
            <ChoiceGroup
              label="Čas na vprašanje"
              options={times}
              value={seconds}
              onChange={setSeconds}
              format={(time) => `${time} s`}
            />
          </>
        ) : null}
        {mode === "ala_milijonar" ? (
          <FriendRoster
            friends={friends}
            selected={friendKeys}
            pick={friendsPick}
            onToggle={toggleFriend}
          />
        ) : null}
        {isSixty ? (
          <>
            <fieldset>
              <legend>Preskoki</legend>
              <div className="choices" role="group" aria-label="Preskoki">
                {skipOptions.map((option) => (
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
            </fieldset>
          </>
        ) : null}
        {isFlags ? (
          <>
            <ChoiceGroup
              label="Kontinent"
              options={allContinentIds}
              values={selectedContinents}
              onValuesChange={(next) => {
                setSelectedRegions([]);
                setSelectedContinents(next);
              }}
              selectAllLabel="Vsi"
              format={(id) => {
                const option = continents.find((row) => row.id === id);
                if (!option) return id;
                return option.count ? `${option.label} (${option.count})` : option.label;
              }}
            />
            {regions.length ? (
              <details className="flags-regions-collapse">
                <summary>
                  Regije
                  {selectedRegions.length ? ` (${selectedRegions.length})` : ""}
                </summary>
                <ChoiceGroup
                  label="Regije"
                  hint="Več izbir. Ob izbiri se kontinenti počistijo."
                  options={regions.map((row) => row.id)}
                  values={selectedRegions}
                  onValuesChange={(next) => {
                    setSelectedContinents([]);
                    setSelectedRegions(next);
                  }}
                  format={(id) => {
                    const option = regions.find((row) => row.id === id);
                    if (!option) return id;
                    return option.count ? `${option.label} (${option.count})` : option.label;
                  }}
                />
              </details>
            ) : null}
            <p className="fine">
              Nabor: {flagsPoolCount} držav
              {!flagsScopeReady && (selectedContinents.length > 0 || selectedRegions.length > 0)
                ? " (potrebuješ vsaj 4)"
                : ""}
            </p>
            <ChoiceGroup
              label="Čas na vprašanje"
              options={times}
              value={seconds}
              onChange={setSeconds}
              format={(time) => `${time} s`}
            />
          </>
        ) : (
          <CategoryPicker
            categories={categories}
            value={selected}
            onChange={setSelected}
            showCounts={mode === "ala_milijonar" ? "classic" : "all"}
            showSelectAll
          />
        )}
        {error ? <p className="error">{error}</p> : null}
        <button
          className="primary"
          type="submit"
          disabled={
            pending ||
            (!isFlags && selected.length === 0) ||
            !alaReady ||
            (mode === "hitrarunda" && available < 5) ||
            (isSixty && available < 5) ||
            (isFlags && !flagsScopeReady)
          }
        >
          Začni
        </button>
      </form>
    </section>
  );
}
