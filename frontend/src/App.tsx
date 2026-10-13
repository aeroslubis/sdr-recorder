import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginView } from './components/LoginView';
import { LogOut, Radio } from 'lucide-react';

const MainApp: React.FC = () => {
  const { isAuthenticated, isLoading, login, logout, error, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-obsidian flex items-center justify-center text-silver-mist">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-phosphor-green border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Initializing SDR-Recorder...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView onLogin={login} error={error} isLoading={isLoading} />;
  }

  return (
    <div className="min-h-screen bg-obsidian text-snow flex flex-col font-circular">
      {/* Basic header placeholder until Task 8 */}
      <header className="h-16 border-b border-charcoal bg-obsidian px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-ash border border-charcoal flex items-center justify-center">
            <Radio className="w-4 h-4 text-phosphor-green animate-pulse" />
          </div>
          <span className="font-medium text-snow text-lg tracking-tight">
            [●] SDR-NVR
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs text-smoke font-mono">
            User: <span className="text-silver-mist">{user?.username}</span>
          </span>
          <button
            onClick={() => logout()}
            className="flex items-center gap-1.5 text-xs text-smoke hover:text-snow px-3 py-1.5 rounded-pill border border-slate hover:border-charcoal transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-medium text-snow mb-2">Welcome to SDR-Recorder NVR</h2>
          <p className="text-sm text-silver-mist">
            Authenticated as <span className="text-phosphor-green font-mono">{user?.username}</span>.
            Dashboard components will be loaded in the subsequent tasks.
          </p>
        </div>
      </main>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
};

export default App;
