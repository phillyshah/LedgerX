import { Suspense, lazy } from 'react';
import { useAuth } from './contexts/AuthContext';
import { AuthForm } from './components/AuthForm';
import { Dashboard } from './components/Dashboard';

const AdminLayout = lazy(() => import('./components/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })));
const ResetPasswordForm = lazy(() => import('./components/ResetPasswordForm').then((m) => ({ default: m.ResetPasswordForm })));

function FullScreenSpinner() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-slate-600 font-medium">Loading...</p>
      </div>
    </div>
  );
}

function App() {
  const { user, loading, isAdmin, isRecoveryMode } = useAuth();

  if (loading) return <FullScreenSpinner />;

  if (isRecoveryMode) {
    return (
      <Suspense fallback={<FullScreenSpinner />}>
        <ResetPasswordForm />
      </Suspense>
    );
  }

  if (!user) return <AuthForm />;

  if (isAdmin) {
    return (
      <Suspense fallback={<FullScreenSpinner />}>
        <AdminLayout />
      </Suspense>
    );
  }

  return <Dashboard />;
}

export default App;
