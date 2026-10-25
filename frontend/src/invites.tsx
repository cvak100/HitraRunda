import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";

import { ApiError, api } from "./api";
import { useAuth } from "./auth";

export type RoomInvite = {
  code: string;
  name?: string;
  link?: string;
  host_nickname?: string;
  invite_from?: string;
  invited_at?: string;
  member_count?: number;
  max_players?: number;
  settings?: {
    mode?: string;
    target_score?: number;
    safe_every?: number;
    question_count?: number;
    time_limit_seconds?: number;
  };
};

type InvitesValue = {
  invites: RoomInvite[];
  count: number;
  refresh: () => Promise<void>;
  accept: (invite: RoomInvite) => Promise<void>;
  acceptingCode: string | null;
  error: string;
};

const InvitesContext = createContext<InvitesValue | null>(null);

const POLL_MS = 8000;

function wsNotifyUrl() {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/ws/notify/`;
}

function mergeInvite(list: RoomInvite[], incoming: RoomInvite): RoomInvite[] {
  const code = String(incoming.code || "").toUpperCase();
  if (!code) return list;
  const rest = list.filter((item) => item.code.toUpperCase() !== code);
  return [{ ...incoming, code }, ...rest];
}

export function InvitesProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [invites, setInvites] = useState<RoomInvite[]>([]);
  const [acceptingCode, setAcceptingCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setInvites([]);
      return;
    }
    try {
      const data = await api<{ rooms: RoomInvite[] }>("/api/rooms/invites/");
      setInvites(data.rooms || []);
      setError("");
    } catch {
      // tiho — bell ne sme spamati napak
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setInvites([]);
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }
    void refresh();
    const poll = window.setInterval(() => void refresh(), POLL_MS);
    function onFocus() {
      void refresh();
    }
    function onVis() {
      if (document.visibilityState === "visible") void refresh();
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    let stopped = false;
    let retryTimer: number | undefined;
    let retryMs = 2000;
    function connect() {
      if (stopped) return;
      const socket = new WebSocket(wsNotifyUrl());
      wsRef.current = socket;
      socket.onopen = () => {
        retryMs = 2000;
      };
      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as { type?: string; invite?: RoomInvite };
          if (msg.type === "invite" && msg.invite?.code) {
            setInvites((current) => mergeInvite(current, msg.invite!));
          }
        } catch {
          /* ignore */
        }
      };
      socket.onclose = () => {
        wsRef.current = null;
        if (!stopped) {
          retryTimer = window.setTimeout(connect, retryMs);
          retryMs = Math.min(30000, Math.round(retryMs * 1.6));
        }
      };
    }
    connect();

    return () => {
      stopped = true;
      window.clearInterval(poll);
      if (retryTimer) window.clearTimeout(retryTimer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [user, authLoading, refresh]);

  const accept = useCallback(
    async (invite: RoomInvite) => {
      if (!user) return;
      setAcceptingCode(invite.code);
      setError("");
      try {
        await api<{ code: string }>(`/api/rooms/${invite.code}/join/`, {
          method: "POST",
          body: JSON.stringify({ nickname: user.nickname || "", password: "" }),
        });
        setInvites((current) => current.filter((item) => item.code !== invite.code));
        navigate(invite.link || `/igra/${invite.code}`);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Pridružitev ni uspela.");
        void refresh();
      } finally {
        setAcceptingCode(null);
      }
    },
    [user, refresh, navigate],
  );

  const value = useMemo(
    () => ({
      invites,
      count: invites.length,
      refresh,
      accept,
      acceptingCode,
      error,
    }),
    [invites, refresh, accept, acceptingCode, error],
  );

  return <InvitesContext.Provider value={value}>{children}</InvitesContext.Provider>;
}

export function useInvites() {
  const value = useContext(InvitesContext);
  if (!value) throw new Error("InvitesProvider manjka.");
  return value;
}

export function modeInviteLabel(mode?: string) {
  if (mode === "dirka") return "Dirka";
  if (mode === "multiplayer") return "Hitra tekma";
  return mode || "Soba";
}
