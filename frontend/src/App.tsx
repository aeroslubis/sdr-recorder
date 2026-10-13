import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginView } from './components/LoginView';
import { DashboardLayout } from './components/DashboardLayout';

const MainApp: React.FC = () => {
  const { isAuthenticated, isLoading, login, error } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-obsidian flex items-center justify-center text-silver-mist font-circular">
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

  return <DashboardLayout />;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
};

export default App;
