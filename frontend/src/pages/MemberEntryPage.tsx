import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createMember, type CreateMemberInput } from '../api/createMember';
import { createNotification } from '../api/notificationsApi';
import { checkAndFlagDuplicate } from '../api/duplicateFlagsApi';

const BUCKET_OPTIONS = [
  { value: '', label: 'Select a category' },
  { value: 'icp_member', label: 'ICP Member' },
  { value: 'between_roles', label: 'Between Roles' },
  { value: 'adjacent_remit', label: 'Adjacent Remit' },
  { value: 'consultant', label: 'Consultant' },
  { value: 'sponsor', label: 'Sponsor' },
  { value: 'personal_connection', label: 'Personal Connection' },
] as const;

const SENIORITY_OPTIONS = [
  { value: '', label: 'Select seniority' },
  { value: 'C-Suite', label: 'C-Suite' },
  { value: 'VP', label: 'VP' },
  { value: 'Director', label: 'Director' },
  { value: 'Manager', label: 'Manager' },
  { value: 'Individual Contributor', label: 'Individual Contributor' },
] as const;

const ICP_SCORE_BUCKETS = ['icp_member', 'between_roles', 'adjacent_remit', 'consultant'];

type FormState = {
  first_name: string;
  last_name: string;
  email: string;
  linkedin_url: string;
  phone: string;
  job_title: string;
  current_job_start_date: string;
  seniority_level: string;
  company_name: string;
  country: string;
  state_region: string;
  city: string;
  signup_source: 'Website' | 'Luma' | 'Substack' | 'Manual';
  bucket: string;
  fit_score: string;
  tag_note: string;
};

const INITIAL_STATE: FormState = {
  first_name: '',
  last_name: '',
  email: '',
  linkedin_url: '',
  phone: '',
  job_title: '',
  current_job_start_date: '',
  seniority_level: '',
  company_name: '',
  country: '',
  state_region: '',
  city: '',
  signup_source: 'Manual',
  bucket: '',
  fit_score: '',
  tag_note: '',
};

export function MemberEntryPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const showFitScore = ICP_SCORE_BUCKETS.includes(form.bucket);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));

    if (name === 'bucket' && !ICP_SCORE_BUCKETS.includes(value)) {
      setForm((prev) => ({ ...prev, bucket: value, fit_score: '' }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const input: CreateMemberInput = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        linkedin_url: form.linkedin_url.trim(),
        phone: form.phone.trim() || null,
        job_title: form.job_title.trim() || null,
        current_job_start_date: form.current_job_start_date || null,
        seniority_level: form.seniority_level || null,
        company_name: form.company_name.trim() || null,
        country: form.country.trim() || null,
        state_region: form.state_region.trim() || null,
        city: form.city.trim() || null,
        signup_source: form.signup_source,
        bucket: (form.bucket as CreateMemberInput['bucket']) || null,
        fit_score: form.fit_score ? parseInt(form.fit_score, 10) : null,
        tag_note: form.tag_note.trim() || null,
      };

      const created = await createMember(input);

      if (created?.id) {
        await createNotification({
          type: 'new_signup',
          title: 'New member signup',
          body: `${input.first_name} ${input.last_name} was added to the directory by an admin.`,
          member_id: created.id,
          member_name: `${input.first_name} ${input.last_name}`,
        });

        await checkAndFlagDuplicate(created.id, {
          first_name: input.first_name,
          last_name: input.last_name,
          email: input.email,
          linkedin_url: input.linkedin_url || null,
          phone: input.phone,
          current_role: input.job_title,
        });
      }

      setSuccess(true);
      setForm(INITIAL_STATE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="bg-charcoal">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold text-white">
              SolutionExec Member Intelligence Platform
            </h1>
            <p className="text-sm text-white/60">Add new member</p>
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
        {success && (
          <div className="mb-6 rounded-lg border border-sage bg-sage-tint px-4 py-3">
            <p className="text-sm font-medium text-ink">
              Member added successfully.{' '}
              <button
                type="button"
                className="underline"
                onClick={() => setSuccess(false)}
              >
                Add another
              </button>
              {' or '}
              <button
                type="button"
                className="underline"
                onClick={() => navigate('/')}
              >
                go to dashboard
              </button>
              .
            </p>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Personal info */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Personal info</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">
                  First name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="first_name"
                  value={form.first_name}
                  onChange={handleChange}
                  required
                  placeholder="Jane"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-600 focus:border-orange focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">
                  Last name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="last_name"
                  value={form.last_name}
                  onChange={handleChange}
                  required
                  placeholder="Smith"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-600 focus:border-orange focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  required
                  placeholder="jane@company.com"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-600 focus:border-orange focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Phone</label>
                <input
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="+1 312 555 0101"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-600 focus:border-orange focus:outline-none"
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">
                  LinkedIn URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  name="linkedin_url"
                  value={form.linkedin_url}
                  onChange={handleChange}
                  required
                  placeholder="https://linkedin.com/in/janesmith"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-600 focus:border-orange focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* Role & company */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Role & company</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Job title</label>
                <input
                  type="text"
                  name="job_title"
                  value={form.job_title}
                  onChange={handleChange}
                  placeholder="Director of Solutions Engineering"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-600 focus:border-orange focus:outline-none"
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
                  placeholder="Acme Corp"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-600 focus:border-orange focus:outline-none"
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
          </section>

          {/* Location */}
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
                  placeholder="Chicago"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-600 focus:border-orange focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">State / Region</label>
                <input
                  type="text"
                  name="state_region"
                  value={form.state_region}
                  onChange={handleChange}
                  placeholder="Illinois"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-600 focus:border-orange focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Country</label>
                <input
                  type="text"
                  name="country"
                  value={form.country}
                  onChange={handleChange}
                  placeholder="United States"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-600 focus:border-orange focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* ICP classification */}
          <section className="rounded-xl border border-orange/25 bg-orange/5 p-6">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">ICP classification</h2>
            <p className="mb-4 text-xs text-orange-dark">Internal only — members never see this</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Bucket</label>
                <select
                  name="bucket"
                  value={form.bucket}
                  onChange={handleChange}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                >
                  {BUCKET_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {showFitScore && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">
                    Fit score (0–100)
                  </label>
                  <input
                    type="number"
                    name="fit_score"
                    value={form.fit_score}
                    onChange={handleChange}
                    min={0}
                    max={100}
                    placeholder="e.g. 85"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-600 focus:border-orange focus:outline-none"
                  />
                </div>
              )}
              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Tag note</label>
                <textarea
                  name="tag_note"
                  value={form.tag_note}
                  onChange={handleChange}
                  rows={2}
                  placeholder="Optional context, e.g. how this person was connected"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-600 focus:border-orange focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* Signup source */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Signup source</h2>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">Source</label>
              <select
                name="signup_source"
                value={form.signup_source}
                onChange={handleChange}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
              >
                <option value="Manual">Manual</option>
                <option value="Website">Website</option>
                <option value="Luma">Luma</option>
                <option value="Substack">Substack</option>
              </select>
            </div>
          </section>

          {/* Actions */}
          <div className="flex items-center justify-between pb-8">
            <button
              type="button"
              onClick={() => setForm(INITIAL_STATE)}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Clear form
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-orange px-6 py-2 text-sm font-medium text-white hover:bg-orange-dark disabled:opacity-50"
            >
              {loading ? 'Adding member...' : 'Add member'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}