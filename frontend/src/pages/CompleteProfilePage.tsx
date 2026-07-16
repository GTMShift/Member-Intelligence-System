// src/pages/CompleteProfilePage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { createMemberSelf, type SelfSignupInput } from '../api/createMemberSelf';

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

const INITIAL_STATE: FormState = {
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

// Accepts "linkedin.com/in/x", "www.linkedin.com/in/x", or a full
// "https://..." URL, and normalizes any of them to a consistent full URL.
function normalizeLinkedInUrl(input: string): string {
  let url = input.trim();
  if (!url) return url;
  url = url.replace(/^https?:\/\//i, '');
  if (!/^www\./i.test(url)) {
    url = `www.${url}`;
  }
  return `https://${url}`;
}

export function CompleteProfilePage() {
  const navigate = useNavigate();
  const { user, refreshMemberId } = useAuth();
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !user?.email) {
      setError('Something went wrong identifying your account. Try signing out and back in.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const input: SelfSignupInput = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: user.email,
        linkedin_url: normalizeLinkedInUrl(form.linkedin_url),
        phone: form.phone.trim() || null,
        job_title: form.job_title.trim() || null,
        current_job_start_date: form.current_job_start_date || null,
        seniority_level: form.seniority_level || null,
        company_name: form.company_name.trim() || null,
        country: form.country.trim() || null,
        state_region: form.state_region.trim() || null,
        city: form.city.trim() || null,
      };

      await createMemberSelf(input, user.id);
      await refreshMemberId();
      navigate('/portal');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6">
          <h1 className="text-lg font-semibold text-slate-900">
            SolutionExec Member Intelligence Platform
          </h1>
          <p className="text-sm text-slate-500">Complete your profile</p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
        <p className="mb-6 text-sm text-slate-600">
          We couldn't find an existing member record for <strong>{user?.email}</strong>.
          Fill in a few details to get set up.
        </p>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
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
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
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
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Email</label>
                <input
                  type="email"
                  value={user?.email ?? ''}
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
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">
                  LinkedIn URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="linkedin_url"
                  value={form.linkedin_url}
                  onChange={handleChange}
                  required
                  placeholder="linkedin.com/in/yourname"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                />
              </div>
            </div>
          </section>

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
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Seniority</label>
                <select
                  name="seniority_level"
                  value={form.seniority_level}
                  onChange={handleChange}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
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
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Job start date</label>
                <input
                  type="date"
                  name="current_job_start_date"
                  value={form.current_job_start_date}
                  onChange={handleChange}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                />
              </div>
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
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">State / Region</label>
                <input
                  type="text"
                  name="state_region"
                  value={form.state_region}
                  onChange={handleChange}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Country</label>
                <input
                  type="text"
                  name="country"
                  value={form.country}
                  onChange={handleChange}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                />
              </div>
            </div>
          </section>

          <div className="flex justify-end pb-8">
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-slate-900 px-6 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {loading ? 'Saving…' : 'Complete profile'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}