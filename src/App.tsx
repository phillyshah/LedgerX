import { useAuth } from './contexts/AuthContext';
import { AuthForm } from './components/AuthForm';
import { Dashboard } from './components/Dashboard';
import { AdminLayout } from './components/admin/AdminLayout';
import { ResetPasswordForm } from './components/ResetPasswordForm';

function App() {
  const { user, loading, isAdmin, isRecoveryMode } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (isRecoveryMode) return <ResetPasswordForm />;

  if (!user) return <AuthForm />;

  return isAdmin ? <AdminLayout /> : <Dashboard />;
}

export default App;
