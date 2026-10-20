import React, { useState } from 'react';
import { Lock, AlertCircle, ShieldAlert } from 'lucide-react';
import { api } from '../api';
import { BrandLogo } from './BrandLogo';

interface LoginScreenProps {
  notice: string | null;
  requireSecrets: boolean;
  onSuccess: (username: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  notice,
  requireSecrets,
  onSuccess,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.login(username, password, rememberMe);
      onSuccess(res.username);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-8 bg-[#f4f6f8] dark:bg-[#263238] text-[#121a21] dark:text-white">
      <div className="w-full max-w-md bg-white dark:bg-[#1b262c] border border-[#d6dfe5] dark:border-[#32424a] rounded-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <BrandLogo size="md" />
          <div>
            <h1 className="text-xl font-bold tracking-tight">UK Finance Tracker</h1>
            <p className="text-sm text-[#485b69] dark:text-[#b0bec5]">
              Sign in to access your financial command center
            </p>
          </div>
        </div>

        {notice && (
          <div
            className={`mb-4 p-3 rounded-lg border text-sm flex items-start gap-2.5 ${
              requireSecrets
                ? 'bg-[#8b0000]/20 border-[#ff5252] text-[#ff5252]'
                : 'bg-[#f39c12]/15 border-[#f39c12]/40 text-[#f39c12]'
            }`}
          >
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{notice}</span>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-[#e74c3c]/15 border border-[#e74c3c] text-[#ff5252] text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="login-username"
              className="block text-sm font-medium mb-1.5 text-[#121a21] dark:text-[#cfd8dc]"
            >
              Username
            </label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#f4f6f8] dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a] text-[#121a21] dark:text-white focus:border-[#e74c3c]"
              placeholder="Enter username"
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-sm font-medium mb-1.5 text-[#121a21] dark:text-[#cfd8dc]"
            >
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#f4f6f8] dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a] text-[#121a21] dark:text-white focus:border-[#e74c3c]"
              placeholder="Enter password"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-[#485b69] dark:text-[#b0bec5] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="rounded border-[#32424a] text-[#e74c3c] focus:ring-[#e74c3c]"
            />
            <span>Remember me for 30 days</span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-[#e74c3c] hover:bg-[#d64232] disabled:opacity-50 text-white font-semibold transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};
