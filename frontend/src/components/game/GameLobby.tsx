import type { Category, GameMessage } from "../../types";
import { AiOpponentsField, type LobbyAiMode } from "../AiOpponentsField";
import { Avatar } from "../Avatar";
import { CategoryPicker } from "../CategoryPicker";
import { ChoiceGroup } from "../ChoiceGroup";
import { DirkaBonusesHelp } from "../DirkaBonusesHelp";
import { NumberStepper } from "../NumberStepper";
import { VisibilityField, type RoomVisibility } from "../VisibilityField";

function formatLobbyTime(seconds: number) {
  if (seconds < 120) return `${seconds} s`;
  return `${seconds / 60} min`;
}

export type GameLobbyProps = {
  message: GameMessage;
  myId: string;
  iAmHost: boolean;
  iAmReady: boolean;
  leaving: boolean;
  inviteName: string;
  setInviteName: (v: string) => void;
  inviteNotice: string;
  copyNotice: string;
  categories: Category[];
  lobbyTimes: number[];
  lobbyCounts: number[];
  lobbyTargets: number[];
  lobbySafe: number[];
  maxPlayersCap: number;
  editCount: number;
  setEditCount: (v: number) => void;
  editSeconds: number;
  setEditSeconds: (v: number) => void;
  editMax: number;
  editVisibility: RoomVisibility;
  setEditVisibility: (v: RoomVisibility) => void;
  editPassword: string;
  setEditPassword: (v: string) => void;
  editSudden: boolean;
  setEditSudden: (v: boolean) => void;
  editBots: number;
  editTarget: number;
  setEditTarget: (v: number) => void;
  editSafe: number;
  setEditSafe: (v: number) => void;
  editCats: string[];
  setEditCats: (updater: (current: string[]) => string[]) => void;
  lobbyInviteUrl: () => string;
  copyInviteLink: () => void;
  sendReady: (ready: boolean) => void;
  startMulti: () => void;
  leaveRoom: () => void;
  kickMember: (memberId: string) => void;
  kickingId: string;
  sendInvite: () => void;
  saveLobbySettings: () => void;
  changeBots: (value: number) => void;
  changeMaxPlayers: (value: number) => void;
  maxBotsFor: () => number;
};

export function GameLobby(props: GameLobbyProps) {
  const {
    message,
    myId,
    iAmHost,
    iAmReady,
    leaving,
    inviteName,
    setInviteName,
    inviteNotice,
    copyNotice,
    categories,
    lobbyTimes,
    lobbyCounts,
    lobbyTargets,
    lobbySafe,
    maxPlayersCap,
    editCount,
    setEditCount,
    editSeconds,
    setEditSeconds,
    editMax,
    editVisibility,
    setEditVisibility,
    editPassword,
    setEditPassword,
    editSudden,
    setEditSudden,
    editBots,
    editTarget,
    setEditTarget,
    editSafe,
    setEditSafe,
    editCats,
    setEditCats,
    lobbyInviteUrl,
    copyInviteLink,
    sendReady,
    startMulti,
    leaveRoom,
    kickMember,
    kickingId,
    sendInvite,
    saveLobbySettings,
    changeBots,
    changeMaxPlayers,
    maxBotsFor,
  } = props;

  const lobbyMode: LobbyAiMode =
    (message.settings?.mode || message.mode) === "dirka" ? "dirka" : "multiplayer";

  return (
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
            {message.settings?.time_limit_seconds ? ` · ${message.settings.time_limit_seconds} s` : ""}
            {message.settings?.bot_count ? ` · ${message.settings.bot_count} AI` : ""}
          </p>
          {lobbyMode === "dirka" ? (
            <div className="mode-extra-actions">
              <DirkaBonusesHelp />
            </div>
          ) : null}
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
                    <Avatar avatar={member.avatar} color={member.color || "#7dcea0"} size={36} title={member.nickname} />
                    <div className="lobby-member-text">
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
                  </div>
                  <div className="lobby-member-actions">
                    {isYou && !member.is_bot ? (
                      <button
                        type="button"
                        className={`lobby-ready-btn ${iAmReady ? "is-on" : ""}`}
                        onClick={() => sendReady(!iAmReady)}
                      >
                        {iAmReady ? "Nisem pripravljen" : "Pripravljen"}
                      </button>
                    ) : null}
                    {iAmHost && !isYou && !member.is_host ? (
                      <button
                        type="button"
                        className="lobby-kick-btn"
                        disabled={Boolean(kickingId)}
                        onClick={() => kickMember(member.id)}
                      >
                        {kickingId === member.id ? "…" : "Kick"}
                      </button>
                    ) : null}
                  </div>
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
              <button type="button" disabled={leaving} onClick={() => void leaveRoom()}>
                {leaving ? "Zapuščam…" : "Zapusti sobo"}
              </button>
            </div>
          ) : (
            <div className="actions">
              <p className="fine">Čakaj, da host začne, ko so vsi pripravljeni.</p>
              <button type="button" disabled={leaving} onClick={() => void leaveRoom()}>
                {leaving ? "Zapuščam…" : "Zapusti sobo"}
              </button>
            </div>
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
              {inviteNotice ? <p className="fine">{inviteNotice}</p> : null}
              <h2>Nastavitve (v živo)</h2>
              <NumberStepper label="Največ igralcev" value={editMax} min={2} max={maxPlayersCap} onChange={changeMaxPlayers} />
              {lobbyMode === "multiplayer" ? (
                <NumberStepper label="Število vprašanj" value={editCount} options={lobbyCounts} onChange={setEditCount} />
              ) : null}
              <AiOpponentsField
                mode={lobbyMode}
                value={editBots}
                onChange={changeBots}
                max={maxBotsFor()}
              />
              {lobbyMode === "dirka" ? (
                <>
                  <ChoiceGroup label="Cilj točk" options={lobbyTargets} value={editTarget} onChange={setEditTarget} />
                  <ChoiceGroup
                    label="Varna zona (pravilnih)"
                    options={lobbySafe}
                    value={editSafe}
                    onChange={setEditSafe}
                    format={(value) => `Vsakih ${value}`}
                  />
                  <ChoiceGroup
                    label="Čas na vprašanje"
                    options={lobbyTimes}
                    value={editSeconds}
                    onChange={setEditSeconds}
                    format={formatLobbyTime}
                  />
                </>
              ) : (
                <>
                  <ChoiceGroup
                    label="Čas na vprašanje"
                    options={lobbyTimes}
                    value={editSeconds}
                    onChange={setEditSeconds}
                    format={formatLobbyTime}
                  />
                  <label className="check">
                    <input type="checkbox" checked={editSudden} onChange={(event) => setEditSudden(event.target.checked)} />
                    Sudden death
                  </label>
                </>
              )}
              <VisibilityField
                value={editVisibility}
                onChange={setEditVisibility}
                password={editPassword}
                onPasswordChange={setEditPassword}
                passwordPlaceholder="pusti prazno = obstoječe"
              />
              {categories.length > 0 ? (
                <CategoryPicker
                  categories={categories}
                  value={editCats}
                  onChange={(next) => setEditCats(() => next)}
                  showCounts="all"
                  showSelectAll
                />
              ) : null}
              <button type="button" className="primary" onClick={() => saveLobbySettings()}>
                Shrani nastavitve
              </button>
              <p className="fine">Sprememba ponastavi pripravljenost ostalih igralcev.</p>
            </>
          ) : null}
    </div>
  );
}
