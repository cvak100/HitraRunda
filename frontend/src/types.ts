export type User = {
  id: number;
  email: string | null;
  nickname: string;
  is_guest: boolean;
  is_staff: boolean;
};

export type Category = {
  slug: string;
  name: string;
  description: string;
  question_count: number;
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
  deadline_at?: string;
  server_now?: string;
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
