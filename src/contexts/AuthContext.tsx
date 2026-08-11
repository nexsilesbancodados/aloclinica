import { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { db } from "@/integrations/supabase/untyped";
import { warn } from "@/lib/logger";

type AppRole = "patient" | "doctor" | "clinic" | "admin" | "receptionist" | "support" | "partner" | "affiliate";

const AUTH_LOADING_TIMEOUT_MS = 12000;

interface Profile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  cpf: string | null;
  phone: string | null;
   avatar_url: string | null;
   date_of_birth: string | null;
   created_at?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  roles: [],
  loading: true,
  signOut: async () => {},
  refreshRoles: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  const withAuthTimeout = useCallback(<T,>(promise: Promise<T>, label: string): Promise<T> => {
    return Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        window.setTimeout(() => reject(new Error(`${label} demorou para responder`)), AUTH_LOADING_TIMEOUT_MS);
      }),
    ]);
  }, []);

  const fetchUserData = useCallback(async (userId: string) => {
    try {
      const [profileRes, rolesRes] = await withAuthTimeout(
        Promise.all([
          db.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
          db.from("user_roles").select("role").eq("user_id", userId),
        ]),
        "Carregamento dos dados do usuário"
      );

      if (profileRes.error) warn("fetch profile error:", profileRes.error);
      if (rolesRes.error) warn("fetch roles error:", rolesRes.error);

      setProfile((profileRes.data as Profile | null) ?? null);
      setRoles((rolesRes.data ?? []).map((r: { role: string }) => r.role as AppRole));
    } catch (e) {
      warn("fetchUserData error:", e);
      setProfile(null);
      setRoles([]);
    }
  }, [withAuthTimeout]);

  useEffect(() => {
    let mounted = true;
    const safetyTimer = window.setTimeout(() => {
      if (mounted) {
        warn("Auth loading timeout: liberando interface com dados disponíveis");
        setLoading(false);
      }
    }, AUTH_LOADING_TIMEOUT_MS + 1000);

    const hydrateAuth = async (nextSession: Session | null) => {
      if (!mounted) return;

      try {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        userIdRef.current = nextSession?.user?.id ?? null;

        if (nextSession?.user) {
          await fetchUserData(nextSession.user.id);
        } else {
          setProfile(null);
          setRoles([]);
        }
      } catch (error) {
        warn("hydrateAuth error:", error);
        setProfile(null);
        setRoles([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    withAuthTimeout<Awaited<ReturnType<typeof db.auth.getSession>>>(db.auth.getSession(), "Sessão")
      .then(({ data: { session: s } }) => hydrateAuth(s))
      .catch((error) => {
        warn("getSession error:", error);
        if (!mounted) return;
        setProfile(null);
        setRoles([]);
        setLoading(false);
      });

    // 2. Listen for subsequent auth changes (sign in/out/token refresh)
    const { data: { subscription } } = db.auth.onAuthStateChange(
      (event, s) => {
        if (!mounted) return;

        // Refreshing a token does not change the authenticated identity. Keep
        // the dashboard mounted so active video calls and unsaved clinical
        // forms are not destroyed during Supabase's automatic refresh.
        if (event === "TOKEN_REFRESHED") {
          setSession(s);
          setUser(s?.user ?? null);
          userIdRef.current = s?.user?.id ?? null;
          return;
        }

        // The initial session is already hydrated by getSession() above. A
        // user metadata update also keeps the current tree alive.
        if (event === "INITIAL_SESSION") return;
        if (event === "USER_UPDATED" && s?.user?.id === userIdRef.current) {
          setSession(s);
          setUser(s.user);
          return;
        }

        // Re-emitting SIGNED_IN for the same user should not blank the app.
        if (event === "SIGNED_IN" && s?.user?.id === userIdRef.current) {
          setSession(s);
          setUser(s.user);
          return;
        }

        setLoading(true);
        window.setTimeout(() => {
          void hydrateAuth(s);
        }, 0);
      }
    );

    return () => {
      mounted = false;
      window.clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, [fetchUserData, withAuthTimeout]);

  const signOut = useCallback(async () => {
    await db.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
  }, []);

  const refreshRoles = useCallback(async () => {
    if (user) await fetchUserData(user.id);
  }, [user, fetchUserData]);

  const contextValue = useMemo(
    () => ({ user, session, profile, roles, loading, signOut, refreshRoles }),
    [user, session, profile, roles, loading, signOut, refreshRoles]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
