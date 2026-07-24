// src/pages/SubstackImportPage.tsx
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

interface ImportResult {
  import_run_id: string;
  total_rows: number;
  new: number;
  reactivated: number;
  unsubscribed: number;
  engagement_snapshots_created: number;
  matched_to_members: number;
}

interface ImportRun {
  id: string;
  filename: string | null;
  total_rows: number;
  new_count: number;
  reactivated_count: number;
  unsubscribed_count: number;
  status: string;
  error_message: string | null;
  created_at: string;
}

// TODO: move to an env var (e.g. VITE_BACKEND_URL) once the project has a
// pattern for that — hardcoded for now since this only runs against local dev.
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export function SubstackImportPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ImportRun[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const loadHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    const { data, error: historyErr } = await supabase
      .from('substack_import_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    setHistory(historyErr ? [] : data ?? []);
    setIsLoadingHistory(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const { data, error: historyErr } = await supabase
        .from('substack_import_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (cancelled) return;
      setHistory(historyErr ? [] : data ?? []);
      setIsLoadingHistory(false);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setResult(null);
    setError(null);
    setFile(e.target.files?.[0] ?? null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${BACKEND_URL}/substack/import`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setResult(data);
      setFile(null);
      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong during import');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-charcoal">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold text-white">
              SolutionExec Member Intelligence Platform
            </h1>
            <p className="text-sm text-white/60">Substack subscriber import</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-md border border-white/20 bg-transparent px-3 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white"
          >
            ← Back to dashboard
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 bg-surface px-4 py-8 sm:px-6">
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-1 text-sm font-semibold text-slate-900">Upload CSV</h2>
          <p className="mb-4 text-xs text-slate-500">
            Export from Substack: Settings → Subscribers → Export
          </p>

          <label
            htmlFor="csv-upload"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 py-10 transition-colors hover:border-orange"
          >
            <span className="text-sm text-slate-600">
              {file ? file.name : 'Choose a CSV file or drag it here'}
            </span>
            <input
              id="csv-upload"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>

          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="mt-4 w-full rounded-md bg-orange py-2.5 text-sm font-medium text-white hover:bg-orange-dark disabled:opacity-50"
          >
            {isUploading ? 'Importing…' : 'Import subscribers'}
          </button>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-700">Import failed: {error}</p>
            </div>
          )}

          {result && (
            <div className="mt-4 space-y-1 rounded-lg border border-sage bg-sage-tint px-4 py-3">
              <p className="text-sm font-medium text-ink">Import complete</p>
              <p className="text-sm text-sage">{result.total_rows} rows processed</p>
              <p className="text-sm text-sage">{result.new} new subscribers</p>
              <p className="text-sm text-sage">{result.reactivated} reactivated</p>
              <p className="text-sm text-sage">{result.unsubscribed} marked unsubscribed</p>
              <p className="text-sm text-sage">{result.matched_to_members} linked to existing members</p>
              <p className="text-sm text-sage">{result.engagement_snapshots_created} engagement snapshots recorded</p>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Import history</h2>
          {isLoadingHistory ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-slate-400">No imports yet.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">File</th>
                    <th className="px-4 py-2 text-right font-medium">Rows</th>
                    <th className="px-4 py-2 text-right font-medium">New</th>
                    <th className="px-4 py-2 text-right font-medium">Unsub'd</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((run) => (
                    <tr key={run.id} className="border-t border-slate-100">
                      <td className="px-4 py-2 text-slate-600">
                        {new Date(run.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-slate-600">{run.filename ?? '—'}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{run.total_rows}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{run.new_count}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{run.unsubscribed_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}