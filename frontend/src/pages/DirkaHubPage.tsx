import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { AiOpponentsField, maxAiSlots } from "../components/AiOpponentsField";
import { CategoryPicker } from "../components/CategoryPicker";
import { ChoiceGroup } from "../components/ChoiceGroup";
import { DirkaBonusesHelp } from "../components/DirkaBonusesHelp";
import { NicknameField } from "../components/NicknameField";
import { NumberStepper } from "../components/NumberStepper";
import { VisibilityField } from "../components/VisibilityField";
import { ModePageNav, ModeRules } from "../gameModes";
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
    target_score?: number;
    safe_every?: number;
    time_limit_seconds?: number;
    bot_count?: number;
  };
};

const DEFAULT_TARGETS = [100, 200, 500, 1000];
const DEFAULT_SAFE = [5, 10];

export function DirkaHubPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"create" | "join" | "public">("create");
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [nickname, setNickname] = useState(user?.nickname ?? "");
  const [visibility, setVisibility] = useState<"public" | "private" | "unlisted">("public");
  const [password, setPassword] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [targetScore, setTargetScore] = useState(200);
  const [safeEvery, setSafeEvery] = useState(5);
  const [botCount, setBotCount] = useState(1);
  const [joinCode, setJoinCode] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [publicRooms, setPublicRooms] = useState<LobbyRoom[]>([]);
  const [invites, setInvites] = useState<LobbyRoom[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [targets, setTargets] = useState(DEFAULT_TARGETS);
  const [safeOptions, setSafeOptions] = useState(DEFAULT_SAFE);
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
      dirka?: {
        targets?: number[];
        safe_every?: number[];
        max_bots?: number;
      };
      multiplayer?: { max_players?: number };
    }>("/api/game-config/")
      .then((cfg) => {
        const d = cfg.dirka;
        if (d?.targets?.length) {
          setTargets(d.targets);
          setTargetScore((current) => (d.targets!.includes(current) ? current : d.targets![0]));
        }
        if (d?.safe_every?.length) {
          setSafeOptions(d.safe_every);
          setSafeEvery((current) => (d.safe_every!.includes(current) ? current : d.safe_every![0]));
        }
        if (typeof d?.max_bots === "number") {
          setMaxBots(d.max_bots);
          setBotCount((current) => Math.min(current, d.max_bots!));
        }
        if (cfg.multiplayer?.max_players) {
          setMaxPlayersCap(cfg.multiplayer.max_players);
          setMaxPlayers((current) => Math.min(current, cfg.multiplayer!.max_players!));
        }
      })
      .catch(() => undefined);
    api<{ rooms: LobbyRoom[] }>("/api/rooms/public/?mode=dirka")
      .then((data) => setPublicRooms(data.rooms))
      .catch(() => setPublicRooms([]));
    api<{ rooms: LobbyRoom[] }>("/api/rooms/invites/?mode=dirka")
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
          mode: "dirka",
          nickname,
          visibility,
          password: visibility === "private" ? password : "",
          max_players: maxPlayers,
          target_score: targetScore,
          safe_every: safeEvery,
          categories: selected,
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
      <p className="eyebrow">Dirka</p>
      <h1>Prvi do cilja</h1>
      <ModePageNav mode="dirka" />
      <ModeRules mode="dirka" />
      <div className="mode-extra-actions">
        <DirkaBonusesHelp />
      </div>
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
          <VisibilityField
            value={visibility}
            onChange={setVisibility}
            password={password}
            onPasswordChange={setPassword}
          />
          <NumberStepper
            label="Največ igralcev"
            value={maxPlayers}
            min={2}
            max={maxPlayersCap}
            onChange={(value) => {
              setMaxPlayers(value);
              setBotCount((current) => Math.min(current, maxAiSlots(value, 1, maxBots)));
            }}
          />
          <AiOpponentsField
            mode="dirka"
            value={botCount}
            onChange={setBotCount}
            max={maxAiSlots(maxPlayers, 1, maxBots)}
          />
          <ChoiceGroup label="Cilj točk" options={targets} value={targetScore} onChange={setTargetScore} />
          <ChoiceGroup
            label="Varna zona (pravilnih)"
            options={safeOptions}
            value={safeEvery}
            onChange={setSafeEvery}
            format={(value) => `Vsakih ${value}`}
          />
          <CategoryPicker categories={categories} value={selected} onChange={setSelected} showCounts="all" showSelectAll />
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
            <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} required />
          </label>
          <label>
            Geslo (če zasebna)
            <input value={joinPassword} onChange={(event) => setJoinPassword(event.target.value)} />
          </label>
          <button className="primary" type="submit" disabled={pending}>
            Pridruži se
          </button>
          {invites.length ? (
            <div className="stack">
              <h2>Povabila</h2>
              {invites.map((room) => (
                <article key={room.code} className="game-row">
                  <div>
                    <h2>{room.name || "Dirka"}</h2>
                    <p className="fine">
                      {room.host_nickname ? `Host: ${room.host_nickname} · ` : ""}
                      {room.code} · cilj {room.settings.target_score ?? "—"}
                    </p>
                  </div>
                  <button type="button" className="primary" onClick={(event) => void onJoin(event, room.code)}>
                    Vstopi
                  </button>
                </article>
              ))}
            </div>
          ) : null}
        </form>
      ) : null}

      {tab === "public" ? (
        <div className="stack">
          {publicRooms.length === 0 ? <p className="status">Ni javnih Dirka sob.</p> : null}
          {publicRooms.map((room) => (
            <article key={room.code} className="game-row">
              <div>
                <h2>{room.name || "Dirka"}</h2>
                <p className="fine">
                  {room.host_nickname ? `Host: ${room.host_nickname} · ` : ""}
                  {room.code} · {room.member_count}/{room.max_players}
                  {room.settings.target_score != null ? ` · cilj ${room.settings.target_score}` : ""}
                  {room.settings.safe_every != null ? ` · varna zona ${room.settings.safe_every}` : ""}
                  {room.settings.bot_count ? ` · AI ${room.settings.bot_count}` : ""}
                </p>
              </div>
              <button type="button" className="primary" onClick={(event) => void onJoin(event, room.code)}>
                Pridruži se
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
