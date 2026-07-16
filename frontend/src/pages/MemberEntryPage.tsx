import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createMember, type CreateMemberInput } from '../api/createMember';
 
const TEAM_OPTIONS = [
  'Solutions Engineering/Consulting',
  'Customer Success',
  'Demo engineering',
  'Solutions Architecture',
  'Partnerships / Channel SE',
  'Value Engineering',
  'Forward Deployed Engineering',
  'Enablement',
  'Professional Services',
  'Implementation / Onboarding',
];
 
const REGION_OPTIONS = [
  'North America',
  'Regional USA',
  'Global',
  'EMEA',
  'APAC',
  'Latin America',
];
 
const BUCKET_OPTIONS = [
  { value: '', label: 'Select a category' },
  { value: 'icp_member', label: 'ICP Member' },
  { value: 'between_roles', label: 'Between Roles' },
  { value: 'adjacent_remit', label: 'Adjacent Remit' },
  { value: 'consultant', label: 'Consultant' },
  { value: 'sponsor', label: 'Sponsor' },
  { value: 'personal_connection', label: 'Personal Connection' },
];
 
const ICP_SCORE_BUCKETS = ['icp_member', 'between_roles', 'adjacent_remit', 'consultant'];
 
type FormState = {
  // Section 1
  first_name: string;
  last_name: string;
  email: string;
  linkedin_url: string;
  phone: string;
  // Section 2
  city: string;
  state_region: string;
  zip_code: string;
  address: string;
  country: string;
  // Section 3
  teams_you_oversee: string[];
  regions: string[];
  dietary_restrictions: string;
  event_interest: string;
  management_layers: string;
  // Section 4
  bucket: string;
  fit_score: string;
  tag_note: string;
  // Section 5
  current_company: string;
  current_role: string;
  current_start_date: string;
};
 
const INITIAL_STATE: FormState = {
  first_name: '',
  last_name: '',
  email: '',
  linkedin_url: '',
  phone: '',
  city: '',
  state_region: '',
  zip_code: '',
  address: '',
  country: '',
  teams_you_oversee: [],
  regions: [],
  dietary_restrictions: '',
  event_interest: '',
  management_layers: '',
  bucket: '',
  fit_score: '',
  tag_note: '',
  current_company: '',
  current_role: '',
  current_start_date: '',
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
    if (name === 'bucket' && !ICP_SCORE_BUCKETS.includes(value)) {
      setForm((prev) => ({ ...prev, bucket: value, fit_score: '' }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };
 
  const toggleMultiSelect = (field: 'teams_you_oversee' | 'regions', value: string) => {
    setForm((prev) => {
      const current = prev[field];
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [field]: updated };
    });
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
        city: form.city.trim() || null,
        state_region: form.state_region.trim() || null,
        zip_code: form.zip_code.trim() || null,
        address: form.address.trim() || null,
        country: form.country.trim() || null,
        teams_you_oversee: form.teams_you_oversee,
        regions: form.regions,
        dietary_restrictions: form.dietary_restrictions.trim() || null,
        event_interest: form.event_interest.trim() || null,
        management_layers: form.management_layers.trim() || null,
        bucket: (form.bucket as CreateMemberInput['bucket']) || null,
        fit_score: form.fit_score ? parseInt(form.fit_score, 10) : null,
        tag_note: form.tag_note.trim() || null,
        current_company: form.current_company.trim() || null,
        current_role: form.current_role.trim() || null,
        current_start_date: form.current_start_date || null,
      };
 
      await createMember(input);
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
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              SolutionExec Member Intelligence Platform
            </h1>
            <p className="text-sm text-slate-500">Add new member</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ← Back to dashboard
          </button>
        </div>
      </header>
 
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
        {success && (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
            <p className="text-sm font-medium text-green-800">
              Member added successfully.{' '}
              <button type="button" className="underline" onClick={() => setSuccess(false)}>
                Add another
              </button>
              {' or '}
              <button type="button" className="underline" onClick={() => navigate('/')}>
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
 
          {/* Section 1 — Basic Information */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Profile Information</h2>
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
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
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
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
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
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">Phone <span className="text-red-500">*</span></label>
                <input
                    type="tel"
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    required
                    placeholder="+12025551234"
                    pattern="^\+[1-9]\d{1,14}$"
                    title="Phone number must be in E.164 format e.g. +12025551234"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
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
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>
            </div>
          </section>
 
          {/* Section 2 — Location */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Location</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Address</label>
                <input
                  type="text"
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  placeholder="123 Main St"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">City</label>
                <input
                  type="text"
                  name="city"
                  value={form.city}
                  onChange={handleChange}
                  placeholder="Chicago"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
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
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Zip code</label>
                <input
                  type="text"
                  name="zip_code"
                  value={form.zip_code}
                  onChange={handleChange}
                  placeholder="60601"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Country</label>
                <input
                  type="text"
                  name="country"
                  value={form.country}
                  onChange={handleChange}
                  placeholder="United States"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>
            </div>
          </section>
 
          {/* Section 3 — Event info */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Event info</h2>
            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Teams you oversee</label>
                <div className="flex flex-wrap gap-2">
                  {TEAM_OPTIONS.map((team) => (
                    <button
                      key={team}
                      type="button"
                      onClick={() => toggleMultiSelect('teams_you_oversee', team)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        form.teams_you_oversee.includes(team)
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      {team}
                    </button>
                  ))}
                </div>
              </div>
 
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Regions</label>
                <div className="flex flex-wrap gap-2">
                  {REGION_OPTIONS.map((region) => (
                    <button
                      key={region}
                      type="button"
                      onClick={() => toggleMultiSelect('regions', region)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        form.regions.includes(region)
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      {region}
                    </button>
                  ))}
                </div>
              </div>
 
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">Dietary restrictions</label>
                  <input
                    type="text"
                    name="dietary_restrictions"
                    value={form.dietary_restrictions}
                    onChange={handleChange}
                    placeholder="e.g. Vegetarian, Gluten free"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">Management layers</label>
                  <input
                    type="text"
                    name="management_layers"
                    value={form.management_layers}
                    onChange={handleChange}
                    placeholder="e.g. 2 layers"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
                  />
                </div>
                <div className="col-span-2 flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">Event interest</label>
                  <input
                    type="text"
                    name="event_interest"
                    value={form.event_interest}
                    onChange={handleChange}
                    placeholder="What is one thing you want to get out of this event?"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </section>
 
          {/* Section 4 — ICP classification */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">ICP classification</h2>
            <p className="mb-4 text-xs text-slate-500">Internal only — members never see this</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Bucket</label>
                <select
                  name="bucket"
                  value={form.bucket}
                  onChange={handleChange}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
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
                  <label className="text-xs font-medium text-slate-600">Fit score (0–100)</label>
                  <input
                    type="number"
                    name="fit_score"
                    value={form.fit_score}
                    onChange={handleChange}
                    min={0}
                    max={100}
                    placeholder="e.g. 85"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
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
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>
            </div>
          </section>
 
          {/* Section 5 — Current role */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">Current role</h2>
            <p className="mb-4 text-xs text-slate-500">Saved as current employment — historical roles added separately</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Company</label>
                <input
                  type="text"
                  name="current_company"
                  value={form.current_company}
                  onChange={handleChange}
                  placeholder="Acme Corp"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Role / Title</label>
                <input
                  type="text"
                  name="current_role"
                  value={form.current_role}
                  onChange={handleChange}
                  placeholder="Director of Solutions Engineering"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Start date</label>
                <input
                  type="date"
                  name="current_start_date"
                  value={form.current_start_date}
                  onChange={handleChange}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                />
              </div>
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
              className="rounded-md bg-slate-900 px-6 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {loading ? 'Adding member...' : 'Add member'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}