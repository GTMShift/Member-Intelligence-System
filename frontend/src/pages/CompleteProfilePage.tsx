import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/authShared';
import { createMemberSelf, type SelfSignupInput } from '../api/createMemberSelf';

const FORM_STORAGE_KEY = 'complete_profile_draft';

const SENIORITY_OPTIONS = [
  { value: '', label: 'Select seniority' },
  { value: 'C-Suite', label: 'C-Suite' },
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

const SOCIAL_PLATFORMS = ['Twitter/X', 'Instagram', 'TikTok', 'YouTube', 'Facebook'] as const;

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

export interface SocialEntry {
  platform: typeof SOCIAL_PLATFORMS[number];
  username: string;
  url?: string;
}

const COUNTRIES = [
  'United States', 'Canada', 'Brazil', 'United Kingdom', 'Germany',
  'France', 'Switzerland', 'Romania', 'Poland', 'United Arab Emirates',
  'India', 'Other',
];

const REGIONS_BY_COUNTRY: Record<string, string[]> = {
  'United States': [
    'Alabama','Alaska','Arizona','Arkansas','California','Colorado',
    'Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho',
    'Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana',
    'Maine','Maryland','Massachusetts','Michigan','Minnesota',
    'Mississippi','Missouri','Montana','Nebraska','Nevada',
    'New Hampshire','New Jersey','New Mexico','New York',
    'North Carolina','North Dakota','Ohio','Oklahoma','Oregon',
    'Pennsylvania','Rhode Island','South Carolina','South Dakota',
    'Tennessee','Texas','Utah','Vermont','Virginia','Washington',
    'West Virginia','Wisconsin','Wyoming',
  ],
  'Canada': [
    'Alberta','British Columbia','Manitoba','New Brunswick',
    'Newfoundland and Labrador','Northwest Territories','Nova Scotia',
    'Nunavut','Ontario','Prince Edward Island','Quebec','Saskatchewan','Yukon',
  ],
  'Brazil': [
    'Acre','Alagoas','Amapá','Amazonas','Bahia','Ceará','Distrito Federal',
    'Espírito Santo','Goiás','Maranhão','Mato Grosso','Mato Grosso do Sul',
    'Minas Gerais','Pará','Paraíba','Paraná','Pernambuco','Piauí',
    'Rio de Janeiro','Rio Grande do Norte','Rio Grande do Sul','Rondônia',
    'Roraima','Santa Catarina','São Paulo','Sergipe','Tocantins',
  ],
  'United Kingdom': ['England','Scotland','Wales','Northern Ireland'],
  'Germany': [
    'Baden-Württemberg','Bavaria','Berlin','Brandenburg','Bremen','Hamburg',
    'Hesse','Lower Saxony','Mecklenburg-Vorpommern','North Rhine-Westphalia',
    'Rhineland-Palatinate','Saarland','Saxony','Saxony-Anhalt',
    'Schleswig-Holstein','Thuringia',
  ],
  'France': [
    'Auvergne-Rhône-Alpes','Bourgogne-Franche-Comté','Bretagne',
    'Centre-Val de Loire','Corse','Grand Est','Hauts-de-France',
    'Île-de-France','Normandie','Nouvelle-Aquitaine','Occitanie',
    "Pays de la Loire","Provence-Alpes-Côte d'Azur",
  ],
  'Switzerland': [
    'Aargau','Appenzell Ausserrhoden','Appenzell Innerrhoden',
    'Basel-Landschaft','Basel-Stadt','Bern','Fribourg','Geneva',
    'Glarus','Graubünden','Jura','Lucerne','Neuchâtel','Nidwalden',
    'Obwalden','Schaffhausen','Schwyz','Solothurn','St. Gallen',
    'Thurgau','Ticino','Uri','Valais','Vaud','Zug','Zürich',
  ],
  'Romania': [
    'Bucharest','Center','North-East','North-West','South',
    'South-East','South-West Oltenia','West',
  ],
  'Poland': [
    'Greater Poland','Holy Cross','Kuyavian-Pomeranian','Lesser Poland',
    'Lodz','Lower Silesian','Lublin','Lubusz','Masovian','Opole',
    'Podkarpackie','Podlaskie','Pomeranian','Silesian',
    'Warmian-Masurian','West Pomeranian',
  ],
  'United Arab Emirates': [
    'Abu Dhabi','Ajman','Dubai','Fujairah','Ras Al Khaimah','Sharjah','Umm Al Quwain',
  ],
  'India': [
    'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh',
    'Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka',
    'Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram',
    'Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana',
    'Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
    'Andaman and Nicobar Islands','Chandigarh',
    'Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir',
    'Ladakh','Lakshadweep','Puducherry',
  ],
};

const POSTAL_CODE_PATTERNS: Record<string, RegExp> = {
  'United States': /^\d{5}(-\d{4})?$/,
  'Canada': /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/,
  'United Kingdom': /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}$/,
};

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
  zip_code: string;
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
  zip_code: '',
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

const EMPTY_SOCIAL: SocialEntry = { platform: 'Twitter/X', username: '', url: '' };

function normalizeLinkedInUrl(input: string): string {
  let url = input.trim();
  if (!url) return url;
  url = url.replace(/^https?:\/\//i, '');
  if (!/^www\./i.test(url)) url = `www.${url}`;
  return `https://${url}`;
}

interface TypeaheadProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  onValidChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: string | null;
}

function Typeahead({ label, value, options, onChange, onValidChange, placeholder, required, error }: TypeaheadProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [valid, setValid] = useState(!!value);
  const filtered = options.filter((o) => o.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="flex flex-col gap-1.5 relative">
      <label className="text-xs font-medium text-slate-600">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setValid(false); setOpen(true); onChange(''); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setTimeout(() => { setOpen(false); if (!valid) { setQuery(''); onChange(''); } }, 150); }}
        placeholder={placeholder}
        autoComplete="off"
        required={required}
        className={`rounded-lg border px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none ${
          query && !valid ? 'border-red-400 focus:border-red-400' : 'border-slate-300 focus:border-slate-500'
        }`}
      />
      {open && query && (
        <ul className="absolute top-full left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtered.length > 0 ? filtered.map((opt) => (
            <li key={opt}>
              <button
                type="button"
                onMouseDown={() => { setQuery(opt); setValid(true); setOpen(false); onChange(opt); onValidChange(opt); }}
                className="w-full px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-50"
              >
                {opt}
              </button>
            </li>
          )) : (
            <li className="px-3 py-2 text-sm text-slate-400">No results</li>
          )}
        </ul>
      )}
      {query && !valid && (
        <p className="text-xs text-red-600">{error ?? 'Please select an option from the list.'}</p>
      )}
    </div>
  );
}

export function CompleteProfilePage() {
  const navigate = useNavigate();
  const { user, refreshMemberId } = useAuth();

  const [form, setForm] = useState<FormState>(() => {
    try {
      const saved = localStorage.getItem(FORM_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as FormState) : INITIAL_STATE;
    } catch {
      return INITIAL_STATE;
    }
  });

  const [socials, setSocials] = useState<SocialEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [regionOtherText, setRegionOtherText] = useState('');
  const [countryOtherText, setCountryOtherText] = useState('');

  useEffect(() => {
    localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(form));
  }, [form]);

  const regionOptions = selectedCountry && selectedCountry !== 'Other'
    ? [...(REGIONS_BY_COUNTRY[selectedCountry] ?? []), 'Other']
    : [];

  const finalCountry = selectedCountry === 'Other' ? countryOtherText.trim() : selectedCountry;
  const finalStateRegion = selectedRegion === 'Other' ? regionOtherText.trim() : selectedRegion;
  const isTier1Country = selectedCountry === 'United States';

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    const nameFields = ['first_name', 'last_name'];
    const normalizedValue = nameFields.includes(name)
      ? value.replace(/\b\w/g, (c) => c.toUpperCase())
      : value;
    setForm((prev) => ({ ...prev, [name]: normalizedValue }));
  };

  const validateZip = async (zip: string) => {
    const trimmedZip = zip.trim();
    if (!isTier1Country) { setZipError(null); return; }
    if (!trimmedZip) { setZipError('Zip/Postal code is required.'); return; }
    const pattern = POSTAL_CODE_PATTERNS[selectedCountry];
    if (pattern && !pattern.test(trimmedZip)) { setZipError(`Invalid format for ${selectedCountry}.`); return; }
    if (selectedCountry === 'United States') {
      try {
        const res = await fetch(`https://api.zippopotam.us/us/${trimmedZip}`);
        if (!res.ok) { setZipError('Zip code not found. Please check and try again.'); return; }
        const data = await res.json();
        const apiState = (data.places?.[0]?.['state'] as string | undefined)?.toLowerCase();
        const apiCity = (data.places?.[0]?.['place name'] as string | undefined)?.toLowerCase();
        const apiStateAbbr = (data['state abbreviation'] as string | undefined)?.toLowerCase();
        const enteredState = finalStateRegion.toLowerCase();
        const enteredCity = form.city.trim().toLowerCase();
        if (apiState && enteredState) {
          const stateMatches = apiState === enteredState || apiStateAbbr === enteredState;
          if (!stateMatches) {
            setZipError(`Zip code ${trimmedZip} is in ${data.places?.[0]?.['state']}, not "${finalStateRegion}". Please check the zip or state.`);
            return;
          }
        }
        if (apiCity && enteredCity) {
          const cityMatches = apiCity.includes(enteredCity) || enteredCity.includes(apiCity);
          if (!cityMatches) {
            setZipError(`Zip code ${trimmedZip} is associated with ${data.places?.[0]?.['place name']}, not "${form.city}". Please check the zip or city.`);
            return;
          }
        }
      } catch { setZipError(null); return; }
    }
    setZipError(null);
  };

  const toggleBoolean = (field: TeamKey | RegionKey) => {
    setForm((prev) => ({
      ...prev,
      [field]: !prev[field],
      ...(field === 'oversees_other' && prev.oversees_other ? { oversees_other_text: '' } : {}),
    }));
  };

  const addSocial = () => setSocials((prev) => [...prev, { ...EMPTY_SOCIAL }]);
  const removeSocial = (index: number) => setSocials((prev) => prev.filter((_, i) => i !== index));
  const updateSocial = (index: number, field: keyof SocialEntry, value: string) => {
    setSocials((prev) => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !user?.email) {
      setError('Something went wrong identifying your account. Try signing out and back in.');
      return;
    }
    if (zipError) { setError('Please fix the zip code before submitting.'); return; }
    if (!finalCountry) { setError('Please select a country.'); return; }
    if (selectedCountry !== 'Other' && regionOptions.length > 0 && !finalStateRegion) {
      setError('Please select a state or region.');
      return;
    }
    if (form.linkedin_url && !form.linkedin_url.includes('linkedin.com')) {
      setError('Please enter a valid LinkedIn URL.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const input: SelfSignupInput = {
        first_name: form.first_name.trim().replace(/\b\w/g, (c) => c.toUpperCase()),
        last_name: form.last_name.trim().replace(/\b\w/g, (c) => c.toUpperCase()),
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
        state_region: finalStateRegion || null,
        zip_code: form.zip_code.trim() || null,
        country: finalCountry || null,
        tshirt_size: form.tshirt_size || null,
        dietary_restrictions: form.dietary_restrictions.trim() || null,
        socials: socials.filter((s) => s.username.trim() !== ''),
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
      localStorage.removeItem(FORM_STORAGE_KEY);
      await refreshMemberId();
      navigate('/portal', { state: { justCreated: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="bg-charcoal">
        <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6">
          <h1 className="text-lg font-semibold text-white">
            SolutionExec Member Intelligence Platform
          </h1>
          <p className="text-sm text-white/60">Complete your profile</p>
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
                <label className="text-xs font-medium text-slate-600">Email</label>
                <input
                  type="email"
                  value={user?.email ?? ''}
                  disabled
                  className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
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
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-600 focus:border-orange focus:outline-none"
                />
                <span className="text-xs text-slate-400">Format: +12025551234</span>
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
                  placeholder="https://linkedin.com/in/yourname"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-600 focus:border-orange focus:outline-none"
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Organizational Details</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">
                    Company <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="company_name"
                    value={form.company_name}
                    onChange={handleChange}
                    required
                    placeholder="Acme Corp"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-600 focus:border-orange focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">
                    Team size <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="team_size"
                    value={form.team_size}
                    onChange={handleChange}
                    required
                    min={0}
                    placeholder="e.g. 25"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-600 focus:border-orange focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">
                    Current role / Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="job_title"
                    value={form.job_title}
                    onChange={handleChange}
                    required
                    placeholder="Director of Solutions Engineering"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-600 focus:border-orange focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">
                    Seniority level <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="seniority_level"
                    value={form.seniority_level}
                    onChange={handleChange}
                    required
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                  >
                    {SENIORITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">
                    Start date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    name="current_job_start_date"
                    value={form.current_job_start_date}
                    onChange={handleChange}
                    required
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">
                    Management layers <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="management_layers"
                    value={form.management_layers}
                    onChange={handleChange}
                    required
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                  >
                    {MANAGEMENT_LAYER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">
                  Teams you oversee <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {TEAM_FIELDS.map((team) => (
                    <button
                      key={team.key}
                      type="button"
                      onClick={() => toggleBoolean(team.key)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        form[team.key]
                          ? 'border-orange bg-orange text-white'
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
                    className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-600 focus:border-orange focus:outline-none"
                  />
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">
                  Regions <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {REGION_FIELDS.map((region) => (
                    <button
                      key={region.key}
                      type="button"
                      onClick={() => toggleBoolean(region.key)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        form[region.key]
                          ? 'border-orange bg-orange text-white'
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

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Personal Details</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">
                    Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={form.address}
                    onChange={handleChange}
                    required
                    placeholder="123 Main St"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-600 focus:border-orange focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">
                    City <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="city"
                    value={form.city}
                    onChange={handleChange}
                    required
                    placeholder="Chicago"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-600 focus:border-orange focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">
                    Zip / Postal code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="zip_code"
                    value={form.zip_code}
                    onChange={handleChange}
                    onBlur={(e) => validateZip(e.target.value)}
                    required
                    placeholder="60601"
                    className={`rounded-lg border px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none ${
                      zipError ? 'border-red-400 focus:border-red-400' : 'border-slate-300 focus:border-slate-500'
                    }`}
                  />
                  {zipError && <p className="text-xs text-red-600">{zipError}</p>}
                </div>

                <div className="col-span-2">
                  <Typeahead
                    label="Country"
                    value={selectedCountry}
                    options={COUNTRIES}
                    placeholder="United States"
                    required
                    onChange={(val) => {
                      if (val !== selectedCountry) { setSelectedRegion(''); setRegionOtherText(''); }
                      setSelectedCountry(val);
                    }}
                    onValidChange={(val) => { setSelectedCountry(val); setSelectedRegion(''); setRegionOtherText(''); }}
                    error="Please select a country from the list."
                  />
                </div>

                {selectedCountry === 'Other' && (
                  <div className="col-span-2 flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-600">
                      Country name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={countryOtherText}
                      onChange={(e) => setCountryOtherText(e.target.value)}
                      required
                      placeholder="Enter country"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
                    />
                  </div>
                )}

                {selectedCountry && selectedCountry !== 'Other' && regionOptions.length > 0 && (
                  <div className="col-span-2">
                    <Typeahead
                      label="State / Region"
                      value={selectedRegion}
                      options={regionOptions}
                      placeholder={selectedCountry === 'United States' ? 'Illinois' : 'Select region'}
                      required
                      onChange={(val) => { setSelectedRegion(val); if (val === 'Other') setRegionOtherText(''); }}
                      onValidChange={(val) => { setSelectedRegion(val); }}
                      error="Please select a region from the list."
                    />
                  </div>
                )}

                {selectedRegion === 'Other' && (
                  <div className="col-span-2 flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-600">
                      Region name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={regionOtherText}
                      onChange={(e) => setRegionOtherText(e.target.value)}
                      required
                      placeholder="Enter region"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
                    />
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">
                    T-shirt size <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="tshirt_size"
                    value={form.tshirt_size}
                    onChange={handleChange}
                    required
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
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
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-600 focus:border-orange focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-slate-600">Social media</label>
                {socials.map((social, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <select
                      value={social.platform}
                      onChange={(e) => updateSocial(index, 'platform', e.target.value)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                    >
                      {SOCIAL_PLATFORMS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={social.username}
                      onChange={(e) => updateSocial(index, 'username', e.target.value)}
                      placeholder="Username"
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-600 focus:border-orange focus:outline-none"
                    />
                    <input
                      type="url"
                      value={social.url ?? ''}
                      onChange={(e) => updateSocial(index, 'url', e.target.value)}
                      placeholder="URL (optional)"
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-600 focus:border-orange focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeSocial(index)}
                      className="rounded-md border border-red-200 px-2 py-2 text-xs text-red-500 hover:bg-red-50"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addSocial}
                  className="mt-1 self-start rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  + Add social media
                </button>
              </div>
            </div>
          </section>

          <div className="flex justify-end pb-8">
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-orange px-6 py-2 text-sm font-medium text-white hover:bg-orange-dark disabled:opacity-50"
            >
              {loading ? 'Saving…' : 'Complete profile'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}