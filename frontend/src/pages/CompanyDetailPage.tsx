import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { getCompany } from '../api/companiesApi';
import type { CompanyDetail } from '../types/api';
import { formatTimestamp } from '../utils/format';

interface CompanyLocationState {
  fromMemberId?: string;
}

interface ProfileField {
  label: string;
  value: string | null | undefined;
  isLink?: boolean;
}

function FieldGrid({ fields }: { fields: ProfileField[] }) {
  const visible = fields.filter((f) => f.value);
  if (visible.length === 0) {
    return <p className="text-sm text-slate-500">No data available.</p>;
  }

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {visible.map((field) => (
        <div key={field.label} className={field.label === 'Overview' ? 'sm:col-span-2' : undefined}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {field.label}
          </dt>
          <dd className="mt-0.5 text-sm text-slate-900">
            {field.isLink && field.value ? (
              <a
                href={field.value}
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-dark hover:text-orange hover:underline"
              >
                {field.value}
              </a>
            ) : (
              field.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const fromMemberId = (location.state as CompanyLocationState | null)?.fromMemberId;

  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError('Company not found.');
      setLoading(false);
      return;
    }

    const companyId = id;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const data = await getCompany(companyId);
        if (!cancelled) {
          if (!data) {
            setError('Company not found.');
            setCompany(null);
          } else {
            setCompany(data);
          }
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load company.');
          setCompany(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleBack = () => {
    if (fromMemberId) {
      navigate('/', { state: { selectedMemberId: fromMemberId } });
    } else {
      navigate(-1);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-slate-500">Loading company…</p>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <p className="text-sm text-red-600">{error ?? 'Company not found.'}</p>
        <button
          type="button"
          onClick={handleBack}
          className="text-sm font-medium text-orange-dark hover:text-orange"
        >
          ← Back
        </button>
      </div>
    );
  }

  const fields: ProfileField[] = [
    { label: 'LinkedIn URL', value: company.linkedin_url, isLink: true },
    { label: 'Domain', value: company.domain },
    { label: 'Size', value: company.size },
    { label: 'Industry', value: company.industry },
    { label: 'Sub industry', value: company.sub_industry },
    { label: 'Overview', value: company.overview },
    { label: 'Company type', value: company.company_type },
    { label: 'Revenue', value: company.revenue },
    { label: 'Tags', value: company.tags },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b border-slate-200 bg-white px-6 py-5">
        <button
          type="button"
          onClick={handleBack}
          className="mb-3 text-sm font-medium text-orange-dark hover:text-orange"
        >
          ← Back to member profile
        </button>
        <h2 className="text-xl font-semibold text-slate-900">{company.name}</h2>
        <p className="mt-2 text-xs text-slate-400">
          Last updated {formatTimestamp(company.updated_at)}
        </p>
      </div>

      <div className="p-6">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <FieldGrid fields={fields} />
        </section>
      </div>
    </div>
  );
}