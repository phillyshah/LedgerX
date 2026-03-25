import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { FileText, Eye, EyeOff, HelpCircle } from 'lucide-react';
import { HelpModal } from './HelpModal';

type AuthMode = 'signin' | 'signup';

export function AuthForm() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'signup') {
        await signUp(username, password);
      } else {
        await signIn(username, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-600 rounded-2xl mb-4">
            <FileText className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">LedgerX</h1>
          <p className="text-green-200">Simplified Transaction Management</p>
        </div>

        <div className="bg-green-800 rounded-3xl shadow-xl p-8">
          <div className="flex gap-1 mb-6 bg-green-700 rounded-2xl p-1">
            <button
              type="button"
              onClick={() => setMode('signin')}
              className={`flex-1 py-2.5 px-3 rounded-xl font-medium transition-all text-sm ${
                mode === 'signin'
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-green-300 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`flex-1 py-2.5 px-3 rounded-xl font-medium transition-all text-sm ${
                mode === 'signup'
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-green-300 hover:text-white'
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-green-100 mb-2">
                User ID
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                pattern="[a-zA-Z0-9_]{3,20}"
                className="w-full px-4 py-3 bg-white border border-green-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-slate-900 placeholder-slate-500"
                placeholder="your_userid"
              />
              <p className="text-xs text-green-300 mt-1">3-20 characters, letters, numbers, and underscores only</p>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-green-100 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  className="w-full px-4 py-3 pr-12 bg-white border border-green-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-slate-900 placeholder-slate-500"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 hover:bg-green-50 rounded-lg transition-all"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4 text-slate-600" />
                  ) : (
                    <Eye className="w-4 h-4 text-slate-600" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-900 border border-red-700 rounded-xl">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? 'Please wait...' : mode === 'signup' ? 'Sign Up' : 'Sign In'}
            </button>
          </form>
        </div>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-green-200 hover:text-white hover:bg-green-700/50 rounded-xl transition-all"
          >
            <HelpCircle className="w-4 h-4" />
            Need help getting started?
          </button>
        </div>

        <div className="mt-4 text-center">
          <p className="text-xs text-green-300/60">v2.5</p>
        </div>
      </div>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}
