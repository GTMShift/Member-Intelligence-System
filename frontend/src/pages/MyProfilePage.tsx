// src/pages/MyProfilePage.tsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/authShared';
import {
  fetchMyProfile,
  saveMyEmployment,
  updateMyProfile,
  uploadAvatar,
  type EmploymentAction,
  type UpdateMyProfileInput,
} from '../api/myProfileApi';
import type { EmploymentHistoryEntry } from '../types/api';

const SENIORITY_OPTIONS = [
  { value: '', label: 'Select seniority' },
  { value: 'C-Suite', label: 'C-Suite' },
  { value: 'VP', label: 'VP' },
  { value: 'Director', label: 'Director' },
  { value: 'Manager', label: 'Manager' },
  { value: 'Individual Contributor', label: 'Individual Contributor' },
] as const;

type FormState = {
  first_name: string;
  last_name: string;
  linkedin_url: string;
  phone: string;
  job_title: string;
  current_job_start_date: string;
  seniority_level: string;
  company_name: string;
  country: string;
  state_region: string;
  city: string;
};

const EMPTY_STATE: FormState = {
  first_name: '',
  last_name: '',
  linkedin_url: '',
  phone: '',
  job_title: '',
  current_job_start_date: '',
  seniority_level: '',
  company_name: '',
  country: '',
  state_region: '',
  city: '',
};

function normalizeLinkedInUrl(input: string): string {
  let url = input.trim();
  if (!url) return url;
  url = url.replace(/^https?:\/\//i, '');
  if (!/^www\./i.test(url)) {
    url = `www.${url}`;
  }
  return `https://${url}`;
}

export function MyProfilePage() {
  const navigate = useNavigate();
  const { user, memberId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormState>(EMPTY_STATE);
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [employmentHistory, setEmploymentHistory] = useState<EmploymentHistoryEntry[]>([]);
  const [employmentAction, setEmploymentAction] = useState<EmploymentAction | null>(null);
  const [isSavingEmployment, setIsSavingEmployment] = useState(false);
  const [employmentError, setEmploymentError] = useState<string | null>(null);
  const [employmentSaved, setEmploymentSaved] = useState(false);

  useEffect(() => {
    if (!memberId || !user?.id) return;
    let cancelled = false;

    fetchMyProfile(memberId, user.id)
      .then((data) => {
        if (cancelled) return;
        setForm({
          first_name: data.first_name,
          last_name: data.last_name,
          linkedin_url: data.linkedin_url,
          phone: data.phone ?? '',
          job_title: data.job_title ?? '',
          current_job_start_date: data.current_job_start_date ?? '',
          seniority_level: data.seniority_level ?? '',
          company_name: data.company_name ?? '',
          country: data.country ?? '',
          state_region: data.state_region ?? '',
          city: data.city ?? '',
        });
        setEmail(data.email);
        setAvatarUrl(data.avatar_url);
        setEmploymentHistory(data.employment_history);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load your profile'))
      .finally(() => {
        if (!cancelled) setIsLoadingData(false);
      });

    return () => {
      cancelled = true;
    };
  }, [memberId, user?.id]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setSaved(false);
    if (name === 'job_title' || name === 'company_name' || name === 'current_job_start_date') {
      setEmploymentSaved(false);
      setEmploymentError(null);
    }
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    setIsUploadingPhoto(true);
    setError(null);
    try {
      const newUrl = await uploadAvatar(user.id, file);
      setAvatarUrl(newUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload photo');
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberId) return;

    setIsSaving(true);
    setError(null);
    setSaved(false);

    try {
      const input: UpdateMyProfileInput = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        linkedin_url: normalizeLinkedInUrl(form.linkedin_url),
        phone: form.phone.trim() || null,
        seniority_level: form.seniority_level || null,
        country: form.country.trim() || null,
        state_region: form.state_region.trim() || null,
        city: form.city.trim() || null,
      };
      await updateMyProfile(memberId, input);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEmployment = async () => {
    if (!memberId) return;
    if (!employmentAction) {
      setEmploymentError('Choose whether this is a job change or a correction.');
      return;
    }

    const company = form.company_name.trim();
    const role = form.job_title.trim();
    if (!company || !role) {
      setEmploymentError('Enter both your company and job title.');
      return;
    }
    if (employmentAction === 'change' && !form.current_job_start_date) {
      setEmploymentError('Enter the date your new role started.');
      return;
    }

    setIsSavingEmployment(true);
    setEmploymentError(null);
    setEmploymentSaved(false);
    try {
      const result = await saveMyEmployment(memberId, employmentAction, {
        company,
        role,
        start_date: form.current_job_start_date || null,
      });
      setEmploymentHistory(result.history);
      setForm((previous) => ({
        ...previous,
        company_name: result.current.company,
        job_title: result.current.role,
        current_job_start_date: result.current.start_date ?? '',
      }));
      setEmploymentAction(null);
      setEmploymentSaved(true);
    } catch (err) {
      setEmploymentError(err instanceof Error ? err.message : 'Failed to save employment');
    } finally {
      setIsSavingEmployment(false);
    }
  };

  if (isLoadingData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-charcoal/20 border-t-charcoal" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="bg-charcoal">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold text-white">
              SolutionExec Member Intelligence Platform
            </h1>
            <p className="text-sm text-white/60">My profile</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/portal')}
            className="rounded-md border border-white/20 bg-transparent px-3 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white"
          >
            ← Back
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        {saved && (
          <div className="mb-6 rounded-lg border border-sage bg-sage-tint px-4 py-3">
            <p className="text-sm text-ink">Your profile has been updated.</p>
          </div>
        )}

        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Profile photo</h2>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-slate-100">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Your profile" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg font-medium text-slate-400">
                  {form.first_name?.[0]?.toUpperCase() ?? '?'}
                </div>
              )}
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoSelect}
                className="hidden"
                id="avatar-upload"
              />
              <label
                htmlFor="avatar-upload"
                className="inline-block cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {isUploadingPhoto ? 'Uploading…' : 'Change photo'}
              </label>
              <p className="mt-1 text-xs text-slate-400">JPG or PNG, up to 5MB</p>
            </div>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Personal info</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">First name</label>
                <input
                  type="text"
                  name="first_name"
                  value={form.first_name}
                  onChange={handleChange}
                  required
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Last name</label>
                <input
                  type="text"
                  name="last_name"
                  value={form.last_name}
                  onChange={handleChange}
                  required
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Email</label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Phone</label>
                <input
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">LinkedIn URL</label>
                <input
                  type="text"
                  name="linkedin_url"
                  value={form.linkedin_url}
                  onChange={handleChange}
                  placeholder="linkedin.com/in/yourname"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">Employment</h2>
            <p className="mb-4 text-xs text-slate-500">
              Choose the action that matches your update so your career history stays accurate.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Job title</label>
                <input
                  type="text"
                  name="job_title"
                  value={form.job_title}
                  onChange={handleChange}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Seniority</label>
                <select
                  name="seniority_level"
                  value={form.seniority_level}
                  onChange={handleChange}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                >
                  {SENIORITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Company name</label>
                <input
                  type="text"
                  name="company_name"
                  value={form.company_name}
                  onChange={handleChange}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Job start date</label>
                <input
                  type="date"
                  name="current_job_start_date"
                  value={form.current_job_start_date}
                  onChange={handleChange}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-slate-600">What are you updating?</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  aria-pressed={employmentAction === 'change'}
                  onClick={() => { setEmploymentAction('change'); setEmploymentError(null); setEmploymentSaved(false); }}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${employmentAction === 'change' ? 'border-orange bg-orange/5 text-slate-900' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                >
                  <span className="block font-medium">Changed jobs</span>
                  <span className="mt-1 block text-xs text-slate-500">Keep your previous role in your history.</span>
                </button>
                <button
                  type="button"
                  aria-pressed={employmentAction === 'correct'}
                  onClick={() => { setEmploymentAction('correct'); setEmploymentError(null); setEmploymentSaved(false); }}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${employmentAction === 'correct' ? 'border-orange bg-orange/5 text-slate-900' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                >
                  <span className="block font-medium">Correct current information</span>
                  <span className="mt-1 block text-xs text-slate-500">Fix the current role without creating a new job entry.</span>
                </button>
              </div>
            </div>

            {employmentError && (
              <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{employmentError}</p>
            )}
            {employmentSaved && (
              <p role="status" className="mt-4 rounded-md bg-sage-tint px-3 py-2 text-sm text-ink">Employment and career history saved.</p>
            )}

            <div className="mt-6 border-t border-slate-100 pt-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Career timeline</h3>
              {employmentHistory.length ? (
                <ol className="space-y-3 border-l border-slate-200 pl-4">
                  {employmentHistory.map((job) => (
                    <li key={job.id} className="relative">
                      <span className="absolute -left-[1.33rem] top-1.5 h-2 w-2 rounded-full bg-orange" />
                      <p className="text-sm font-medium text-slate-800">
                        {job.role || 'Role not listed'} · {job.company}
                        {job.is_current && <span className="ml-2 text-xs font-medium text-sage">Current</span>}
                      </p>
                      <p className="text-xs text-slate-500">
                        {job.start_date ?? 'Start date not listed'} – {job.is_current ? 'Present' : job.end_date ?? 'End date not listed'}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-slate-500">No employment history recorded.</p>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleSaveEmployment}
                disabled={isSavingEmployment}
                className="rounded-md bg-orange px-4 py-2 text-sm font-medium text-white hover:bg-orange-dark disabled:opacity-50"
              >
                {isSavingEmployment ? 'Saving…' : 'Save employment'}
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Location</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">City</label>
                <input
                  type="text"
                  name="city"
                  value={form.city}
                  onChange={handleChange}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">State / Region</label>
                <input
                  type="text"
                  name="state_region"
                  value={form.state_region}
                  onChange={handleChange}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Country</label>
                <input
                  type="text"
                  name="country"
                  value={form.country}
                  onChange={handleChange}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                />
              </div>
            </div>
          </section>

          <div className="flex justify-end pb-8">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-md bg-orange px-6 py-2 text-sm font-medium text-white hover:bg-orange-dark disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}