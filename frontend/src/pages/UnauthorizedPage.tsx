import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export function UnauthorizedPage() {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Access denied</h1>
        <p className="mt-2 text-sm text-slate-500">
          You don&apos;t have permission to view this page
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-8 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
