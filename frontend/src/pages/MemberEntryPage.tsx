import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createMember, type CreateMemberInput, type SocialEntry } from '../api/createMember';
import { getMember } from '../api/membersApi';
import { useAuth } from '../context/authShared';
import type { EnrichmentResult, MemberDetail } from '../types/api';
import { EnrichmentReviewPanel } from '../components/EnrichmentReviewPanel';

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

const SOCIAL_PLATFORMS = ['Twitter/X', 'Instagram', 'TikTok', 'YouTube', 'Facebook'] as const;

const TSHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;

const MANAGEMENT_LAYER_OPTIONS = [
  { value: '', label: 'Select layers' },
  { value: '1', label: '1 layer' },
  { value: '2', label: '2 layers' },
  { value: '3', label: '3 layers' },
  { value: '4+', label: '4+ layers' },
];

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

// ---- Country + region data --------------------------------------------------

const COUNTRIES = [
  'United States',
  'Canada',
  'Brazil',
  'United Kingdom',
  'Germany',
  'France',
  'Switzerland',
  'Romania',
  'Poland',
  'United Arab Emirates',
  'India',
  'Other',
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
    'Nunavut','Ontario','Prince Edward Island','Quebec','Saskatchewan',
    'Yukon',
  ],
  'Brazil': [
    'Acre','Alagoas','Amapá','Amazonas','Bahia','Ceará',
    'Distrito Federal','Espírito Santo','Goiás','Maranhão',
    'Mato Grosso','Mato Grosso do Sul','Minas Gerais','Pará',
    'Paraíba','Paraná','Pernambuco','Piauí','Rio de Janeiro',
    'Rio Grande do Norte','Rio Grande do Sul','Rondônia','Roraima',
    'Santa Catarina','São Paulo','Sergipe','Tocantins',
  ],
  'United Kingdom': [
    'England','Scotland','Wales','Northern Ireland',
  ],
  'Germany': [
    'Baden-Württemberg','Bavaria','Berlin','Brandenburg','Bremen',
    'Hamburg','Hesse','Lower Saxony','Mecklenburg-Vorpommern',
    'North Rhine-Westphalia','Rhineland-Palatinate','Saarland',
    'Saxony','Saxony-Anhalt','Schleswig-Holstein','Thuringia',
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
    'Bucharest','Center','North-East','North-West','South','South-East',
    'South-West Oltenia','West',
  ],
  'Poland': [
    'Greater Poland','Holy Cross','Kuyavian-Pomeranian','Lesser Poland',
    'Lodz','Lower Silesian','Lublin','Lubusz','Masovian',
    'Opole','Podkarpackie','Podlaskie','Pomeranian','Silesian',
    'Warmian-Masurian','West Pomeranian',
  ],
  'United Arab Emirates': [
    'Abu Dhabi','Ajman','Dubai','Fujairah','Ras Al Khaimah',
    'Sharjah','Umm Al Quwain',
  ],
  'India': [
    'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh',
    'Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand',
    'Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur',
    'Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan',
    'Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh',
    'Uttarakhand','West Bengal',
    // Union territories
    'Andaman and Nicobar Islands','Chandigarh',
    'Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir',
    'Ladakh','Lakshadweep','Puducherry',
  ],
};

const TIER_1_COUNTRIES = [
  'United States',
  'Canada',
  'United Kingdom',
  'Germany',
  'France',
  'Switzerland',
];


const POSTAL_CODE_PATTERNS: Record<string, RegExp> = {
  'United States': /^\d{5}(-\d{4})?$/, // 12345 or 12345-6789
  'Canada': /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/, // A1A 1A1
  'United Kingdom': /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i, // SW1A 1AA
  'Germany': /^\d{5}$/, // 5 digits
  'France': /^\d{5}$/, // 5 digits
  'Switzerland': /^\d{4}$/, // 4 digits
};

// ---- Form state -------------------------------------------------------------

type FormState = {
  first_name: string;
  last_name: string;
  email: string;
  linkedin_url: string;
  phone: string;
  team_size: string;
  company_name: string;
  current_role: string;
  seniority_level: string;
  current_start_date: string;
  management_layers: string;
  event_interest: string;
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
  oversees_other: boolean;
  oversees_other_text: string;
  region_north_america: boolean;
  region_regional_usa: boolean;
  region_global: boolean;
  region_emea: boolean;
  region_apac: boolean;
  region_latin_america: boolean;
  address: string;
  city: string;
  state_region: string;
  zip_code: string;
  country: string;
  tshirt_size: string;
  dietary_restrictions: string;
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
  seniority_level: '',
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
  oversees_other: false,
  oversees_other_text: '',
  region_north_america: false,
  region_regional_usa: false,
  region_global: false,
  region_emea: false,
  region_apac: false,
  region_latin_america: false,
  address: '',
  city: '',
  state_region: '',
  zip_code: '',
  country: '',
  tshirt_size: '',
  dietary_restrictions: '',
  bucket: '',
  fit_score: '',
  tag_note: '',
};

const EMPTY_SOCIAL: SocialEntry = { platform: 'Twitter/X', username: '', url: '' };

// ---- Typeahead component ----------------------------------------------------

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

function Typeahead({
  label,
  value,
  options,
  onChange,
  onValidChange,
  placeholder,
  required,
  error,
}: TypeaheadProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [valid, setValid] = useState(!!value);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-1.5 relative">
      <label className="text-xs font-medium text-slate-600">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setValid(false);
          setOpen(true);
          onChange('');
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => {
            setOpen(false);
            if (!valid) {
              setQuery('');
              onChange('');
            }
          }, 150);
        }}
        placeholder={placeholder}
        autoComplete="off"
        required={required}
        className={`rounded-lg border px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none ${
          query && !valid
            ? 'border-red-400 focus:border-red-400'
            : 'border-slate-300 focus:border-slate-500'
        }`}
      />
      {open && query && (
        <ul className="absolute top-full left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtered.length > 0 ? (
            filtered.map((opt) => (
              <li key={opt}>
                <button
                  type="button"
                  onMouseDown={() => {
                    setQuery(opt);
                    setValid(true);
                    setOpen(false);
                    onChange(opt);
                    onValidChange(opt);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-50"
                >
                  {opt}
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-sm text-slate-400">No results</li>
          )}
        </ul>
      )}
      {query && !valid && (
        <p className="text-xs text-red-600">
          {error ?? 'Please select an option from the list.'}
        </p>
      )}
    </div>
  );
}

// ---- Main page --------------------------------------------------------------

export function MemberEntryPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [socials, setSocials] = useState<SocialEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [createdMemberId, setCreatedMemberId] = useState<string | null>(null);
  const [showEnrichPrompt, setShowEnrichPrompt] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [enrichmentResult, setEnrichmentResult] = useState<EnrichmentResult | null>(null);
  const [createdMember, setCreatedMember] = useState<MemberDetail | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);

  // Country / region picker state
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [regionOtherText, setRegionOtherText] = useState('');
  const [countryOtherText, setCountryOtherText] = useState('');

  const isTier1Country = TIER_1_COUNTRIES.includes(selectedCountry);

  const showFitScore = ICP_SCORE_BUCKETS.includes(form.bucket);

  const regionOptions = selectedCountry && selectedCountry !== 'Other'
    ? [...(REGIONS_BY_COUNTRY[selectedCountry] ?? []), 'Other']
    : [];

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    const nameFields = ['first_name', 'last_name'];
    const normalizedValue = nameFields.includes(name)
      ? value.replace(/\b\w/g, (c) => c.toUpperCase())
      : value;
    setForm((prev) => ({ ...prev, [name]: normalizedValue }));
    if (name === 'bucket' && !ICP_SCORE_BUCKETS.includes(value)) {
      setForm((prev) => ({ ...prev, bucket: value, fit_score: '' }));
    }
  };

  const validateZip = async (zip: string) => {
    const trimmedZip = zip.trim();
  
    // Tier 2 & Tier 3: Skip validation entirely & clear errors
    if (!isTier1Country) {
      setZipError(null);
      return;
    }
  
    // Tier 1: Required check
    if (!trimmedZip) {
      setZipError('Zip/Postal code is required.');
      return;
    }
  
    // Tier 1: Light Format Regex Check
    const pattern = POSTAL_CODE_PATTERNS[selectedCountry];
    if (pattern && !pattern.test(trimmedZip)) {
      setZipError(`Invalid format for ${selectedCountry}.`);
      return;
    }
  
    // Tier 1: Optional Light Existence API Check (US only example)
    if (selectedCountry === 'United States') {
      try {
        const res = await fetch(`https://api.zippopotam.us/us/${trimmedZip}`);
        if (!res.ok) {
          setZipError('Zip code not found. Please check and try again.');
          return;
        }
      } catch {
        // On network failure, clear error so the user isn't stuck
        setZipError(null);
        return;
      }
    }
  
    // If everything passes
    setZipError(null);
  };

  const toggleBoolean = (field: TeamKey | RegionKey) => {
    setForm((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const addSocial = () => {
    setSocials((prev) => [...prev, { ...EMPTY_SOCIAL }]);
  };

  const removeSocial = (index: number) => {
    setSocials((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSocial = (index: number, field: keyof SocialEntry, value: string) => {
    setSocials((prev) => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  // Derive final country and state_region for submission
  const finalCountry = selectedCountry === 'Other' ? countryOtherText.trim() : selectedCountry;
  const finalStateRegion = selectedRegion === 'Other' ? regionOtherText.trim() : selectedRegion;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (zipError) {
      setError('Please fix the zip code before submitting.');
      setLoading(false);
      return;
    }
    if (!finalCountry) {
      setError('Please select a country.');
      setLoading(false);
      return;
    }
    if (selectedCountry !== 'Other' && regionOptions.length > 0 && !finalStateRegion) {
      setError('Please select a state or region.');
      setLoading(false);
      return;
    }

    try {
      const input: CreateMemberInput = {
        first_name: form.first_name.trim().replace(/\b\w/g, (c) => c.toUpperCase()),
        last_name: form.last_name.trim().replace(/\b\w/g, (c) => c.toUpperCase()),
        email: form.email.trim(),
        linkedin_url: form.linkedin_url.trim(),
        phone: form.phone.trim() || null,
        team_size: form.team_size ? parseInt(form.team_size, 10) : null,
        company_name: form.company_name.trim() || null,
        current_role: form.current_role.trim() || null,
        seniority_level: form.seniority_level || null,
        current_start_date: form.current_start_date || null,
        management_layers: form.management_layers || null,
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
        oversees_other: form.oversees_other,
        oversees_other_text: form.oversees_other_text.trim() || null,
        region_north_america: form.region_north_america,
        region_regional_usa: form.region_regional_usa,
        region_global: form.region_global,
        region_emea: form.region_emea,
        region_apac: form.region_apac,
        region_latin_america: form.region_latin_america,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state_region: finalStateRegion || null,
        zip_code: form.zip_code.trim() || null,
        country: finalCountry || null,
        tshirt_size: (form.tshirt_size as CreateMemberInput['tshirt_size']) || null,
        dietary_restrictions: form.dietary_restrictions.trim() || null,
        socials: socials.filter((s) => s.username.trim() !== ''),
        bucket: (form.bucket as CreateMemberInput['bucket']) || null,
        fit_score: form.fit_score ? parseInt(form.fit_score, 10) : null,
        tag_note: form.tag_note.trim() || null,
      };

      const created = await createMember(input);

      if (created?.id) {
        setSuccess(true);
        setForm(INITIAL_STATE);
        setSocials([]);
        setSelectedCountry('');
        setSelectedRegion('');
        setRegionOtherText('');
        setCountryOtherText('');
        setCreatedMemberId(created.id);
        setEnrichError(null);
        setEnrichmentResult(null);
        setCreatedMember(null);
        if (isAdmin) {
          setShowEnrichPrompt(true);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleSkipEnrich = () => {
    setShowEnrichPrompt(false);
    setEnrichError(null);
    navigate('/');
  };

  const handleEnrichNow = async () => {
    if (!createdMemberId) return;

    setEnriching(true);
    setEnrichError(null);

    try {
      const startResponse = await fetch(
        `http://localhost:3000/members/${createdMemberId}/enrich`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ run_type: 'initial' }),
        },
      );

      if (!startResponse.ok) {
        throw new Error('Failed to start enrichment');
      }

      const startData = await startResponse.json();
      const enrichmentId = startData.enrichment_id as string | undefined;
      if (!enrichmentId) {
        throw new Error('No enrichment_id returned');
      }

      const pollIntervalMs = 5_000;
      const maxAttempts = 36;
      let finishedResult: EnrichmentResult | null = null;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

        const statusResponse = await fetch(
          `http://localhost:3000/enrich/status/${enrichmentId}`,
        );
        if (!statusResponse.ok) {
          throw new Error('Failed to fetch enrichment status');
        }

        const pollingResponse = await statusResponse.json();
        if (pollingResponse.status === 'FINISHED') {
          finishedResult = {
            enrichment_id: enrichmentId,
            status: pollingResponse.status,
            contact: pollingResponse.datas?.[0]?.contact ?? null,
          };
          break;
        }
      }

      if (!finishedResult) {
        setEnrichError('Enrichment is taking longer than expected — you can try again later from the member profile.');
        return;
      }

      const memberDetail = await getMember(createdMemberId, 'admin');
      if (!memberDetail) {
        setEnrichError('Member was created, but their profile could not be loaded for review.');
        return;
      }

      setCreatedMember(memberDetail);
      setEnrichmentResult(finishedResult);
      setShowEnrichPrompt(false);
    } catch {
      setEnrichError('Enrichment failed — please try again later from the member profile.');
    } finally {
      setEnriching(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface">
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

          {/* Section 2 — Organizational Details */}
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
                    name="current_role"
                    value={form.current_role}
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
                    <option value="">Select seniority</option>
                    <option value="Global VP">Global VP</option>
                    <option value="SVP">SVP</option>
                    <option value="VP">VP</option>
                    <option value="Senior Director">Senior Director</option>
                    <option value="Director">Director</option>
                    <option value="Senior Manager">Senior Manager</option>
                    <option value="Manager">Manager</option>
                    <option value="Team Lead">Team Lead</option>
                    <option value="Senior Individual Contributor">Senior Individual Contributor</option>
                    <option value="Individual Contributor">Individual Contributor</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">
                    Start date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    name="current_start_date"
                    value={form.current_start_date}
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
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">Event interest</label>
                  <input
                    type="text"
                    name="event_interest"
                    value={form.event_interest}
                    onChange={handleChange}
                    placeholder="What do you want to get out of this event?"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-600 focus:border-orange focus:outline-none"
                  />
                </div>
              </div>

              {/* Teams */}
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

              {/* Regions */}
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

          {/* Section 3 — Personal Details */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Personal Details</h2>
            <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              
              {/* 1. Country Typeahead (Full Row) */}
              <div className="col-span-2">
                <Typeahead
                  label="Country"
                  value={selectedCountry}
                  options={COUNTRIES}
                  placeholder="United States"
                  required
                  onChange={(val) => {
                    if (val !== selectedCountry) {
                      setSelectedRegion('');
                      setRegionOtherText('');
                      setForm((prev) => ({ ...prev, state_region: '', country: val }));
                    }
                    setSelectedCountry(val);
                  }}
                  onValidChange={(val) => {
                    setSelectedCountry(val);
                    setSelectedRegion('');
                    setRegionOtherText('');
                    setForm((prev) => ({ ...prev, state_region: '', country: val }));
                  }}
                  error="Please select a country from the list."
                />
              </div>

              {/* Other country free text (Full Row) */}
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

              {/* 2. State / Region (Full Row, only shows after Country is selected) */}
              {selectedCountry && selectedCountry !== 'Other' && regionOptions.length > 0 && (
                <div className="col-span-2">
                  <Typeahead
                    label="State / Region"
                    value={selectedRegion}
                    options={regionOptions}
                    placeholder={selectedCountry === 'United States' ? 'Illinois' : 'Select region'}
                    required
                    onChange={(val) => {
                      setSelectedRegion(val);
                      if (val !== 'Other') {
                        setRegionOtherText('');
                        setForm((prev) => ({ ...prev, state_region: val }));
                      } else {
                        setForm((prev) => ({ ...prev, state_region: '' }));
                      }
                    }}
                    onValidChange={(val) => {
                      setSelectedRegion(val);
                      if (val !== 'Other') {
                        setForm((prev) => ({ ...prev, state_region: val }));
                      }
                    }}
                    error="Please select a region from the list."
                  />
                </div>
              )}

              {/* Other region free text (Full Row) */}
              {selectedRegion === 'Other' && (
                <div className="col-span-2 flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">
                    Region name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={regionOtherText}
                    onChange={(e) => {
                      setRegionOtherText(e.target.value);
                      setForm((prev) => ({ ...prev, state_region: e.target.value }));
                    }}
                    required
                    placeholder="Enter region"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
                  />
                </div>
              )}
              {/* 3. City (Half Row - Left) */}
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

              {/* 4. Zip code (Half Row - Right) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">
                  Zip/Postal code {isTier1Country && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  name="zip_code"
                  value={form.zip_code}
                  onChange={handleChange}
                  onBlur={(e) => validateZip(e.target.value)}
                  required={isTier1Country} // Only required for Tier 1!
                  placeholder={
                    selectedCountry === 'United States'
                      ? '60601'
                      : isTier1Country
                      ? 'Postal code'
                      : 'Postal code (optional)'
                  }
                  className={`rounded-lg border px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none ${
                    zipError
                      ? 'border-red-400 focus:border-red-400'
                      : 'border-slate-300 focus:border-slate-500'
                  }`}
                />
                {zipError && <p className="text-xs text-red-600">{zipError}</p>}
              </div>

              {/* 5. Address (Full Row - Bottom) */}
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

              {/* Social media */}
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

          {/* Section 4 — ICP Classification */}
          <section className="rounded-xl border border-orange/25 bg-orange/5 p-6">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">ICP Classification</h2>
            <p className="mb-4 text-xs text-orange-dark">Internal only — members never see this</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">
                  Bucket <span className="text-red-500">*</span>
                </label>
                <select
                  name="bucket"
                  value={form.bucket}
                  onChange={handleChange}
                  required
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
                  <label className="text-xs font-medium text-slate-600">Fit score (0–100)</label>
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

          {/* Actions */}
          <div className="flex items-center justify-between pb-8">
            <button
              type="button"
              onClick={() => {
                setForm(INITIAL_STATE);
                setSocials([]);
                setSelectedCountry('');
                setSelectedRegion('');
                setRegionOtherText('');
                setCountryOtherText('');
              }}
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

      {isAdmin && showEnrichPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="enrich-prompt-title"
            className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <h2 id="enrich-prompt-title" className="text-lg font-semibold text-slate-900">
              Member added successfully!
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Would you like to enrich their profile with data from FullEnrich? This will
              automatically fill in company details, job title, location, and employment history.
            </p>

            {enrichError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-sm text-red-700">{enrichError}</p>
                <button
                  type="button"
                  onClick={() => setEnrichError(null)}
                  className="mt-2 text-xs font-medium text-red-700 underline hover:text-red-900"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={handleSkipEnrich}
                disabled={enriching}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={handleEnrichNow}
                disabled={enriching}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {enriching ? 'Enriching…' : 'Enrich now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {enrichmentResult && createdMember && createdMemberId && (
        <EnrichmentReviewPanel
          memberId={createdMemberId}
          existingMember={createdMember}
          enrichedData={enrichmentResult}
          onClose={() => {
            setEnrichmentResult(null);
            setCreatedMember(null);
            navigate('/');
          }}
          onApplied={() => {
            setEnrichmentResult(null);
            setCreatedMember(null);
            navigate('/', { state: { selectedMemberId: createdMemberId } });
          }}
        />
      )}
    </div>
  );
}