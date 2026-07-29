import { useMemo, useState } from 'react';
import { createNotification } from '../api/notificationsApi';
import { supabase } from '../lib/supabaseClient';
import type { EnrichmentResult, MemberDetail } from '../types/api';
import { formatEnrichmentStartDate } from '../utils/enrichment';
import { fullName } from '../utils/format';

interface EnrichmentReviewPanelProps {
  memberId: string;
  existingMember: MemberDetail;
  enrichedData: EnrichmentResult;
  onClose: () => void;
  onApplied: () => void;
}

type ReviewFieldKey =
  | 'work_email'
  | 'phone'
  | 'job_title'
  | 'seniority'
  | 'job_start'
  | 'company'
  | 'location';

interface ReviewField {
  key: ReviewFieldKey;
  label: string;
  currentValue: string | null;
  enrichedValue: string;
}

function formatLocation(city: string | null, stateRegion: string | null): string | null {
  const parts = [city, stateRegion].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

function buildReviewFields(
  existingMember: MemberDetail,
  enrichedData: EnrichmentResult,
): ReviewField[] {
  const contact = enrichedData.contact;
  const position = contact?.profile?.position;
  const currentRole =
    existingMember.employment_history.find((entry) => entry.is_current)?.role ?? null;
  const currentStart =
    existingMember.employment_history.find((entry) => entry.is_current)?.start_date ??
    existingMember.profile.current_job_start_date;
  const fields: ReviewField[] = [];

  if (contact?.most_probable_email) {
    fields.push({
      key: 'work_email',
      label: 'Work email',
      currentValue: existingMember.profile.work_email_enriched,
      enrichedValue: contact.most_probable_email,
    });
  }

  if (contact?.most_probable_phone) {
    fields.push({
      key: 'phone',
      label: 'Phone',
      currentValue: existingMember.phone,
      enrichedValue: contact.most_probable_phone,
    });
  }

  if (position?.title) {
    fields.push({
      key: 'job_title',
      label: 'Job title',
      currentValue: currentRole,
      enrichedValue: position.title,
    });
  }

  if (position?.seniority) {
    fields.push({
      key: 'seniority',
      label: 'Seniority level',
      currentValue: existingMember.profile.seniority_level,
      enrichedValue: position.seniority,
    });
  }

  const jobStart = formatEnrichmentStartDate(position?.start_at);
  if (jobStart) {
    fields.push({
      key: 'job_start',
      label: 'Job start date',
      currentValue: currentStart,
      enrichedValue: jobStart,
    });
  }

  if (position?.company?.name) {
    fields.push({
      key: 'company',
      label: 'Company',
      currentValue: existingMember.profile.company_name,
      enrichedValue: position.company.name,
    });
  }

  if (contact?.profile?.location) {
    fields.push({
      key: 'location',
      label: 'Location',
      currentValue: formatLocation(
        existingMember.profile.city,
        existingMember.profile.state_region,
      ),
      enrichedValue: contact.profile.location,
    });
  }

  return fields;
}

function parseLocation(location: string): { city: string | null; state_region: string | null } {
  const parts = location.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      city: parts[0] ?? null,
      state_region: parts.slice(1).join(', ') || null,
    };
  }
  return { city: location.trim() || null, state_region: null };
}

async function findOrCreateCompany(companyName: string): Promise<string> {
  const name = companyName.trim();
  const { data: matches, error: findErr } = await supabase
    .from('companies')
    .select('id')
    .ilike('name', name)
    .limit(1);
  if (findErr) throw new Error(`Company lookup failed: ${findErr.message}`);
  if (matches && matches.length > 0) return matches[0].id;

  const { data: created, error: createErr } = await supabase
    .from('companies')
    .insert({ name })
    .select('id')
    .single();
  if (createErr) throw new Error(`Failed to create company: ${createErr.message}`);
  return created.id;
}

export function EnrichmentReviewPanel({
  memberId,
  existingMember,
  enrichedData,
  onClose,
  onApplied,
}: EnrichmentReviewPanelProps) {
  const fields = useMemo(
    () => buildReviewFields(existingMember, enrichedData),
    [existingMember, enrichedData],
  );
  const [accepted, setAccepted] = useState<Record<ReviewFieldKey, boolean>>({
    work_email: false,
    phone: false,
    job_title: false,
    seniority: false,
    job_start: false,
    company: false,
    location: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleField = (key: ReviewFieldKey) => {
    setAccepted((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const acceptAll = () => {
    const next = { ...accepted };
    for (const field of fields) {
      next[field.key] = true;
    }
    setAccepted(next);
  };

  const applySelected = async () => {
    const selected = fields.filter((field) => accepted[field.key]);
    if (selected.length === 0) {
      setError('Select at least one field to apply.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const profileUpdates: Record<string, string | null> = {};
      const memberUpdates: Record<string, string | null> = {};
      let companyNameToApply: string | null = null;
      let jobTitleToApply: string | null = null;
      let jobStartToApply: string | null = null;

      for (const field of selected) {
        if (field.key === 'work_email') {
          profileUpdates.work_email_enriched = field.enrichedValue;
        }

        if (field.key === 'phone') {
          memberUpdates.phone = field.enrichedValue;
        }

        if (field.key === 'location') {
          const parsed = parseLocation(field.enrichedValue);
          profileUpdates.city = parsed.city;
          profileUpdates.state_region = parsed.state_region;
        }

        if (field.key === 'seniority') {
          profileUpdates.seniority_level = field.enrichedValue;
        }

        if (field.key === 'job_start') {
          jobStartToApply = field.enrichedValue;
          profileUpdates.current_job_start_date = field.enrichedValue;
        }

        if (field.key === 'job_title') {
          jobTitleToApply = field.enrichedValue;
        }

        if (field.key === 'company') {
          companyNameToApply = field.enrichedValue;
        }
      }

      if (companyNameToApply) {
        profileUpdates.company_id = await findOrCreateCompany(companyNameToApply);
      }

      if (Object.keys(profileUpdates).length > 0) {
        const { error: profileError } = await supabase
          .from('member_profile')
          .update({
            ...profileUpdates,
            updated_at: new Date().toISOString(),
          })
          .eq('member_id', memberId);

        if (profileError) {
          throw new Error(profileError.message);
        }
      }

      if (jobTitleToApply || companyNameToApply || jobStartToApply) {
        const currentRole =
          existingMember.employment_history.find((entry) => entry.is_current)?.role ?? null;
        const { data: existingCurrent, error: currentLookupError } = await supabase
          .from('employment_history')
          .select('id')
          .eq('member_id', memberId)
          .eq('is_current', true)
          .maybeSingle();

        if (currentLookupError) {
          throw new Error(currentLookupError.message);
        }

        if (existingCurrent) {
          const employmentUpdates: Record<string, string> = {};
          if (jobTitleToApply) employmentUpdates.role = jobTitleToApply;
          if (companyNameToApply) employmentUpdates.company = companyNameToApply;
          if (jobStartToApply) employmentUpdates.start_date = jobStartToApply;

          const { error: employmentError } = await supabase
            .from('employment_history')
            .update(employmentUpdates)
            .eq('id', existingCurrent.id);

          if (employmentError) {
            throw new Error(employmentError.message);
          }
        } else {
          const { error: employmentError } = await supabase.from('employment_history').insert({
            member_id: memberId,
            company:
              companyNameToApply ?? existingMember.profile.company_name ?? 'Unknown',
            role: jobTitleToApply ?? currentRole,
            start_date: jobStartToApply,
            is_current: true,
            source: 'Manual',
          });

          if (employmentError) {
            throw new Error(employmentError.message);
          }
        }
      }

      const { error: memberError } = await supabase
        .from('members')
        .update({
          ...memberUpdates,
          last_updated: new Date().toISOString(),
        })
        .eq('id', memberId);

      if (memberError) {
        throw new Error(memberError.message);
      }

      const memberName = fullName(existingMember.first_name, existingMember.last_name);
      const appliedSummary = selected
        .map((field) => `${field.label}: ${field.enrichedValue}`)
        .join('; ');
      await createNotification({
        type: 'enrichment_complete',
        title: 'Enrichment applied',
        body: `${memberName}: applied ${selected.length} field${selected.length === 1 ? '' : 's'} — ${appliedSummary}.`,
        member_id: memberId,
        member_name: memberName,
      });

      onApplied();
    } catch (applyError) {
      const message =
        applyError instanceof Error ? applyError.message : 'Failed to apply enrichment fields.';
      setError(message);
      const memberName = fullName(existingMember.first_name, existingMember.last_name);
      await createNotification({
        type: 'enrichment_failed',
        title: 'Enrichment apply failed',
        body: `${memberName}: could not apply enrichment updates. ${message}`,
        member_id: memberId,
        member_name: memberName,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="enrichment-review-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 id="enrichment-review-title" className="text-lg font-semibold text-slate-900">
            Review enrichment results
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Accept only the fields you want to update. Manual values stay unless you select them.
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          {fields.length === 0 ? (
            <p className="text-sm text-slate-500">
              FullEnrich returned no new profile fields to review.
            </p>
          ) : (
            fields.map((field) => (
              <label
                key={field.key}
                className="flex cursor-pointer gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4"
              >
                <input
                  type="checkbox"
                  checked={accepted[field.key]}
                  onChange={() => toggleField(field.key)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{field.label}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Current
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        {field.currentValue || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                        From FullEnrich
                      </p>
                      <p className="mt-1 text-sm font-medium text-slate-900">
                        {field.enrichedValue}
                      </p>
                    </div>
                  </div>
                </div>
              </label>
            ))
          )}

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={acceptAll}
            disabled={saving || fields.length === 0}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Accept All
          </button>
          <button
            type="button"
            onClick={applySelected}
            disabled={saving || fields.length === 0}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? 'Applying…' : 'Apply Selected'}
          </button>
        </div>
      </div>
    </div>
  );
}
