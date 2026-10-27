import { useCallback, useEffect, useState } from 'react';
import { HeaderActions } from '../components/HeaderActions';
import {
  fetchMemberAccessRequests,
  reviewMemberAccessRequest,
  type MemberAccessRequest,
  type MemberAccessRequestStatus,
} from '../api/memberAccessRequestsApi';

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(displayValue).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function labelFor(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

const STATUS_STYLES: Record<MemberAccessRequestStatus, string> = {
  pending: 'bg-amber-100 text-amber-900',
  reviewed: 'bg-emerald-100 text-emerald-900',
  declined: 'bg-rose-100 text-rose-900',
};

export function MemberAccessRequestsAdminPage() {
  const [requests, setRequests] = useState<MemberAccessRequest[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setRequests(await fetchMemberAccessRequests());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load access requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchMemberAccessRequests()
      .then((items) => { if (active) setRequests(items); })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load access requests.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const markReviewed = async (request: MemberAccessRequest, status: 'reviewed' | 'declined') => {
    setBusyId(request.id);
    setError(null);
    try {
      await reviewMemberAccessRequest(request.id, status, notes[request.id] ?? '');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this request.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="bg-charcoal">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold text-white">SolutionExec Member Intelligence Platform</h1>
            <p className="text-sm text-white/60">Member access requests</p>
          </div>
          <HeaderActions />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-8 sm:px-6">
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
          Reviewing a request does not create a member record or grant portal access. After verifying a request, use the trusted admin process to create the record and link the applicant’s profile.
        </div>

        {error && <p role="alert" className="mb-5 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
        {loading ? (
          <p className="text-sm text-slate-600">Loading requests…</p>
        ) : requests.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">There are no member access requests yet.</div>
        ) : (
          <div className="space-y-5">
            {requests.map((request) => {
              const submitted = request.submitted_data ?? {};
              const name = `${displayValue(submitted.first_name)} ${displayValue(submitted.last_name)}`;
              return (
                <article key={request.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">{name}</h2>
                      <p className="mt-1 text-sm text-slate-600">{request.email}</p>
                      <p className="mt-1 text-xs text-slate-500">Submitted {new Date(request.submitted_at).toLocaleString()}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[request.status]}`}>
                      {request.status}
                    </span>
                  </div>

                  <details className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                    <summary className="cursor-pointer text-sm font-medium text-slate-800">View submitted profile details</summary>
                    <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                      {Object.entries(submitted).map(([key, value]) => (
                        <div key={key} className="min-w-0">
                          <dt className="text-xs font-semibold text-slate-500">{labelFor(key)}</dt>
                          <dd className="mt-0.5 break-words text-sm text-slate-900">{displayValue(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>

                  {request.review_note && <p className="mt-4 text-sm text-slate-600">Review note: {request.review_note}</p>}
                  {request.status === 'pending' && (
                    <div className="mt-5 border-t border-slate-100 pt-4">
                      <label className="block text-xs font-medium text-slate-600" htmlFor={`note-${request.id}`}>Review note (optional)</label>
                      <textarea
                        id={`note-${request.id}`}
                        rows={2}
                        maxLength={1000}
                        value={notes[request.id] ?? ''}
                        onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" disabled={busyId === request.id} onClick={() => void markReviewed(request, 'reviewed')} className="rounded-lg bg-charcoal px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                          {busyId === request.id ? 'Saving…' : 'Mark reviewed'}
                        </button>
                        <button type="button" disabled={busyId === request.id} onClick={() => void markReviewed(request, 'declined')} className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-800 hover:bg-rose-50 disabled:opacity-50">
                          Decline request
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
