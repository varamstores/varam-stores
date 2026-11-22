import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { rpc, ApiError } from '../lib/api';

// Sign-up, sign-in, password reset and email confirmation are Supabase Auth itself. The shop's own
// profile (name, consents) is created by api.complete_signup right after the first sign-in, using
// what the shopper typed on the sign-up form (kept in the auth user's metadata until then).

export interface SessionContext {
  userId: string;
  email: string;
  emailConfirmed: boolean;
  kind: 'new' | 'customer' | 'staff' | 'both';
  needsProfile: boolean;
  signupMetadata: Record<string, unknown>;
  customer: { id: string; firstName: string; lastName: string; email: string; phone: string | null; status: string; memberSince: string } | null;
  staff: { id: string; fullName: string; email: string; status: string; role: string; roleName: string; permissions: string[] } | null;
  termsVersion: string;
  privacyVersion: string;
}

export interface SignUpInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  acceptTerms: boolean;
  termsVersion: string;
  marketingEmail: boolean;
  marketingSms: boolean;
}

interface AuthContextType {
  status: 'loading' | 'signed_out' | 'signed_in';
  session: Session | null;
  context: SessionContext | null;
  isCustomer: boolean;
  isStaff: boolean;
  /** True after following a password-reset email link, until a new password is saved. */
  isRecovery: boolean;
  hasPermission: (permission: string) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** Returns true when the account is ready now, false when an email confirmation was sent. */
  signUp: (input: SignUpInput) => Promise<boolean>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  completeSignup: (input: Omit<SignUpInput, 'email' | 'password'> & { phone?: string }) => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const CONTEXT_KEY = ['session-context'] as const;

/** Supabase Auth errors carry English messages; map the common ones to stable codes for CMS copy. */
function authError(err: { message?: string; status?: number; code?: string } | null): ApiError {
  const m = (err?.message ?? '').toLowerCase();
  const code =
    m.includes('invalid login') ? 'INVALID_CREDENTIALS'
    : m.includes('email not confirmed') ? 'EMAIL_NOT_CONFIRMED'
    : m.includes('already registered') || m.includes('already been registered') ? 'EMAIL_TAKEN'
    : m.includes('password') && (m.includes('least') || m.includes('weak') || m.includes('short')) ? 'WEAK_PASSWORD'
    : m.includes('rate limit') || err?.status === 429 ? 'RATE_LIMITED'
    : m.includes('fetch') || m.includes('network') ? 'NETWORK'
    : 'AUTH_FAILED';
  return new ApiError(code, err?.status ?? 400, null, err?.message ?? null);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const autoCompleted = useRef<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setReady(true);
      if (event === 'PASSWORD_RECOVERY') setIsRecovery(true);
      if (event === 'SIGNED_OUT') {
        setIsRecovery(false);
        qc.removeQueries({ queryKey: CONTEXT_KEY });
        qc.removeQueries({ queryKey: ['account'] });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  const userId = session?.user.id ?? null;
  const { data: context = null } = useQuery({
    queryKey: [...CONTEXT_KEY, userId],
    queryFn: () => rpc<SessionContext>('get_session_context'),
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: CONTEXT_KEY });
  }, [qc]);

  const completeSignup = useCallback<AuthContextType['completeSignup']>(async (input) => {
    await rpc('complete_signup', {
      p_first_name: input.firstName,
      p_last_name: input.lastName,
      p_accept_terms: input.acceptTerms,
      p_terms_version: input.termsVersion,
      p_marketing_email: input.marketingEmail,
      p_marketing_sms: input.marketingSms,
      p_phone: input.phone ?? null,
    });
    await refresh();
  }, [refresh]);

  // First sign-in after confirming the email: finish the profile from the sign-up form data.
  useEffect(() => {
    if (!context?.needsProfile || autoCompleted.current === context.userId) return;
    const m = context.signupMetadata;
    if (typeof m.first_name === 'string' && typeof m.last_name === 'string' && m.accepted_terms_version === context.termsVersion) {
      autoCompleted.current = context.userId;
      void completeSignup({
        firstName: m.first_name,
        lastName: m.last_name,
        acceptTerms: true,
        termsVersion: context.termsVersion,
        marketingEmail: m.marketing_email === true,
        marketingSms: m.marketing_sms === true,
      }).catch(() => {
        autoCompleted.current = null; // the account page shows the form instead
      });
    }
  }, [context, completeSignup]);

  const value = useMemo<AuthContextType>(() => ({
    status: !ready ? 'loading' : session ? 'signed_in' : 'signed_out',
    session,
    context,
    isCustomer: !!context?.customer,
    isStaff: !!context?.staff,
    isRecovery,
    hasPermission: (p) => {
      const perms = context?.staff?.permissions ?? [];
      return perms.includes('full_access') || perms.includes(p) || (p === 'inventory_read' && perms.includes('inventory'));
    },
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw authError(error);
    },
    signUp: async (input) => {
      const { data, error } = await supabase.auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: {
          emailRedirectTo: `${window.location.origin}/account`,
          data: {
            first_name: input.firstName.trim(),
            last_name: input.lastName.trim(),
            accepted_terms_version: input.acceptTerms ? input.termsVersion : null,
            marketing_email: input.marketingEmail,
            marketing_sms: input.marketingSms,
          },
        },
      });
      if (error) throw authError(error);
      // Supabase returns a user with no identities when the email is already registered.
      if (data.user && data.user.identities && data.user.identities.length === 0) throw authError({ message: 'already registered' });
      return !!data.session;
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
    sendPasswordReset: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/account/reset-password` });
      if (error) throw authError(error);
    },
    updatePassword: async (password) => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw authError(error);
      setIsRecovery(false);
    },
    completeSignup,
    refresh,
  }), [ready, session, context, isRecovery, completeSignup, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
