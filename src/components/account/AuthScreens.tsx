import React, { useState } from 'react';
import { Lock, Mail, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCms } from '../../cms/CmsProvider';
import { InlineText } from '../../cms/components';
import { useErrorMessage } from '../../cms/hooks';
import { useStorefrontConfig } from '../../lib/catalogue';

export const inputClass = 'mt-1 w-full text-sm px-3 py-2.5 rounded-xl border border-stone-200 focus:outline-none focus:border-[#F5D103] focus:ring-2 focus:ring-[#F5D103]/20 bg-white';
export const primaryButton = 'w-full py-3 rounded-full bg-[#18181B] text-[#F5D103] text-sm font-bold hover:bg-[#E5A800] hover:text-[#18181B] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-[70vh] bg-[#F8FAFC] py-10 sm:py-16 px-4 flex items-start justify-center">
    <div className="w-full max-w-md bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-sm">{children}</div>
  </div>
);

const Alert: React.FC<{ tone: 'error' | 'ok'; children: React.ReactNode }> = ({ tone, children }) => (
  <p role={tone === 'error' ? 'alert' : 'status'} className={`text-xs font-semibold p-3 rounded-xl mb-4 ${tone === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-amber-50 text-[#92400E] border border-amber-200'}`}>
    {children}
  </p>
);

/** Sign in / create account / forgot password, for shoppers who are not signed in. */
export const AuthScreens: React.FC<{ initial?: 'sign-in' | 'sign-up' }> = ({ initial = 'sign-in' }) => {
  const cms = useCms();
  const errorMessage = useErrorMessage();
  const auth = useAuth();
  const { data: config } = useStorefrontConfig();
  const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'forgot' | 'check-email'>(initial);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [terms, setTerms] = useState(false);
  const [mEmail, setMEmail] = useState(false);
  const [mSms, setMSms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'check-email') {
    return (
      <Card>
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-amber-100 text-[#B45309] mx-auto mb-4 flex items-center justify-center"><Mail className="w-7 h-7" /></div>
          <h1 className="font-serif-heading font-bold text-2xl text-[#18181B] mb-2">{cms.t('account.auth.check_email_title')}</h1>
          <p className="text-sm text-stone-600 mb-6">{cms.t('account.auth.check_email_text', { email })}</p>
          <button type="button" onClick={() => setMode('sign-in')} className="text-xs font-bold text-[#B45309] hover:underline cursor-pointer">{cms.t('account.auth.back_to_sign_in')}</button>
        </div>
      </Card>
    );
  }

  if (mode === 'forgot') {
    return (
      <Card>
        <h1 className="font-serif-heading font-bold text-2xl text-[#18181B] mb-2">{cms.t('account.auth.forgot_title')}</h1>
        <p className="text-sm text-stone-600 mb-5">{cms.t('account.auth.forgot_text')}</p>
        {error && <Alert tone="error">{error}</Alert>}
        {notice && <Alert tone="ok">{notice}</Alert>}
        <form onSubmit={(e) => { e.preventDefault(); void submit(async () => { await auth.sendPasswordReset(email); setNotice(cms.t('account.auth.forgot_sent')); }); }} className="space-y-4">
          <label className="block text-xs font-semibold text-[#18181B]">{cms.t('account.auth.email')}
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </label>
          <button type="submit" disabled={busy} className={primaryButton}>{cms.t('account.auth.forgot_button')}</button>
        </form>
        <button type="button" onClick={() => setMode('sign-in')} className="mt-4 text-xs font-bold text-[#B45309] hover:underline cursor-pointer">{cms.t('account.auth.back_to_sign_in')}</button>
      </Card>
    );
  }

  const signUp = mode === 'sign-up';
  return (
    <Card>
      <span className="text-xs font-bold uppercase tracking-widest text-[#B45309] block mb-3">{cms.t('account.auth.eyebrow')}</span>
      <div className="flex gap-1 p-1 rounded-full bg-stone-100 mb-6" role="tablist">
        {(['sign-in', 'sign-up'] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError(null); }}
            className={`flex-1 py-2 rounded-full text-xs font-bold transition-colors cursor-pointer ${mode === m ? 'bg-white text-[#18181B] shadow-xs' : 'text-stone-500'}`}>
            {m === 'sign-in' ? cms.t('account.auth.sign_in_tab') : cms.t('account.auth.sign_up_tab')}
          </button>
        ))}
      </div>
      <h1 className="font-serif-heading font-bold text-2xl text-[#18181B] mb-1">{signUp ? cms.t('account.auth.sign_up_title') : cms.t('account.auth.sign_in_title')}</h1>
      {signUp && <p className="text-sm text-stone-600 mb-4">{cms.t('account.auth.sign_up_text')}</p>}
      {error && <Alert tone="error">{error}</Alert>}
      <form
        className="space-y-4 mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(async () => {
            if (!signUp) return auth.signIn(email, password);
            const ready = await auth.signUp({
              email, password, firstName, lastName, acceptTerms: terms,
              termsVersion: config?.termsVersion ?? '',
              marketingEmail: mEmail, marketingSms: mSms,
            });
            if (!ready) setMode('check-email');
          });
        }}
      >
        {signUp && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-[#18181B]">{cms.t('account.auth.first_name')}
              <input required autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
            </label>
            <label className="block text-xs font-semibold text-[#18181B]">{cms.t('account.auth.last_name')}
              <input required autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
            </label>
          </div>
        )}
        <label className="block text-xs font-semibold text-[#18181B]">{cms.t('account.auth.email')}
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </label>
        <label className="block text-xs font-semibold text-[#18181B]">{cms.t('account.auth.password')}
          <input type="password" required minLength={signUp ? 8 : undefined} autoComplete={signUp ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          {signUp && <span className="block text-[11px] font-normal text-stone-500 mt-1">{cms.t('account.auth.password_hint')}</span>}
        </label>
        {signUp && (
          <div className="space-y-2.5">
            <label className="flex items-start gap-2.5 text-xs text-stone-700 cursor-pointer">
              <input type="checkbox" required checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#F5D103]" />
              <span><InlineText text={cms.t('account.auth.terms')} /></span>
            </label>
            <label className="flex items-start gap-2.5 text-xs text-stone-700 cursor-pointer">
              <input type="checkbox" checked={mEmail} onChange={(e) => setMEmail(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#F5D103]" />
              <span>{cms.t('account.auth.marketing_email')}</span>
            </label>
            <label className="flex items-start gap-2.5 text-xs text-stone-700 cursor-pointer">
              <input type="checkbox" checked={mSms} onChange={(e) => setMSms(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#F5D103]" />
              <span>{cms.t('account.auth.marketing_sms')}</span>
            </label>
          </div>
        )}
        <button type="submit" disabled={busy || (signUp && !terms)} className={`${primaryButton} flex items-center justify-center gap-2`}>
          <Lock className="w-4 h-4" />
          {signUp ? cms.t('account.auth.sign_up_button') : cms.t('account.auth.sign_in_button')}
        </button>
      </form>
      {!signUp && (
        <button type="button" onClick={() => setMode('forgot')} className="mt-4 text-xs font-bold text-[#B45309] hover:underline cursor-pointer">{cms.t('account.auth.forgot')}</button>
      )}
    </Card>
  );
};

/** Shown after following a password-reset email link. */
export const NewPasswordScreen: React.FC = () => {
  const cms = useCms();
  const errorMessage = useErrorMessage();
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  return (
    <Card>
      <h1 className="font-serif-heading font-bold text-2xl text-[#18181B] mb-4">{cms.t('account.auth.new_password_title')}</h1>
      {error && <Alert tone="error">{error}</Alert>}
      {done ? (
        <p className="text-sm text-[#92400E] font-semibold flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{cms.t('account.auth.password_saved')}</p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            updatePassword(password).then(() => setDone(true), (err) => setError(errorMessage(err))).finally(() => setBusy(false));
          }}
        >
          <label className="block text-xs font-semibold text-[#18181B]">{cms.t('account.auth.password')}
            <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
            <span className="block text-[11px] font-normal text-stone-500 mt-1">{cms.t('account.auth.password_hint')}</span>
          </label>
          <button type="submit" disabled={busy} className={primaryButton}>{cms.t('account.auth.new_password_button')}</button>
        </form>
      )}
    </Card>
  );
};

/** A signed-in user without a shop profile yet (e.g. the sign-up details could not be applied automatically). */
export const CompleteProfileScreen: React.FC = () => {
  const cms = useCms();
  const errorMessage = useErrorMessage();
  const { context, completeSignup } = useAuth();
  const meta = context?.signupMetadata ?? {};
  const [firstName, setFirstName] = useState(typeof meta.first_name === 'string' ? meta.first_name : '');
  const [lastName, setLastName] = useState(typeof meta.last_name === 'string' ? meta.last_name : '');
  const [terms, setTerms] = useState(false);
  const [mEmail, setMEmail] = useState(meta.marketing_email === true);
  const [mSms, setMSms] = useState(meta.marketing_sms === true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <h1 className="font-serif-heading font-bold text-2xl text-[#18181B] mb-1">{cms.t('account.complete.title')}</h1>
      <p className="text-sm text-stone-600 mb-5">{cms.t('account.complete.text')}</p>
      {error && <Alert tone="error">{error}</Alert>}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          completeSignup({ firstName, lastName, acceptTerms: terms, termsVersion: context?.termsVersion ?? '', marketingEmail: mEmail, marketingSms: mSms })
            .catch((err) => setError(errorMessage(err)))
            .finally(() => setBusy(false));
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-[#18181B]">{cms.t('account.auth.first_name')}
            <input required autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
          </label>
          <label className="block text-xs font-semibold text-[#18181B]">{cms.t('account.auth.last_name')}
            <input required autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
          </label>
        </div>
        <label className="flex items-start gap-2.5 text-xs text-stone-700 cursor-pointer">
          <input type="checkbox" required checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#F5D103]" />
          <span><InlineText text={cms.t('account.auth.terms')} /></span>
        </label>
        <label className="flex items-start gap-2.5 text-xs text-stone-700 cursor-pointer">
          <input type="checkbox" checked={mEmail} onChange={(e) => setMEmail(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#F5D103]" />
          <span>{cms.t('account.auth.marketing_email')}</span>
        </label>
        <label className="flex items-start gap-2.5 text-xs text-stone-700 cursor-pointer">
          <input type="checkbox" checked={mSms} onChange={(e) => setMSms(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#F5D103]" />
          <span>{cms.t('account.auth.marketing_sms')}</span>
        </label>
        <button type="submit" disabled={busy || !terms} className={primaryButton}>{cms.t('account.complete.button')}</button>
      </form>
    </Card>
  );
};
