import { Avatar } from "./Avatar";
import type { PhoneFriend } from "../types";

type Props = {
  friends: PhoneFriend[];
  selected: string[];
  pick?: number;
  onToggle: (key: string) => void;
};

/**
 * Izbira prijateljev za klic v sili (Ala milijonar).
 * Privzeto so naključno označeni ``pick``; igralec lahko zamenja.
 */
export function FriendRoster({ friends, selected, pick = 3, onToggle }: Props) {
  if (!friends.length) {
    return (
      <fieldset>
        <legend>Prijatelji za klic v sili</legend>
        <p className="fine">Ni aktivnih prijateljev.</p>
      </fieldset>
    );
  }

  return (
    <fieldset>
      <legend>
        Prijatelji za klic v sili ({selected.length}/{pick})
      </legend>
      <p className="fine" style={{ marginTop: 0 }}>
        Naključno označeni {pick} — lahko zamenjaš, preden začneš.
      </p>
      <div className="friend-grid">
        {friends.map((friend) => {
          const on = selected.includes(friend.key);
          return (
            <button
              key={friend.key}
              type="button"
              className={`friend-card ${on ? "is-on" : ""}`}
              style={{ ["--friend-color" as string]: friend.avatar_color }}
              onClick={() => onToggle(friend.key)}
              aria-pressed={on}
            >
              <span className="friend-card-head">
                <Avatar
                  avatar={friend.avatar}
                  color={friend.avatar_color}
                  size={48}
                  title={friend.name}
                />
                <span className="friend-card-id">
                  <span className="friend-card-name">{friend.name}</span>
                  {friend.title ? <span className="friend-card-title">{friend.title}</span> : null}
                </span>
              </span>
              {friend.bio ? <span className="friend-card-bio">{friend.bio}</span> : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Naključno izbere do ``pick`` ključev (brez ponovitev). */
export function pickRandomFriendKeys(friends: PhoneFriend[], pick: number): string[] {
  const keys = friends.map((f) => f.key);
  if (keys.length <= pick) return keys;
  const pool = [...keys];
  const chosen: string[] = [];
  while (chosen.length < pick && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(i, 1)[0]);
  }
  return chosen;
}
