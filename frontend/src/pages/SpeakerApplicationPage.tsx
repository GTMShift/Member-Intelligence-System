import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { createNotification } from '../api/notificationsApi';

const SPEAKING_INTERESTS = ['Roundtable', 'OTR', 'Other'] as const;

const SPEAKING_EXPERIENCE_OPTIONS = [
  { value: '', label: 'Select experience level' },
  { value: 'Often', label: 'Often' },
  { value: 'Occasionally', label: 'Occasionally' },
  { value: 'Rarely', label: 'Rarely' },
  { value: 'Never', label: 'Never' },
];

const TEAM_OPTIONS = [
  { key: 'Solutions Engineering/Consulting', label: 'Solutions Engineering / Consulting' },
  { key: 'Customer Success', label: 'Customer Success' },
  { key: 'Demo Engineering', label: 'Demo Engineering' },
  { key: 'Solutions Architecture', label: 'Solutions Architecture' },
  { key: 'Partnerships / Channel SE', label: 'Partnerships / Channel SE' },
  { key: 'Value Engineering', label: 'Value Engineering' },
  { key: 'Forward Deployed Engineering', label: 'Forward Deployed Engineering' },
  { key: 'Enablement', label: 'Enablement' },
  { key: 'Professional Services', label: 'Professional Services' },
  { key: 'Implementation / Onboarding', label: 'Implementation / Onboarding' },
  { key: 'Other', label: 'Other' },
];

interface MemberProfile {
  first_name: string;
  last_name: string;
  email: string;
  linkedin_url: string;
  city: string | null;
  state_region: string | null;
  member_id: string;
}

type FormState = {
  bio: string;
  speaking_interests: string[];
  speaking_experience: string;
  speaking_topics: string;
  teams_that_benefit: string[];
  teams_that_benefit_other_text: string;
  requires_company_approval: boolean;
  other_comments: string;
};

const INITIAL_FORM: FormState = {
  bio: '',
  speaking_interests: [],
  speaking_experience: '',
  speaking_topics: '',
  teams_that_benefit: [],
  teams_that_benefit_other_text: '',
  requires_company_approval: false,
  other_comments: '',
};

export function SpeakerApplicationPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: member, error: memberError } = await supabase
          .from('members')
          .select('id, first_name, last_name, email, linkedin_url')
          .eq('email', user.email)
          .single();

        if (memberError || !member) {
          setError('Could not find your member profile. Please contact support.');
          return;
        }

        const { data: memberProfile } = await supabase
          .from('member_profile')
          .select('city, state_region')
          .eq('member_id', member.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();

        setProfile({
          first_name: member.first_name,
          last_name: member.last_name,
          email: member.email,
          linkedin_url: member.linkedin_url,
          city: memberProfile?.city ?? null,
          state_region: memberProfile?.state_region ?? null,
          member_id: member.id,
        });
      } catch (err) {
        setError('Failed to load your profile.');
      } finally {
        setProfileLoading(false);
      }
    }

    void loadProfile();
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const toggleInterest = (value: string) => {
    setForm((prev) => ({
      ...prev,
      speaking_interests: prev.speaking_interests.includes(value)
        ? prev.speaking_interests.filter((v) => v !== value)
        : [...prev.speaking_interests, value],
    }));
  };

  const toggleTeam = (value: string) => {
    setForm((prev) => {
      const isSelected = prev.teams_that_benefit.includes(value);
      return {
        ...prev,
        teams_that_benefit: isSelected
          ? prev.teams_that_benefit.filter((v) => v !== value)
          : [...prev.teams_that_benefit, value],
        // Clear other text if deselecting Other
        teams_that_benefit_other_text:
          value === 'Other' && isSelected ? '' : prev.teams_that_benefit_other_text,
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setLoading(true);
    setError(null);

    // Build the final teams array — if Other is selected and they typed
    // something, replace the plain 'Other' entry with 'Other: <their text>'
    const teamsWithOther = form.teams_that_benefit.map((t) => {
      if (t === 'Other' && form.teams_that_benefit_other_text.trim()) {
        return `Other: ${form.teams_that_benefit_other_text.trim()}`;
      }
      return t;
    });

    try {
      const { error: submitError } = await supabase
        .from('speaker_applications')
        .insert({
          member_id: profile.member_id,
          bio: form.bio.trim(),
          speaking_interest: form.speaking_interests,
          speaking_experience: form.speaking_experience || null,
          speaking_topics: form.speaking_topics.trim() || null,
          teams_that_benefit: teamsWithOther,
          requires_company_approval: form.requires_company_approval,
          other_comments: form.other_comments.trim() || null,
          status: 'pending',
          submitted_at: new Date().toISOString(),
        });

      if (submitError) throw new Error(submitError.message);
      
      await createNotification({
        type: 'speaker_application',
        title: 'New speaker application',
        body: `${profile.first_name} ${profile.last_name} has submitted a speaker application.`,
        member_id: profile.member_id,
        member_name: `${profile.first_name} ${profile.last_name}`,
      });

      setSuccess(true);
      setForm(INITIAL_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Loading your profile...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              SolutionExec Member Intelligence Platform
            </h1>
            <p className="text-sm text-slate-500">Speaker application</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/portal')}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ← Back to portal
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
        {success && (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
            <p className="text-sm font-medium text-green-800">
              Application submitted successfully. We'll be in touch soon.{' '}
              <button
                type="button"
                className="underline"
                onClick={() => navigate('/portal')}
              >
                Back to portal
              </button>
            </p>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Auto-filled profile info */}
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-6">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">Your info</h2>
            <p className="mb-4 text-xs text-slate-500">Auto-filled from your member profile</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">Name</label>
                <p className="text-sm text-slate-900">
                  {profile?.first_name} {profile?.last_name}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">Email</label>
                <p className="text-sm text-slate-900">{profile?.email}</p>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">LinkedIn</label>
                <p className="text-sm text-slate-900">{profile?.linkedin_url ?? '—'}</p>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">Location</label>
                <p className="text-sm text-slate-900">
                  {[profile?.city, profile?.state_region].filter(Boolean).join(', ') || '—'}
                </p>
              </div>
            </div>
          </section>

          {/* Speaking details */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Speaking details</h2>
            <div className="space-y-4">

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">
                  Bio / About you <span className="text-red-500">*</span>
                </label>
                <textarea
                  name="bio"
                  value={form.bio}
                  onChange={handleChange}
                  required
                  rows={4}
                  placeholder="Tell us about yourself and your background..."
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">
                  Interested in speaking at <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {SPEAKING_INTERESTS.map((interest) => (
                    <button
                      key={interest}
                      type="button"
                      onClick={() => toggleInterest(interest)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        form.speaking_interests.includes(interest)
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      {interest}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">
                  Public speaking experience <span className="text-red-500">*</span>
                </label>
                <select
                  name="speaking_experience"
                  value={form.speaking_experience}
                  onChange={handleChange}
                  required
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                >
                  {SPEAKING_EXPERIENCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">
                  What would you like to speak about? <span className="text-red-500">*</span>
                </label>
                <textarea
                  name="speaking_topics"
                  value={form.speaking_topics}
                  onChange={handleChange}
                  required
                  rows={3}
                  placeholder="Topics, themes, or specific talks you'd like to give..."
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">
                  Which teams would benefit from this?
                </label>
                <div className="flex flex-wrap gap-2">
                  {TEAM_OPTIONS.map((team) => (
                    <button
                      key={team.key}
                      type="button"
                      onClick={() => toggleTeam(team.key)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        form.teams_that_benefit.includes(team.key)
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      {team.label}
                    </button>
                  ))}
                </div>
                {form.teams_that_benefit.includes('Other') && (
                  <input
                    type="text"
                    name="teams_that_benefit_other_text"
                    value={form.teams_that_benefit_other_text}
                    onChange={handleChange}
                    placeholder="Describe the team..."
                    className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
                  />
                )}
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="requires_company_approval"
                  checked={form.requires_company_approval}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      requires_company_approval: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />
                <label
                  htmlFor="requires_company_approval"
                  className="text-sm text-slate-700"
                >
                  This requires company approval before I can commit
                </label>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Other comments</label>
                <textarea
                  name="other_comments"
                  value={form.other_comments}
                  onChange={handleChange}
                  rows={2}
                  placeholder="Anything else you'd like us to know..."
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>

            </div>
          </section>

          {/* Actions */}
          <div className="flex items-center justify-between pb-8">
            <button
              type="button"
              onClick={() => setForm(INITIAL_FORM)}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Clear form
            </button>
            <button
              type="submit"
              disabled={loading || !profile}
              className="rounded-md bg-slate-900 px-6 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {loading ? 'Submitting...' : 'Submit application'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}