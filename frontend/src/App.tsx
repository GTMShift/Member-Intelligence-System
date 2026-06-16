import { useState } from 'react';
import { MemberProfileCard } from './components/MemberProfileCard';
import { MemberSearchPanel } from './components/MemberSearchPanel';
import { useAuth } from './context/AuthContext';
import type { UserRole } from './types/api';

function App() {
  const { role, setRole } = useAuth();
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              SolutionExec Member Intelligence Platform
            </h1>
            <p className="text-sm text-slate-500">Admin dashboard</p>
          </div>
          <RoleToggle role={role} onChange={setRole} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[90rem] flex-1 flex-col lg:flex-row">
        <aside className="w-full border-b border-slate-200 bg-slate-50 lg:w-[22rem] lg:shrink-0 lg:border-b-0 lg:border-r xl:w-[26rem]">
          <div className="h-[28rem] lg:h-[calc(100vh-4.5rem)]">
            <MemberSearchPanel
              selectedMemberId={selectedMemberId}
              onSelectMember={setSelectedMemberId}
            />
          </div>
        </aside>

        <section className="min-h-[24rem] flex-1 bg-slate-50 lg:min-h-[calc(100vh-4.5rem)]">
          {selectedMemberId ? (
            <MemberProfileCard memberId={selectedMemberId} />
          ) : (
            <div className="flex h-full items-center justify-center p-8">
              <div className="text-center">
                <p className="text-base font-medium text-slate-700">
                  Select a member to view their profile
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Use search and filters to find members in the directory
                </p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function RoleToggle({
  role,
  onChange,
}: {
  role: UserRole;
  onChange: (role: UserRole) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-slate-500">View as</span>
      <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        <button
          type="button"
          onClick={() => onChange('admin')}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            role === 'admin'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Admin
        </button>
        <button
          type="button"
          onClick={() => onChange('member')}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            role === 'member'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Member
        </button>
      </div>
    </div>
  );
}

export default App;
