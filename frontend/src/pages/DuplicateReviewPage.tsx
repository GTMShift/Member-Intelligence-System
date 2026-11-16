import { useCallback, useEffect, useMemo, useState } from 'react';
import { HeaderActions } from '../components/HeaderActions';
import {
  fetchDuplicateReviewPairs,
  mergeDuplicateMembers,
  scanDuplicateMembers,
  updateDuplicateReviewStatus,
  type DuplicateReviewMember,
  type DuplicateReviewPair,
  type DuplicateReviewStatus,
} from '../api/duplicateReviewApi';

const FIELDS = [
  ['first_name', 'First name'],
  ['last_name', 'Last name'],
  ['email', 'Email'],
  ['linkedin_url', 'LinkedIn'],
  ['phone', 'Phone'],
  ['company_name', 'Current company'],
  ['job_title', 'Current role'],
  ['seniority_level', 'Seniority'],
  ['city', 'City'],
  ['state_region', 'State / region'],
  ['country', 'Country'],
] as const;

type FieldKey = (typeof FIELDS)[number][0];
type Side = 'a' | 'b';
const DEFAULT_FIELDS = Object.fromEntries(FIELDS.map(([field]) => [field, 'a'])) as Record<FieldKey, Side>;

function fieldValue(member: DuplicateReviewMember, field: FieldKey): string {
  if (field === 'company_name') {
    return member.employment_history.find((job) => job.is_current)?.company ?? member.profile?.company_name ?? '—';
  }
  if (field === 'job_title') {
    return member.employment_history.find((job) => job.is_current)?.role ?? member.profile?.job_title ?? '—';
  }
  const value = field in member ? member[field as keyof DuplicateReviewMember] : member.profile?.[field as keyof NonNullable<DuplicateReviewMember['profile']>];
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

function confidenceLabel(value: number) {
  return value >= 0.9 ? 'High confidence' : 'Review signals';
}

export function DuplicateReviewPage() {
  const [status, setStatus] = useState<DuplicateReviewStatus>('pending');
  const [pairs, setPairs] = useState<DuplicateReviewPair[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fieldSelections, setFieldSelections] = useState<Record<string, Record<FieldKey, Side>>>({});
  const [survivorSelections, setSurvivorSelections] = useState<Record<string, Side>>({});
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const result = await fetchDuplicateReviewPairs(status);
      setPairs(result);
      setSelectedId((current) => result.some((pair) => pair.id === current) ? current : result[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load duplicate candidates.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    let active = true;
    fetchDuplicateReviewPairs(status)
      .then((result) => {
        if (!active) return;
        setPairs(result);
        setSelectedId((current) => result.some((pair) => pair.id === current) ? current : result[0]?.id ?? null);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load duplicate candidates.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [status]);

  const selectedPair = pairs.find((pair) => pair.id === selectedId) ?? null;
  const selectedFields = selectedId ? fieldSelections[selectedId] ?? DEFAULT_FIELDS : DEFAULT_FIELDS;

  const preview = useMemo(() => {
    if (!selectedPair) return null;
    return Object.fromEntries(FIELDS.map(([field]) => [
      field,
      fieldValue(selectedFields[field] === 'b' ? selectedPair.member_b : selectedPair.member_a, field),
    ]));
  }, [selectedPair, selectedFields]);

  const scan = async () => {
    setScanning(true);
    setError(null);
    setMessage(null);
    try {
      const result = await scanDuplicateMembers();
      setMessage(`Scanned ${result.scanned} profiles; detected ${result.candidates} candidate pairs and added ${result.added} new ones. Previous review states are preserved.`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not scan profiles.');
    } finally {
      setScanning(false);
    }
  };

  const updateStatus = async (nextStatus: 'pending' | 'deferred' | 'dismissed') => {
    if (!selectedPair) return;
    setBusy(true);
    setError(null);
    try {
      await updateDuplicateReviewStatus(selectedPair.id, nextStatus);
      setMessage(nextStatus === 'dismissed' ? 'Candidate dismissed.' : nextStatus === 'deferred' ? 'Candidate deferred for later review.' : 'Candidate returned to the pending queue.');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this candidate.');
    } finally {
      setBusy(false);
    }
  };

  const mergeSelected = async (survivorSide: Side) => {
    if (!selectedPair) return;
    const survivor = survivorSide === 'a' ? selectedPair.member_a : selectedPair.member_b;
    const merged = survivorSide === 'a' ? selectedPair.member_b : selectedPair.member_a;
    if (!window.confirm(`Keep ${survivor.first_name} ${survivor.last_name} and merge ${merged.first_name} ${merged.last_name} into it? The duplicate will be archived, linked records reassigned, and the decision recorded in the merge audit.`)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await mergeDuplicateMembers(selectedPair.id, survivor.id, selectedFields);
      setMessage(`Merged ${merged.first_name} ${merged.last_name} into ${survivor.first_name} ${survivor.last_name}.`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not merge these profiles.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="bg-charcoal">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold text-white">SolutionExec Member Intelligence Platform</h1>
            <p className="text-sm text-white/60">Duplicate review</p>
          </div>
          <HeaderActions />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-ink">Review possible duplicates</h2>
            <p className="mt-1 text-sm text-ink/60">Compare profiles, choose the record to keep, then confirm a transactional merge.</p>
          </div>
          <button type="button" onClick={() => void scan()} disabled={scanning} className="rounded-lg bg-charcoal px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {scanning ? 'Scanning profiles…' : 'Scan profiles'}
          </button>
        </div>

        {message && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</p>}
        {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

        <div className="grid gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900">Candidate queue</h3>
              <select aria-label="Candidate status" value={status} onChange={(event) => { setLoading(true); setStatus(event.target.value as DuplicateReviewStatus); }} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                <option value="pending">Pending</option>
                <option value="deferred">Deferred</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </div>
            {loading ? <p className="py-5 text-sm text-slate-500">Loading candidates…</p> : pairs.length === 0 ? (
              <p className="py-5 text-sm text-slate-500">No candidates in this queue. Run a scan to check existing profiles.</p>
            ) : (
              <ul className="space-y-2">
                {pairs.map((pair) => (
                  <li key={pair.id}>
                    <button type="button" onClick={() => setSelectedId(pair.id)} className={`w-full rounded-lg border p-3 text-left ${selectedId === pair.id ? 'border-violet-500 bg-violet-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                      <span className="block font-medium text-slate-900">{pair.member_a.first_name} {pair.member_a.last_name} ↔ {pair.member_b.first_name} {pair.member_b.last_name}</span>
                      <span className="mt-1 block text-xs text-slate-500">{confidenceLabel(pair.confidence)} · {Math.round(pair.confidence * 100)}%</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="min-w-0 space-y-5">
            {!selectedPair ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Select a candidate to compare profiles.</div> : <>
              <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Match evidence</h3>
                    <p className="mt-1 text-sm text-slate-600">{confidenceLabel(selectedPair.confidence)} · {Math.round(selectedPair.confidence * 100)}% heuristic score, not a probability</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {status !== 'dismissed' && <>
                      <label className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">
                        Keep
                        <select aria-label="Profile to keep" disabled={busy} value={survivorSelections[selectedPair.id] ?? 'a'} onChange={(event) => setSurvivorSelections((current) => ({ ...current, [selectedPair.id]: event.target.value as Side }))} className="bg-transparent font-semibold">
                          <option value="a">Profile A</option><option value="b">Profile B</option>
                        </select>
                      </label>
                      <button type="button" disabled={busy} onClick={() => void mergeSelected(survivorSelections[selectedPair.id] ?? 'a')} className="rounded-md bg-violet-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Working…' : 'Confirm and merge'}</button>
                    </>}
                    {status === 'pending' ? <>
                      <button type="button" disabled={busy} onClick={() => void updateStatus('deferred')} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-60">Defer</button>
                      <button type="button" disabled={busy} onClick={() => void updateStatus('dismissed')} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-60">Dismiss</button>
                    </> : status === 'deferred' ? <button type="button" disabled={busy} onClick={() => void updateStatus('pending')} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-60">Return to pending</button> : null}
                  </div>
                </div>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {selectedPair.match_reasons.map((reason) => <li key={reason.field} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900">{reason.label}</li>)}
                </ul>
              </article>

              <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="grid grid-cols-[minmax(8rem,0.7fr)_minmax(0,1fr)_minmax(0,1fr)] border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
                  <span>Field</span><span>Profile A</span><span>Profile B</span>
                </div>
                {FIELDS.map(([field, label]) => {
                  const valueA = fieldValue(selectedPair.member_a, field);
                  const valueB = fieldValue(selectedPair.member_b, field);
                  const differs = valueA !== valueB;
                  return <div key={field} className={`grid grid-cols-[minmax(8rem,0.7fr)_minmax(0,1fr)_minmax(0,1fr)] border-b border-slate-100 px-4 py-3 text-sm ${differs ? 'bg-amber-50/60' : ''}`}>
                    <span className="font-medium text-slate-700">{label}{differs && <span className="ml-1 text-amber-700">· differs</span>}</span>
                    {(['a', 'b'] as const).map((side) => {
                      const member = side === 'a' ? selectedPair.member_a : selectedPair.member_b;
                      const value = side === 'a' ? valueA : valueB;
                      return <label key={side} className="flex min-w-0 items-start gap-2 pr-2 text-slate-800">
                        <input type="radio" name={`field-${selectedPair.id}-${field}`} checked={selectedFields[field] === side} onChange={() => setFieldSelections((current) => ({ ...current, [selectedPair.id]: { ...(current[selectedPair.id] ?? DEFAULT_FIELDS), [field]: side } }))} aria-label={`Use ${side === 'a' ? 'Profile A' : 'Profile B'} ${label}`} />
                        <span className="break-words">{value}<span className="sr-only"> for {member.first_name} {member.last_name}</span></span>
                      </label>;
                    })}
                  </div>;
                })}
              </article>

              <div className="grid gap-5 lg:grid-cols-2">
                <article className="rounded-xl border border-violet-200 bg-violet-50 p-5">
                  <h3 className="font-semibold text-violet-950">Selected-profile preview</h3>
                  <p className="mt-1 text-xs text-violet-900/70">These choices apply only after you confirm the merge.</p>
                  <dl className="mt-4 grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                    {FIELDS.map(([field, label]) => <div key={field} className="contents"><dt className="text-violet-900/70">{label}</dt><dd className="break-words font-medium text-violet-950">{preview?.[field]}</dd></div>)}
                  </dl>
                </article>

                <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="font-semibold text-slate-900">Employment history to preserve</h3>
                  <p className="mt-1 text-xs text-slate-500">Preview includes every distinct row from both profiles. Nothing is merged or deduplicated.</p>
                  <ul className="mt-3 space-y-2">
                    {[...selectedPair.member_a.employment_history, ...selectedPair.member_b.employment_history].map((job, index) => <li key={`${job.id}-${index}`} className="rounded-lg border border-slate-100 px-3 py-2 text-sm">
                      <span className="font-medium text-slate-900">{job.role || 'Role not set'} · {job.company}</span>
                      <span className="block text-xs text-slate-500">{job.start_date || 'Start unknown'} – {job.is_current ? 'Current' : job.end_date || 'End unknown'} · Profile {index < selectedPair.member_a.employment_history.length ? 'A' : 'B'}</span>
                    </li>)}
                    {selectedPair.member_a.employment_history.length + selectedPair.member_b.employment_history.length === 0 && <li className="text-sm text-slate-500">No employment history found.</li>}
                  </ul>
                  <h4 className="mt-5 font-semibold text-slate-900">Linked records to account for</h4>
                  <ul className="mt-2 space-y-1 text-sm text-slate-600">
                    {Object.keys({ ...selectedPair.member_a.linked_records, ...selectedPair.member_b.linked_records }).sort().map((table) => <li key={table}>{table}: {(selectedPair.member_a.linked_records[table]?.length ?? 0)} + {(selectedPair.member_b.linked_records[table]?.length ?? 0)} records</li>)}
                  </ul>
                </article>
              </div>
            </>}
          </section>
        </div>
      </main>
    </div>
  );
}
