export type User = {
  id: number;
  email: string | null;
  nickname: string;
  is_guest: boolean;
  is_staff: boolean;
  avatar?: string;
  preferred_color?: string;
};

export type GameMode = "hitrarunda" | "ala_milijonar" | "multiplayer" | "dirka" | "60_sekund";

export type StandingRow = {
  member_id: string;
  nickname: string;
  color?: string;
  avatar?: string;
  score: number;
  correct_count: number;
  round_bonuses?: number;
  streak?: number;
  alive?: boolean;
  is_bot?: boolean;
  rank?: number;
  safe_locked?: number;
  target_score?: number;
};

export type LobbyMember = {
  id: string;
  nickname: string;
  color?: string;
  avatar?: string;
  is_host: boolean;
  is_ready: boolean;
  is_connected?: boolean;
  is_bot?: boolean;
  is_you?: boolean;
};

export type PhoneFriend = {
  id?: number;
  key: string;
  name: string;
  title: string;
  bio: string;
  specialty_categories: string[];
  reliability?: number;
  out_of_specialty_reliability?: number;
  avatar_color: string;
  avatar?: string;
  is_active?: boolean;
  order?: number;
  used?: boolean;
};

export type BonusDefinition = {
  id: number;
  key: string;
  name: string;
  description: string;
  bonus_kind: string;
  effect_key: string;
  modes: string[];
  config: Record<string, unknown>;
  is_active: boolean;
  order: number;
};

export type AiBot = {
  id?: number;
  key: string;
  name: string;
  color: string;
  avatar?: string;
  accuracy?: number;
  delay_min?: number;
  delay_max?: number;
  modes?: string[];
  is_active?: boolean;
  count_for_leaderboard?: boolean;
  order?: number;
};

export type LifelineState = {
  available?: boolean;
  used?: boolean;
  friend_keys?: string[];
  used_friends?: string[];
};

export type AudienceVote = { option_id: number; percent: number };

export type ActiveHelps = {
  fifty_fifty?: { eliminated_option_ids: number[] };
  audience?: { votes: AudienceVote[] };
  phone_friend?: {
    friend_key: string;
    friend_name: string;
    friend_title: string;
    option_id: number;
    option_text: string;
    tone: string;
    message: string;
    in_specialty: boolean;
  };
};

export type Category = {
  slug: string;
  name: string;
  description: string;
  question_count: number;
  classic_question_count?: number;
};

export type PublicOption = { id: number; text: string };
export type MatchSide = { id: string; text: string };

export type QuestionType =
  | "multiple_choice"
  | "true_false"
  | "multi_select"
  | "ordering"
  | "matching"
  | "slider";

export type PublicQuestion = {
  game_question_id: string;
  text: string;
  question_type: QuestionType;
  difficulty: number;
  category: string;
  category_name: string;
  image: string | null;
  options?: PublicOption[];
  left?: MatchSide[];
  right?: MatchSide[];
  slider?: { min: number; max: number; step: number };
};

export type Pair = { left_id: string; right_id: string; left?: string; right?: string };

export type GameMessage = {
  type: string;
  phase?: string;
  message?: string;
  mode?: string;
  result_id?: number | null;
  result_ids?: Record<string, number>;
  question?: PublicQuestion;
  index?: number;
  total?: number;
  prize_ladder?: number[];
  prize_reached?: number;
  stake?: number | null;
  next_stake?: number | null;
  score?: number;
  speed_bonus_total?: number;
  speed_bonus?: number;
  correct_count?: number;
  skips_left?: number | null;
  skip_limit?: number | null;
  clock_ends_at?: string;
  clock_remaining_ms?: number;
  feedback?: {
    is_correct?: boolean | null;
    skipped?: boolean;
    time_delta?: number;
    label?: string;
  };
  duration_ms?: number;
  deadline_at?: string;
  server_now?: string;
  countdown_ends_at?: string;
  countdown_steps?: number;
  time_limit_seconds?: number;
  is_correct?: boolean;
  timed_out?: boolean;
  explanation?: string;
  finished?: boolean;
  reason?: string;
  nickname?: string;
  total_questions?: number;
  correct_option_ids?: number[];
  selected_option_ids?: number[];
  correct_pairs?: Pair[];
  selected_pairs?: Pair[];
  correct_value?: number;
  tolerance?: number;
  selected_value?: number;
  lifelines?: Record<string, LifelineState>;
  bonuses?: Record<string, number>;
  armed?: Record<string, boolean>;
  players?: Record<
    string,
    {
      member_id?: string;
      nickname?: string;
      score?: number;
      safe_locked?: number;
      correct_count?: number;
      correct_in_segment?: number;
      segment_misses?: number;
      until_safe?: number;
      streak?: number;
      bonuses?: Record<string, number>;
      armed?: Record<string, boolean>;
      active_helps?: ActiveHelps;
      shield?: boolean;
      shield_left?: number;
      second_chance?: boolean;
      blocked?: boolean;
      deadline_at?: string;
      target_score?: number;
      safe_every?: number;
    }
  >;
  bonus_member_id?: string;
  active_helps?: ActiveHelps;
  friends?: PhoneFriend[];
  lifeline?: Record<string, unknown>;
  bonus?: Record<string, unknown>;
  safe_orders?: number[];
  guaranteed_prize?: number;
  can_walk_away?: boolean;
  walked_away?: boolean;
  standings?: StandingRow[];
  target_score?: number;
  safe_every?: number;
  max_bonus_types?: number;
  deadlines?: Record<string, string>;
  answers?: {
    nickname: string;
    avatar?: string;
    color?: string;
    member_id?: string;
    is_correct: boolean;
    timed_out?: boolean;
    skipped?: boolean;
    points: number;
    time_taken_ms?: number;
    round_bonus?: boolean;
    streak_bonus?: number;
    catchup_bonus?: number;
    steal?: number;
    stolen_amount?: number;
    shielded?: boolean;
    steal_blocked?: boolean;
    eliminated?: boolean;
    bonus_gained?: string;
    bonuses_gained?: string[];
    safe_reward?: number;
    clean_sheet?: boolean;
    breakthrough?: boolean;
    solo_sprint?: boolean;
    bonus_convert?: { from?: string; to?: string; cleared?: number };
  }[];
  answered_count?: number;
  player_count?: number;
  waiting_for?: string[];
  waiting_for_ids?: string[];
  answered_ids?: string[];
  is_last?: boolean;
  is_host?: boolean;
  sudden_death?: boolean;
  alive_count?: number;
  host_member_id?: string;
  advance_seconds?: number;
  members?: LobbyMember[];
  lobby_event?: "joined" | "left" | "kicked";
  lobby_event_member_id?: string;
  kicked_message?: string;
  all_ready?: boolean;
  can_start?: boolean;
  you?: {
    id?: string;
    member_id?: string;
    nickname?: string;
    is_host?: boolean;
    is_ready?: boolean;
    score?: number;
    safe_locked?: number;
    bonuses?: Record<string, number>;
  };
  visibility?: string;
  max_players?: number;
  settings?: {
    mode?: string;
    question_count?: number;
    time_limit_seconds?: number;
    categories?: string[];
    sudden_death?: boolean;
    bot_count?: number;
    target_score?: number;
    safe_every?: number;
  };
  link?: string;
  has_password?: boolean;
  member_count?: number;
  name?: string;
};

export type StaffCategory = {
  id: number;
  slug: string;
  name: string;
  description: string;
  is_active: boolean;
  order: number;
  question_count: number;
};

export type StaffOption = { text: string; correct: boolean; order: number };
export type StaffPair = { left: string; right: string };

export type StaffQuestion = {
  id: number;
  key: string;
  category: string;
  category_name: string;
  question_type: QuestionType;
  difficulty: number;
  text: string;
  explanation: string;
  image: string | null;
  is_active: boolean;
  open_reports: number;
  options?: StaffOption[];
  pairs?: StaffPair[];
  slider?: { min: number; max: number; step: number; correct: number; tolerance: number };
};

export type QuestionReportRow = {
  id: number;
  note: string;
  nickname: string;
  room_code: string;
  status: string;
  created_at: string;
  question: StaffQuestion;
};

export type ScoreRow = {
  id: number;
  session_id: number | null;
  room_code: string;
  nickname: string;
  avatar?: string;
  preferred_color?: string;
  mode: string;
  score: number;
  prize_reached: number;
  speed_bonus: number;
  correct_count: number;
  total_questions: number;
  duration_ms: number | null;
  reason: string;
  played_at: string;
  is_guest: boolean;
  /** Dirka: mesto v tisti seji (1–n). */
  place?: number | null;
};

/** Skupna lestvica po uporabniku (vse igre). */
export type OverallRow = {
  user_id: number;
  nickname: string;
  avatar?: string;
  preferred_color?: string;
  total_points: number;
  best_score?: number;
  wins: number;
  /** Dirka / MP: število 1./2./3. mest v sejaj. */
  place_1?: number;
  place_2?: number;
  place_3?: number;
  games: number;
  correct_count?: number;
  total_questions?: number;
  last_played_at?: string | null;
  is_guest: boolean;
};

export type StageRow = {
  order: number;
  text: string;
  question_type: QuestionType;
  category_name: string;
  difficulty: number;
  explanation: string;
  is_correct: boolean | null;
  timed_out: boolean;
  time_taken_ms: number | null;
  speed_bonus: number;
  given: string;
  correct: string;
};

export type SessionDetail = {
  session_id: number | null;
  result_id: number | null;
  code: string;
  nickname: string;
  status: string;
  score: number;
  prize_reached: number;
  speed_bonus: number;
  correct_count: number;
  total_questions: number;
  reason: string;
  played_at: string | null;
  duration_ms: number | null;
  stages: StageRow[];
  missing_session?: boolean;
};

export type GameSessionRow = {
  id: number;
  code: string;
  nickname: string;
  status: string;
  score: number | null;
  correct_count: number | null;
  total_questions: number;
  reason: string;
  played_at: string;
};
