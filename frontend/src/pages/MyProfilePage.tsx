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
import {
  MAX_EMPLOYMENT_TEXT_LENGTH,
  emptyEmploymentForm,
  employmentFormFromCurrent,
  formatEmploymentDate,
  previousJobEndDate,
  todayIsoDate,
  validateEmploymentForm,
  type EmploymentFormValues,
} from '../lib/employmentForm';
import {
  MANAGEMENT_LAYER_OPTIONS,
  REGION_FIELDS,
  SENIORITY_OPTIONS,
  TEAM_FIELDS,
  TSHIRT_SIZES,
  emptyRegionFlags,
  emptyTeamFlags,
  isTshirtSize,
  type RegionFlags,
  type RegionKey,
  type TeamFlags,
  type TeamKey,
} from '../lib/profileOptions';
import type { EmploymentHistoryEntry } from '../types/api';

type FormState = {
  first_name: string;
  last_name: string;
  linkedin_url: string;
  phone: string;
  seniority_level: string;
  team_size: string;
  management_layers: string;
  country: string;
  state_region: string;
  city: string;
  address: string;
  zip_code: string;
  tshirt_size: string;
  dietary_restrictions: string;
};

const EMPTY_STATE: FormState = {
  first_name: '',
  last_name: '',
  linkedin_url: '',
  phone: '',
  seniority_level: '',
  team_size: '',
  management_layers: '',
  country: '',
  state_region: '',
  city: '',
  address: '',
  zip_code: '',
  tshirt_size: '',
  dietary_restrictions: '',
};

const INPUT_CLASS =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none';
const LABEL_CLASS = 'text-xs font-medium text-slate-600';

function normalizeLinkedInUrl(input: string): string {
  let url = input.trim();
  if (!url) return url;
  url = url.replace(/^https?:\/\//i, '');
  if (!/^www\./i.test(url)) {
    url = `www.${url}`;
  }
  return `https://${url}`;
}

function parseTeamSize(value: string): number | null | 'invalid' {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return 'invalid';
  const size = Number(trimmed);
  return size > 100000 ? 'invalid' : size;
}

function jobLabel(job: EmploymentHistoryEntry): string {
  return `${job.role || 'Role not listed'} at ${job.company}`;
}

export function MyProfilePage() {
  const navigate = useNavigate();
  const { user, memberId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormState>(EMPTY_STATE);
  const [teamsOverseen, setTeamsOverseen] = useState<TeamFlags>(emptyTeamFlags);
  const [regions, setRegions] = useState<RegionFlags>(emptyRegionFlags);
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Employment is saved separately from the rest of the profile so a job
  // change keeps the previous job in the member's career history.
  const [employmentHistory, setEmploymentHistory] = useState<EmploymentHistoryEntry[]>([]);
  const [employmentMode, setEmploymentMode] = useState<EmploymentAction | null>(null);
  const [employmentForm, setEmploymentForm] = useState<EmploymentFormValues>(emptyEmploymentForm);
  const [isSavingEmployment, setIsSavingEmployment] = useState(false);
  const [employmentError, setEmploymentError] = useState<string | null>(null);
  const [employmentMessage, setEmploymentMessage] = useState<string | null>(null);

  const currentJob = employmentHistory.find((job) => job.is_current);
  const today = todayIsoDate();

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
          seniority_level: data.seniority_level ?? '',
          team_size: data.team_size == null ? '' : String(data.team_size),
          management_layers: data.management_layers ?? '',
          country: data.country ?? '',
          state_region: data.state_region ?? '',
          city: data.city ?? '',
          address: data.address ?? '',
          zip_code: data.zip_code ?? '',
          tshirt_size: data.tshirt_size ?? '',
          dietary_restrictions: data.dietary_restrictions ?? '',
        });
        setTeamsOverseen(data.teams_overseen);
        setRegions(data.regions);
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
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setSaved(false);
  };

  const toggleTeam = (key: TeamKey) => {
    setTeamsOverseen((prev) => ({ ...prev, [key]: !prev[key] }));
    setSaved(false);
  };

  const toggleRegion = (key: RegionKey) => {
    setRegions((prev) => ({ ...prev, [key]: !prev[key] }));
    setSaved(false);
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

    const teamSize = parseTeamSize(form.team_size);
    if (teamSize === 'invalid') {
      setError('Team size must be a whole number.');
      setSaved(false);
      return;
    }

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
        address: form.address.trim() || null,
        zip_code: form.zip_code.trim() || null,
        team_size: teamSize,
        management_layers: form.management_layers || null,
        teams_overseen: teamsOverseen,
        regions,
        tshirt_size: isTshirtSize(form.tshirt_size) ? form.tshirt_size : null,
        dietary_restrictions: form.dietary_restrictions.trim() || null,
      };
      await updateMyProfile(memberId, input);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const openEmploymentForm = (mode: EmploymentAction) => {
    setEmploymentMode(mode);
    setEmploymentForm(mode === 'change' ? emptyEmploymentForm() : employmentFormFromCurrent(currentJob));
    setEmploymentError(null);
    setEmploymentMessage(null);
  };

  const closeEmploymentForm = () => {
    setEmploymentMode(null);
    setEmploymentError(null);
  };

  const handleEmploymentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEmploymentForm((prev) => ({ ...prev, [name]: value }));
    setEmploymentError(null);
  };

  const handleEmploymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberId || !employmentMode) return;

    const problem = validateEmploymentForm(employmentMode, employmentForm, currentJob, today);
    if (problem) {
      setEmploymentError(problem);
      return;
    }

    const previousJob = currentJob;
    setIsSavingEmployment(true);
    setEmploymentError(null);
    setEmploymentMessage(null);
    try {
      const result = await saveMyEmployment(
        memberId,
        employmentMode,
        {
          company: employmentForm.company.trim(),
          role: employmentForm.role.trim(),
          start_date: employmentForm.start_date || null,
        },
        `${form.first_name} ${form.last_name}`,
      );
      setEmploymentHistory(result.history);
      setEmploymentMessage(
        employmentMode === 'change' && previousJob
          ? `Saved. ${jobLabel(result.current)} is now your current job, and ${jobLabel(previousJob)} stays in your career history.`
          : employmentMode === 'change'
            ? `Saved. ${jobLabel(result.current)} is now your current job.`
            : 'Saved. Your current job was corrected without adding a new history entry.',
      );
      setEmploymentMode(null);
    } catch (err) {
      setEmploymentError(err instanceof Error ? err.message : 'Failed to save your employment');
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

  // Keep an older saved value selectable even if it is no longer in the list.
  const seniorityOptions: { value: string; label: string }[] = [...SENIORITY_OPTIONS];
  if (!seniorityOptions.some((opt) => opt.value === form.seniority_level)) {
    seniorityOptions.push({ value: form.seniority_level, label: form.seniority_level });
  }

  const changePreviewEndDate =
    employmentMode === 'change' && currentJob
      ? previousJobEndDate(employmentForm.start_date, currentJob.start_date)
      : null;

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

        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6" aria-labelledby="employment-heading">
          <h2 id="employment-heading" className="mb-1 text-sm font-semibold text-slate-900">Employment</h2>
          <p className="mb-4 text-xs text-slate-500">
            Report a new job or fix your current one. Your previous jobs stay in your career history.
          </p>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Current job</p>
            {currentJob ? (
              <>
                <p className="mt-1 text-sm font-medium text-slate-900">{jobLabel(currentJob)}</p>
                <p className="text-xs text-slate-500">
                  {currentJob.start_date
                    ? `Since ${formatEmploymentDate(currentJob.start_date)}`
                    : 'Start date not listed'}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-slate-500">No current job on file.</p>
            )}
          </div>

          {employmentMessage && (
            <p role="status" className="mt-4 rounded-md bg-sage-tint px-3 py-2 text-sm text-ink">
              {employmentMessage}
            </p>
          )}

          {employmentMode === null ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => openEmploymentForm('change')}
                className="rounded-lg border border-slate-300 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <span className="block font-medium">{currentJob ? 'Changed jobs' : 'Add your current job'}</span>
                <span className="mt-1 block text-xs text-slate-500">
                  {currentJob
                    ? 'Enter your new job. Your current job moves to your history.'
                    : 'Enter the company and title you have now.'}
                </span>
              </button>
              {currentJob && (
                <button
                  type="button"
                  onClick={() => openEmploymentForm('correct')}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <span className="block font-medium">Correct current information</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    Fix a typo or date. This does not add a new job.
                  </span>
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={handleEmploymentSubmit} noValidate className="mt-4 rounded-lg border border-orange/40 p-4">
              <h3 className="text-sm font-semibold text-slate-900">
                {employmentMode === 'change'
                  ? currentJob ? 'Changed jobs' : 'Add your current job'
                  : 'Correct current information'}
              </h3>
              <p className="mb-4 mt-1 text-xs text-slate-500">
                {employmentMode === 'change'
                  ? 'Enter your new job. Your current job will be kept in your career history.'
                  : 'Edit your current job. No new entry is added to your career history.'}
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="employment-company" className={LABEL_CLASS}>
                    {employmentMode === 'change' ? 'New company' : 'Company'}
                  </label>
                  <input
                    id="employment-company"
                    type="text"
                    name="company"
                    value={employmentForm.company}
                    onChange={handleEmploymentChange}
                    maxLength={MAX_EMPLOYMENT_TEXT_LENGTH}
                    required
                    autoComplete="organization"
                    className={INPUT_CLASS}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="employment-role" className={LABEL_CLASS}>
                    {employmentMode === 'change' ? 'New job title' : 'Job title'}
                  </label>
                  <input
                    id="employment-role"
                    type="text"
                    name="role"
                    value={employmentForm.role}
                    onChange={handleEmploymentChange}
                    maxLength={MAX_EMPLOYMENT_TEXT_LENGTH}
                    required
                    autoComplete="organization-title"
                    className={INPUT_CLASS}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="employment-start" className={LABEL_CLASS}>
                    {employmentMode === 'change' ? 'Start date at new job' : 'Start date'}
                  </label>
                  <input
                    id="employment-start"
                    type="date"
                    name="start_date"
                    value={employmentForm.start_date}
                    onChange={handleEmploymentChange}
                    max={today}
                    min={employmentMode === 'change' ? currentJob?.start_date ?? undefined : undefined}
                    required={employmentMode === 'change'}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>

              {changePreviewEndDate && currentJob && (
                <p className="mt-3 text-xs text-slate-600">
                  {jobLabel(currentJob)} will be saved to your history with an end date of{' '}
                  {formatEmploymentDate(changePreviewEndDate)}.
                </p>
              )}

              {employmentError && (
                <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  {employmentError}
                </p>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeEmploymentForm}
                  disabled={isSavingEmployment}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEmployment}
                  className="rounded-md bg-orange px-4 py-2 text-sm font-medium text-white hover:bg-orange-dark disabled:opacity-50"
                >
                  {isSavingEmployment
                    ? 'Saving…'
                    : employmentMode === 'change' ? 'Save new job' : 'Save correction'}
                </button>
              </div>
            </form>
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
                      {formatEmploymentDate(job.start_date, 'Start date not listed')} –{' '}
                      {job.is_current ? 'Present' : formatEmploymentDate(job.end_date, 'End date not listed')}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-slate-500">No employment history recorded.</p>
            )}
          </div>
        </section>

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Personal info</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="first_name" className={LABEL_CLASS}>First name</label>
                <input
                  id="first_name"
                  type="text"
                  name="first_name"
                  value={form.first_name}
                  onChange={handleChange}
                  required
                  className={INPUT_CLASS}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="last_name" className={LABEL_CLASS}>Last name</label>
                <input
                  id="last_name"
                  type="text"
                  name="last_name"
                  value={form.last_name}
                  onChange={handleChange}
                  required
                  className={INPUT_CLASS}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className={LABEL_CLASS}>Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  disabled
                  className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="phone" className={LABEL_CLASS}>Phone</label>
                <input
                  id="phone"
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  className={INPUT_CLASS}
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <label htmlFor="linkedin_url" className={LABEL_CLASS}>LinkedIn URL</label>
                <input
                  id="linkedin_url"
                  type="text"
                  name="linkedin_url"
                  value={form.linkedin_url}
                  onChange={handleChange}
                  placeholder="linkedin.com/in/yourname"
                  className={INPUT_CLASS}
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Professional details</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="seniority_level" className={LABEL_CLASS}>Seniority</label>
                <select
                  id="seniority_level"
                  name="seniority_level"
                  value={form.seniority_level}
                  onChange={handleChange}
                  className={INPUT_CLASS}
                >
                  {seniorityOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="team_size" className={LABEL_CLASS}>Team size</label>
                <input
                  id="team_size"
                  type="number"
                  name="team_size"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={form.team_size}
                  onChange={handleChange}
                  className={INPUT_CLASS}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="management_layers" className={LABEL_CLASS}>Management layers</label>
                <select
                  id="management_layers"
                  name="management_layers"
                  value={form.management_layers}
                  onChange={handleChange}
                  className={INPUT_CLASS}
                >
                  {MANAGEMENT_LAYER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <fieldset className="mt-5">
              <legend className={LABEL_CLASS}>Teams you oversee</legend>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {TEAM_FIELDS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={teamsOverseen[key]}
                      onChange={() => toggleTeam(key)}
                      className="h-4 w-4 rounded border-slate-300 accent-orange"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-5">
              <legend className={LABEL_CLASS}>Regions you cover</legend>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {REGION_FIELDS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={regions[key]}
                      onChange={() => toggleRegion(key)}
                      className="h-4 w-4 rounded border-slate-300 accent-orange"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Location</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5 sm:col-span-3">
                <label htmlFor="address" className={LABEL_CLASS}>Mailing address</label>
                <input
                  id="address"
                  type="text"
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  autoComplete="street-address"
                  className={INPUT_CLASS}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="city" className={LABEL_CLASS}>City</label>
                <input
                  id="city"
                  type="text"
                  name="city"
                  value={form.city}
                  onChange={handleChange}
                  className={INPUT_CLASS}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="state_region" className={LABEL_CLASS}>State / Region</label>
                <input
                  id="state_region"
                  type="text"
                  name="state_region"
                  value={form.state_region}
                  onChange={handleChange}
                  className={INPUT_CLASS}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="zip_code" className={LABEL_CLASS}>ZIP / Postal code</label>
                <input
                  id="zip_code"
                  type="text"
                  name="zip_code"
                  value={form.zip_code}
                  onChange={handleChange}
                  autoComplete="postal-code"
                  className={INPUT_CLASS}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="country" className={LABEL_CLASS}>Country</label>
                <input
                  id="country"
                  type="text"
                  name="country"
                  value={form.country}
                  onChange={handleChange}
                  className={INPUT_CLASS}
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Events</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="tshirt_size" className={LABEL_CLASS}>T-shirt size</label>
                <select
                  id="tshirt_size"
                  name="tshirt_size"
                  value={form.tshirt_size}
                  onChange={handleChange}
                  className={INPUT_CLASS}
                >
                  <option value="">Select size</option>
                  {TSHIRT_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label htmlFor="dietary_restrictions" className={LABEL_CLASS}>Dietary restrictions</label>
                <input
                  id="dietary_restrictions"
                  type="text"
                  name="dietary_restrictions"
                  value={form.dietary_restrictions}
                  onChange={handleChange}
                  placeholder="e.g. vegetarian, nut allergy"
                  className={INPUT_CLASS}
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
