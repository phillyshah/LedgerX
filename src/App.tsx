import { lazy, Suspense } from 'react';
import { useAuth } from './contexts/AuthContext';
import { AuthForm } from './components/AuthForm';

// Lazy-load the two mutually exclusive top-level views so only the relevant
// chunk downloads after sign-in. Admin users never download Dashboard code;
// regular users never download AdminLayout code.
const Dashboard        = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const AdminLayout      = lazy(() => import('./components/admin/AdminLayout').then(m => ({ default: m.AdminLayout })));
const ResetPasswordForm = lazy(() => import('./components/ResetPasswordForm').then(m => ({ default: m.ResetPasswordForm })));

function LoadingSpinner() {
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

  if (loading) return <LoadingSpinner />;

  if (isRecoveryMode) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <ResetPasswordForm />
      </Suspense>
    );
  }

  if (!user) return <AuthForm />;

  return (
    <Suspense fallback={<LoadingSpinner />}>
      {isAdmin ? <AdminLayout /> : <Dashboard />}
    </Suspense>
  );
}

export default App;
