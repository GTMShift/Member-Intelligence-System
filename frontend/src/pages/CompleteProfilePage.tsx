import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { createMemberSelf, type SelfSignupInput } from '../api/createMemberSelf';
 
const SENIORITY_OPTIONS = [
  { value: '', label: 'Select seniority' },
  { value: 'Global VP', label: 'Global VP' },
  { value: 'SVP', label: 'SVP' },
  { value: 'VP', label: 'VP' },
  { value: 'Senior Director', label: 'Senior Director' },
  { value: 'Director', label: 'Director' },
  { value: 'Senior Manager', label: 'Senior Manager' },
  { value: 'Manager', label: 'Manager' },
  { value: 'Team Lead', label: 'Team Lead' },
  { value: 'Senior Individual Contributor', label: 'Senior Individual Contributor' },
  { value: 'Individual Contributor', label: 'Individual Contributor' },
] as const;
 
const MANAGEMENT_LAYER_OPTIONS = [
  { value: '', label: 'Select layers' },
  { value: '1', label: '1 layer' },
  { value: '2', label: '2 layers' },
  { value: '3', label: '3 layers' },
  { value: '4+', label: '4+ layers' },
];
 
const TSHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;
 
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
  { key: 'oversees_other', label: 'Other' },
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
  first_name: string;
  last_name: string;
  linkedin_url: string;
  phone: string;
  job_title: string;
  current_job_start_date: string;
  seniority_level: string;
  company_name: string;
  team_size: string;
  management_layers: string;
  address: string;
  city: string;
  state_region: string;
  zip_code: string;
  country: string;
  tshirt_size: string;
  dietary_restrictions: string;
  oversees_solutions_engineering_consulting: boolean;
  oversees_customer_success: boolean;
  oversees_demo_engineering: boolean;
  oversees_solutions_architecture: boolean;
  oversees_partnerships_channel_se: boolean;
  oversees_value_engineering: boolean;
  oversees_forward_deployed_engineering: boolean;
  oversees_enablement: boolean;
  oversees_professional_services: boolean;
  oversees_implementation_onboarding: boolean;
  oversees_other: boolean;
  oversees_other_text: string;
  region_north_america: boolean;
  region_regional_usa: boolean;
  region_global: boolean;
  region_emea: boolean;
  region_apac: boolean;
  region_latin_america: boolean;
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
  team_size: '',
  management_layers: '',
  address: '',
  city: '',
  state_region: '',
  zip_code: '',
  country: '',
  tshirt_size: '',
  dietary_restrictions: '',
  oversees_solutions_engineering_consulting: false,
  oversees_customer_success: false,
  oversees_demo_engineering: false,
  oversees_solutions_architecture: false,
  oversees_partnerships_channel_se: false,
  oversees_value_engineering: false,
  oversees_forward_deployed_engineering: false,
  oversees_enablement: false,
  oversees_professional_services: false,
  oversees_implementation_onboarding: false,
  oversees_other: false,
  oversees_other_text: '',
  region_north_america: false,
  region_regional_usa: false,
  region_global: false,
  region_emea: false,
  region_apac: false,
  region_latin_america: false,
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
 
export function CompleteProfilePage() {
  const navigate = useNavigate();
  const { user, refreshMemberId } = useAuth();
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
 
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };
 
  const toggleBoolean = (field: TeamKey | RegionKey) => {
    setForm((prev) => ({
      ...prev,
      [field]: !prev[field],
      ...(field === 'oversees_other' && prev.oversees_other
        ? { oversees_other_text: '' }
        : {}),
    }));
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
        team_size: form.team_size ? parseInt(form.team_size, 10) : null,
        management_layers: form.management_layers || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state_region: form.state_region.trim() || null,
        zip_code: form.zip_code.trim() || null,
        country: form.country.trim() || null,
        tshirt_size: form.tshirt_size || null,
        dietary_restrictions: form.dietary_restrictions.trim() || null,
        oversees_solutions_engineering_consulting: form.oversees_solutions_engineering_consulting,
        oversees_customer_success: form.oversees_customer_success,
        oversees_demo_engineering: form.oversees_demo_engineering,
        oversees_solutions_architecture: form.oversees_solutions_architecture,
        oversees_partnerships_channel_se: form.oversees_partnerships_channel_se,
        oversees_value_engineering: form.oversees_value_engineering,
        oversees_forward_deployed_engineering: form.oversees_forward_deployed_engineering,
        oversees_enablement: form.oversees_enablement,
        oversees_professional_services: form.oversees_professional_services,
        oversees_implementation_onboarding: form.oversees_implementation_onboarding,
        oversees_other: form.oversees_other,
        oversees_other_text: form.oversees_other_text.trim() || null,
        region_north_america: form.region_north_america,
        region_regional_usa: form.region_regional_usa,
        region_global: form.region_global,
        region_emea: form.region_emea,
        region_apac: form.region_apac,
        region_latin_america: form.region_latin_america,
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
 
          {/* Section 1 — Personal info */}
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
                  placeholder="+12025551234"
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
 
          {/* Section 2 — Role & company */}
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
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
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
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Team size</label>
                <input
                  type="number"
                  name="team_size"
                  value={form.team_size}
                  onChange={handleChange}
                  min={0}
                  placeholder="e.g. 25"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Management layers</label>
                <select
                  name="management_layers"
                  value={form.management_layers}
                  onChange={handleChange}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                >
                  {MANAGEMENT_LAYER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
 
            {/* Teams */}
            <div className="mt-4 flex flex-col gap-1.5">
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
              {form.oversees_other && (
                <input
                  type="text"
                  name="oversees_other_text"
                  value={form.oversees_other_text}
                  onChange={handleChange}
                  placeholder="Describe the team..."
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
                />
              )}
            </div>
 
            {/* Regions */}
            <div className="mt-4 flex flex-col gap-1.5">
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
          </section>
 
          {/* Section 3 — Personal details */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Personal details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 flex flex-col gap-1.5">
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
              <div className="flex flex-col gap-1.5">
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
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">T-shirt size</label>
                <select
                  name="tshirt_size"
                  value={form.tshirt_size}
                  onChange={handleChange}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                >
                  <option value="">Select size</option>
                  {TSHIRT_SIZES.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
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
 