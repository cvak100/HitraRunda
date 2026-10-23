import { Avatar } from "../Avatar";
import { DirkaBonusBar } from "../DirkaRaceTrack";
import { QuestionPlay } from "../QuestionPlay";
import { TimerBar } from "../TimerBar";
import { formatPoints } from "../../format";
import type { GameMessage } from "../../types";
import { SixtyFinish } from "./GameFinish";
import { ReviewPanel } from "./ReviewPanel";
import { RoundReview } from "./RoundReview";

export type GamePlayBodyProps = {
  message: GameMessage;
  phase: string;
  myId: string;
  iAmHost: boolean;
  isDirka: boolean;
  isSixty: boolean;
  boardPath: string;
  sixtyFlash: GameMessage["feedback"] | null;
  sixtyTickKey: number;
  expire: () => void;
  sendAnswer: (body: Record<string, unknown>) => void;
  skipSixty: () => void;
  useHelp: (effect: string, friendKey?: string) => void;
  useDirkaBonus: (effect: string) => void;
  walkAway: () => void;
  next: () => void;
  pickFriend: boolean;
  setPickFriend: (updater: (current: boolean) => boolean) => void;
};

export function GamePlayBody({
  message,
  phase,
  myId,
  iAmHost,
  isDirka,
  isSixty,
  boardPath,
  sixtyFlash,
  sixtyTickKey,
  expire,
  sendAnswer,
  skipSixty,
  useHelp,
  useDirkaBonus,
  walkAway,
  next,
  pickFriend,
  setPickFriend,
}: GamePlayBodyProps) {
  const question = message.question;
  if (!question) return null;

  const lifelines = message.lifelines || {};
  const helps = message.active_helps || {};
  const isAla = message.mode === "ala_milijonar";
  const showLifelines = isAla && (phase === "question" || phase === "submitting");
  const canUseLifeline = phase === "question";
  const dirkaMe = isDirka && myId ? message.players?.[myId] : undefined;
  const dirkaBonuses = dirkaMe?.bonuses || {};
  const dirkaArmed = dirkaMe?.armed || {};
  const dirkaHelps = dirkaMe?.active_helps || helps;
  const dirkaDeadline = isDirka
    ? dirkaMe?.deadline_at || (myId && message.deadlines?.[myId]) || message.deadline_at
    : undefined;
  const eliminatedIds = [
    ...((dirkaHelps.fifty_fifty?.eliminated_option_ids as number[] | undefined) || []),
    ...(((dirkaHelps as { hint?: { eliminated_option_ids?: number[] } }).hint?.eliminated_option_ids) || []),
  ];
  const sixtyDeadline = message.clock_ends_at || message.deadline_at;
  const skipDisabled =
    phase !== "question" || (message.skips_left != null && (message.skips_left ?? 0) <= 0);
  const flashTone =
    sixtyFlash?.skipped ? "is-skip" : sixtyFlash?.is_correct ? "is-good" : sixtyFlash ? "is-bad" : "";
  const friends = message.friends || [];
  const dirkaPlaying = isDirka;

  return (
        <div className={isDirka ? "dirka-play-body" : undefined}>
          <div
            className={[
              isDirka ? "dirka-question-slot" : undefined,
              isSixty ? "sixty-play" : undefined,
              isSixty && sixtyFlash ? `sixty-flash ${flashTone}` : undefined,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="q-meta">
              <span>
                {(message.index ?? 0) + 1}
                {isDirka || isSixty ? "" : ` / ${message.total}`}
              </span>
              <span>{question.category_name}</span>
              <span>Težavnost {question.difficulty}</span>
              {isSixty ? (
                <span>
                  Pravilni {message.correct_count ?? 0}
                  {message.answered_count != null ? ` / ${message.answered_count}` : ""}
                </span>
              ) : null}
              {phase === "question" && message.stake ? <span>Igraš za {formatPoints(message.stake)}</span> : null}
              {isAla && (message.guaranteed_prize ?? 0) > 0 ? (
                <span>Varno: {formatPoints(message.guaranteed_prize ?? 0)}</span>
              ) : null}
              {isDirka && message.target_score ? <span>Cilj {formatPoints(message.target_score)}</span> : null}
              {isDirka ? (
                <span title="Varna zona po N pravilnih (napačen odgovor ne resetira števca, samo clean sheet).">
                  Varna zona {dirkaMe?.correct_in_segment ?? 0}/{dirkaMe?.safe_every ?? message.safe_every ?? 5}
                  {` · še ${dirkaMe?.until_safe ?? message.safe_every ?? 5}`}
                  {dirkaMe?.safe_locked ? ` · zaklenjeno ${formatPoints(dirkaMe.safe_locked)}` : ""}
                </span>
              ) : null}
            </div>
            {isSixty ? (
              <>
                <p
                  className={`sixty-feedback ${sixtyFlash ? flashTone : "sixty-feedback-empty"}`}
                  aria-live="polite"
                >
                  {sixtyFlash?.label || "\u00a0"}
                </p>
                <div
                  className={[
                    "sixty-chrome",
                    sixtyFlash
                      ? (sixtyFlash.time_delta ?? 0) > 0
                        ? "is-tick-up"
                        : (sixtyFlash.time_delta ?? 0) < 0
                          ? "is-tick-down"
                          : ""
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {sixtyFlash && (sixtyFlash.time_delta ?? 0) !== 0 ? (
                    <span
                      key={`pulse-${sixtyTickKey}`}
                      className={`sixty-chrome-pulse ${
                        (sixtyFlash.time_delta ?? 0) > 0 ? "is-up" : "is-down"
                      }`}
                      aria-hidden
                    />
                  ) : null}
                  <div className="sixty-timer">
                    {sixtyDeadline && message.server_now ? (
                      <TimerBar
                        deadlineAt={sixtyDeadline}
                        serverNow={message.server_now}
                        onExpire={expire}
                      />
                    ) : (
                      <div className="timer sixty-timer-placeholder" aria-hidden>
                        <div className="timer-track" />
                        <span>—s</span>
                      </div>
                    )}
                    {sixtyFlash && (sixtyFlash.time_delta ?? 0) !== 0 ? (
                      <span
                        key={`delta-${sixtyTickKey}`}
                        className={`sixty-delta ${
                          (sixtyFlash.time_delta ?? 0) > 0 ? "is-up" : "is-down"
                        }`}
                      >
                        {(sixtyFlash.time_delta ?? 0) > 0
                          ? `+${sixtyFlash.time_delta} s`
                          : `${sixtyFlash.time_delta} s`}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="sixty-skip"
                    disabled={skipDisabled}
                    onClick={skipSixty}
                  >
                    Preskoči
                    <strong>
                      {message.skips_left == null ? "∞" : message.skips_left}
                    </strong>
                  </button>
                </div>
              </>
            ) : null}
            {showLifelines ? (
              <div className="lifelines" aria-label="Jokerji">
                <button
                  type="button"
                  className={lifelines.fifty_fifty?.used ? "is-used" : ""}
                  disabled={!canUseLifeline || !lifelines.fifty_fifty?.available}
                  onClick={() => useHelp("fifty_fifty")}
                >
                  Polovička{lifelines.fifty_fifty?.used ? " · porabljena" : ""}
                </button>
                <button
                  type="button"
                  className={lifelines.audience?.used ? "is-used" : ""}
                  disabled={!canUseLifeline || !lifelines.audience?.available}
                  onClick={() => useHelp("audience")}
                >
                  Glas ljudstva{lifelines.audience?.used ? " · porabljen" : ""}
                </button>
                <button
                  type="button"
                  className={lifelines.phone_friend?.used ? "is-used" : ""}
                  disabled={!canUseLifeline || !lifelines.phone_friend?.available}
                  onClick={() => setPickFriend((current) => !current)}
                >
                  Klic v sili{lifelines.phone_friend?.used ? " · porabljen" : ""}
                </button>
                {message.can_walk_away && phase === "question" ? (
                  <button type="button" className="walk-away" onClick={walkAway}>
                    Odnehaj ({formatPoints(message.prize_reached ?? 0)})
                  </button>
                ) : null}
              </div>
            ) : null}
            {isAla && friends.length > 0 && (showLifelines || pickFriend) ? (
              <div className={`friend-pick ${pickFriend ? "is-open" : ""}`}>
                <p className="friend-pick-label">
                  {pickFriend ? "Koga kličeš?" : "Tvoji prijatelji za klic"}
                </p>
                <div className="friend-pick-grid">
                  {friends.map((friend) => {
                    const canCall =
                      pickFriend &&
                      canUseLifeline &&
                      !friend.used &&
                      Boolean(lifelines.phone_friend?.available);
                    const body = (
                      <span className="friend-card-head">
                        <Avatar
                          avatar={friend.avatar}
                          color={friend.avatar_color}
                          size={40}
                          title={friend.name}
                        />
                        <span className="friend-card-id">
                          <span className="friend-card-name">{friend.name}</span>
                          <span className="friend-card-title">
                            {friend.title}
                            {friend.used ? " · poklican" : ""}
                          </span>
                        </span>
                      </span>
                    );
                    if (canCall) {
                      return (
                        <button
                          key={friend.key}
                          type="button"
                          className="friend-pick-card is-callable"
                          style={{ ["--friend-color" as string]: friend.avatar_color }}
                          onClick={() => useHelp("phone_friend", friend.key)}
                        >
                          {body}
                        </button>
                      );
                    }
                    return (
                      <div
                        key={friend.key}
                        className={`friend-pick-card${friend.used ? " is-used" : ""}`}
                        style={{ ["--friend-color" as string]: friend.avatar_color }}
                      >
                        {body}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {phase === "question" && isDirka && dirkaDeadline && message.server_now ? (
              <TimerBar deadlineAt={dirkaDeadline} serverNow={message.server_now} onExpire={expire} />
            ) : phase === "question" && !isDirka && !isSixty && message.deadline_at && message.server_now ? (
              <TimerBar deadlineAt={message.deadline_at} serverNow={message.server_now} onExpire={expire} />
            ) : null}
            <div className={isSixty ? "sixty-question-slot" : undefined}>
            <h1>{question.text}</h1>
            {question.image ? <img className="q-image" src={question.image} alt="" /> : null}
            {helps.phone_friend ? (
              <p className="help-banner">
                {helps.phone_friend.friend_name}: {helps.phone_friend.message}
              </p>
            ) : null}
            {!isDirka && !isSixty && phase === "question" && (message.answered_count ?? 0) > 0 ? (
              <p className="fine">
                Oddano {message.answered_count}/{message.player_count}
                {(message.waiting_for || []).length > 0 ? ` · čaka: ${(message.waiting_for || []).join(", ")}` : ""}
              </p>
            ) : null}
            {!isDirka && !isSixty && phase === "waiting_answers" ? (
              <p className="status">
                Oddano. Čakam še: {(message.waiting_for || []).join(", ") || "nikogar"} (
                {message.answered_count}/{message.player_count})
              </p>
            ) : null}
            {phase === "question" || phase === "submitting" ? (
              <QuestionPlay
                question={question}
                locked={phase !== "question"}
                result={null}
                eliminatedOptionIds={
                  eliminatedIds.length
                    ? eliminatedIds
                    : isDirka
                      ? undefined
                      : helps.fifty_fifty?.eliminated_option_ids
                }
                audienceVotes={isDirka ? undefined : helps.audience?.votes}
                onSubmit={sendAnswer}
              />
            ) : null}
            {phase === "round_review" ? (
              <RoundReview message={message} myId={myId} isHost={iAmHost} onNext={next} boardPath={boardPath} />
            ) : null}
            {phase === "review" ||
            (phase === "finished" &&
              message.mode !== "multiplayer" &&
              message.mode !== "dirka" &&
              message.mode !== "60_sekund") ? (
              <ReviewPanel message={message} onNext={next} boardPath={boardPath} />
            ) : null}
            {phase === "finished" && message.mode === "60_sekund" ? (
              <SixtyFinish message={message} boardPath={boardPath} />
            ) : null}
            </div>
          </div>
          {dirkaPlaying ? (
            <div className="dirka-side">
              <DirkaBonusBar
                bonuses={dirkaBonuses}
                armed={dirkaArmed}
                canUse={phase === "question"}
                onUse={useDirkaBonus}
                maxTypes={message.max_bonus_types || 5}
              />
              <p
                className={`dirka-wait-status ${
                  phase === "waiting_answers"
                    ? "status"
                    : phase === "question" && (message.answered_count ?? 0) > 0
                      ? "fine"
                      : "dirka-wait-status-empty"
                }`}
                aria-live="polite"
              >
                {phase === "waiting_answers"
                  ? `Oddano. Čakam še: ${(message.waiting_for || []).join(", ") || "nikogar"} (${message.answered_count}/${message.player_count})`
                  : phase === "question" && (message.answered_count ?? 0) > 0
                    ? `Oddano ${message.answered_count}/${message.player_count}${
                        (message.waiting_for || []).length > 0
                          ? ` · čaka: ${(message.waiting_for || []).join(", ")}`
                          : ""
                      }`
                    : "\u00a0"}
              </p>
            </div>
          ) : null}
        </div>
  );
}
