import React, { useState } from 'react';
import { Radio, ArrowRight, AlertCircle, Lock, User as UserIcon } from 'lucide-react';

export interface LoginViewProps {
  onLogin?: (username: string, password: string) => void | Promise<void | boolean>;
  error?: string | null;
  isLoading?: boolean;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLogin,
  error: externalError,
  isLoading = false,
}) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('12345');
  const [internalError, setInternalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const displayError = externalError || internalError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInternalError(null);

    if (!username.trim() || !password.trim()) {
      setInternalError('Please enter both username and password');
      return;
    }

    if (onLogin) {
      setSubmitting(true);
      try {
        await onLogin(username, password);
      } catch (err: any) {
        setInternalError(err?.message || 'Login failed');
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleFillDefaults = () => {
    setUsername('admin');
    setPassword('12345');
    setInternalError(null);
  };

  return (
    <div className="min-h-screen bg-obsidian flex flex-col items-center justify-center p-4">
      {/* Brand & Ambient Glow */}
      <div className="relative mb-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-ash border border-charcoal shadow-sm mb-4 relative group">
          <div className="absolute inset-0 rounded-full bg-phosphor-green/20 blur-md pointer-events-none" />
          <Radio className="w-8 h-8 text-phosphor-green relative z-10 animate-pulse" />
        </div>
        <h1 className="text-2xl font-medium tracking-tight text-snow">
          SDR <span className="text-phosphor-green font-normal">RECORDER</span>
        </h1>
        <p className="text-sm text-smoke mt-1">
          Radio Communications Recording & Monitoring
        </p>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-sm bg-ash border border-charcoal rounded-cards p-8 shadow-sm">
        <div className="mb-6">
          <h2 className="text-lg font-medium text-snow">Sign In</h2>
          <p className="text-xs text-smoke mt-1">
            Enter your credentials to access the console
          </p>
        </div>

        {displayError && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-2.5 p-3 rounded-inputs bg-[#2a1717] border border-[#522525] text-[#f87171] text-xs"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-tight">{displayError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-xs font-medium text-silver-mist mb-1.5"
            >
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-smoke">
                <UserIcon className="w-4 h-4" />
              </div>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                required
                className="w-full pl-9 pr-3 py-2 bg-obsidian border border-slate rounded-inputs text-sm text-snow placeholder-smoke focus:border-phosphor-green focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium text-silver-mist mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-smoke">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="•••••"
                autoComplete="current-password"
                required
                className="w-full pl-9 pr-3 py-2 bg-obsidian border border-slate rounded-inputs text-sm text-snow placeholder-smoke focus:border-phosphor-green focus:outline-none transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || submitting}
            className="w-full mt-2 py-2.5 px-4 bg-phosphor-green text-[#121212] font-medium text-sm rounded-buttons hover:bg-mint-pulse active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <span>{isLoading || submitting ? 'Signing In...' : 'Sign In ->'}</span>
            {!isLoading && !submitting && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        {/* Credentials Hint */}
        <div className="mt-6 pt-5 border-t border-charcoal/80 text-center">
          <p
            onClick={handleFillDefaults}
            className="text-xs text-smoke cursor-pointer hover:text-silver-mist transition-colors"
            title="Click to fill default credentials"
          >
            Default credentials: admin / 12345
          </p>
        </div>
      </div>

      <div className="mt-8 text-xs text-smoke font-mono">
        v1.0.0 · Continuous Radio Monitoring & Archiving System
      </div>
    </div>
  );
};
