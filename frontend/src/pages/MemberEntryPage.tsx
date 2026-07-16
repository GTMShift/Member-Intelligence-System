import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createMember, type CreateMemberInput } from '../api/createMember';
import { createNotification } from '../api/notificationsApi';
import { checkAndFlagDuplicate } from '../api/duplicateFlagsApi';

const BUCKET_OPTIONS = [
    { value: '', label: 'Select a category' },
    { value: 'primary_icp', label: 'Primary ICP' },
    { value: 'secondary_icp', label: 'Secondary ICP' },
    { value: 'watchlist', label: 'Watchlist' },
    { value: 'between_jobs', label: 'Between Jobs' },
    { value: 'consultant', label: 'Consultant' },
    { value: 'partner_sponsor', label: 'Partner / Sponsor' },
    { value: 'icp_no', label: 'ICP No' },
    { value: 'manual_review', label: 'Manual Review' },
];
  
const ICP_SCORE_BUCKETS = ['primary_icp', 'secondary_icp'];

 
const TEAM_FIELDS = [
  { key: 'oversees_solutions_engineering_consulting', label: 'Solutions Engineering / Consulting' },
  { key: 'oversees_customer_success', label: 'Customer Success' },
  { key: 'oversees_demo_engineering', label: 'Demo Engineering' },
  { key: 'oversees_solutions_architecture', label: 'Solutions Architecture' },
  { key: 'oversees_partnerships_channel_se', label: 'Partnerships / Channel SE' },
  { key: 'oversees_value_engineering', label: 'Value Engineering' },
  { key: 'oversees_forward_deployed_engineering', label: 'Forward Deployed Engineering' },
  { key: 'oversees_enablement', label: 'Enablement' },
  { key: 'oversees_professional_services', label: 'Professional Services' },
  { key: 'oversees_implementation_onboarding', label: 'Implementation / Onboarding' },
] as const;
 
const REGION_FIELDS = [
  { key: 'region_north_america', label: 'North America' },
  { key: 'region_regional_usa', label: 'Regional USA' },
  { key: 'region_global', label: 'Global' },
  { key: 'region_emea', label: 'EMEA' },
  { key: 'region_apac', label: 'APAC' },
  { key: 'region_latin_america', label: 'Latin America' },
] as const;
 
type TeamKey = typeof TEAM_FIELDS[number]['key'];
type RegionKey = typeof REGION_FIELDS[number]['key'];
 
type FormState = {
  // Section 1
  first_name: string;
  last_name: string;
  email: string;
  linkedin_url: string;
  phone: string;
  // Section 2 - Org details
  team_size: string;
  company_name: string;
  current_role: string;
  current_start_date: string;
  management_layers: string;
  event_interest: string;
  // Teams
  oversees_customer_success: boolean;
  oversees_demo_engineering: boolean;
  oversees_enablement: boolean;
  oversees_forward_deployed_engineering: boolean;
  oversees_implementation_onboarding: boolean;
  oversees_partnerships_channel_se: boolean;
  oversees_professional_services: boolean;
  oversees_solutions_architecture: boolean;
  oversees_solutions_engineering_consulting: boolean;
  oversees_value_engineering: boolean;
  // Regions
  region_north_america: boolean;
  region_regional_usa: boolean;
  region_global: boolean;
  region_emea: boolean;
  region_apac: boolean;
  region_latin_america: boolean;
  // Section 3
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
  team_size: '',
  company_name: '',
  current_role: '',
  current_start_date: '',
  management_layers: '',
  event_interest: '',
  oversees_customer_success: false,
  oversees_demo_engineering: false,
  oversees_enablement: false,
  oversees_forward_deployed_engineering: false,
  oversees_implementation_onboarding: false,
  oversees_partnerships_channel_se: false,
  oversees_professional_services: false,
  oversees_solutions_architecture: false,
  oversees_solutions_engineering_consulting: false,
  oversees_value_engineering: false,
  region_north_america: false,
  region_regional_usa: false,
  region_global: false,
  region_emea: false,
  region_apac: false,
  region_latin_america: false,
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
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };
 
  const toggleBoolean = (field: TeamKey | RegionKey) => {
    setForm((prev) => ({ ...prev, [field]: !prev[field] }));
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
        team_size: form.team_size ? parseInt(form.team_size, 10) : null,
        company_name: form.company_name.trim() || null,
        current_role: form.current_role.trim() || null,
        current_start_date: form.current_start_date || null,
        management_layers: form.management_layers.trim() || null,
        event_interest: form.event_interest.trim() || null,
        oversees_customer_success: form.oversees_customer_success,
        oversees_demo_engineering: form.oversees_demo_engineering,
        oversees_enablement: form.oversees_enablement,
        oversees_forward_deployed_engineering: form.oversees_forward_deployed_engineering,
        oversees_implementation_onboarding: form.oversees_implementation_onboarding,
        oversees_partnerships_channel_se: form.oversees_partnerships_channel_se,
        oversees_professional_services: form.oversees_professional_services,
        oversees_solutions_architecture: form.oversees_solutions_architecture,
        oversees_solutions_engineering_consulting: form.oversees_solutions_engineering_consulting,
        oversees_value_engineering: form.oversees_value_engineering,
        region_north_america: form.region_north_america,
        region_regional_usa: form.region_regional_usa,
        region_global: form.region_global,
        region_emea: form.region_emea,
        region_apac: form.region_apac,
        region_latin_america: form.region_latin_america,
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
          current_role: input.current_role,
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
 
          {/* Section 1 — Profile Information */}
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
                <label className="text-xs font-medium text-slate-600">
                  Phone <span className="text-red-500">*</span>
                </label>
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
                <span className="text-xs text-slate-400">Format: +12025551234</span>
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
 
          {/* Section 2 — Organizational Details */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Organizational Details</h2>
            <div className="space-y-4">
 
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">Company</label>
                  <input
                    type="text"
                    name="company_name"
                    value={form.company_name}
                    onChange={handleChange}
                    placeholder="Acme Corp"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">Team size</label>
                  <input
                    type="number"
                    name="team_size"
                    value={form.team_size}
                    onChange={handleChange}
                    min={0}
                    placeholder="e.g. 25"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">Current role / Title</label>
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
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">Event interest</label>
                  <input
                    type="text"
                    name="event_interest"
                    value={form.event_interest}
                    onChange={handleChange}
                    placeholder="What do you want to get out of this event?"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
                  />
                </div>
              </div>
 
              {/* Teams */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Teams you oversee</label>
                <div className="flex flex-wrap gap-2">
                  {TEAM_FIELDS.map((team) => (
                    <button
                      key={team.key}
                      type="button"
                      onClick={() => toggleBoolean(team.key)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        form[team.key]
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      {team.label}
                    </button>
                  ))}
                </div>
              </div>
 
              {/* Regions */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Regions</label>
                <div className="flex flex-wrap gap-2">
                  {REGION_FIELDS.map((region) => (
                    <button
                      key={region.key}
                      type="button"
                      onClick={() => toggleBoolean(region.key)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        form[region.key]
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      {region.label}
                    </button>
                  ))}
                </div>
              </div>
 
            </div>
          </section>
 
          {/* Section 3 — ICP Classification */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">ICP Classification</h2>
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
 