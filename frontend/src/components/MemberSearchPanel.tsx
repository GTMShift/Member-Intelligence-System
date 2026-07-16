import { useCallback, useEffect, useMemo, useState } from 'react';
import { getFilterOptions, getMetroAreas, searchMembers } from '../api/membersApi';
import type { FilterOptions, MemberSearchParams, MemberSearchResult } from '../types/api';
import { formatTimestamp, fullName } from '../utils/format';

const EMPTY_FILTER_OPTIONS: FilterOptions = {
  states: [],
  industries: [],
  seniorityLevels: [],
  signupSources: [],
  companyTags: [],
  teamSizes: [],
};

interface MemberSearchPanelProps {
  selectedMemberId: string | null;
  onSelectMember: (id: string) => void;
}

const EMPTY_FILTERS: MemberSearchParams = {};

function IcpBadge({ icp }: { icp: MemberSearchResult['icp'] }) {
  if (icp === 'YES') {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
        ICP
      </span>
    );
  }
  if (icp === 'NO') {
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
        Non-ICP
      </span>
    );
  }
  if (icp === 'TBD') {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        TBD
      </span>
    );
  }
  return (
    <span className="rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-400">
      Not classified
    </span>
  );
}

export function MemberSearchPanel({
  selectedMemberId,
  onSelectMember,
}: MemberSearchPanelProps) {
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(EMPTY_FILTER_OPTIONS);
  const [metroAreas, setMetroAreas] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    getFilterOptions()
      .then((options) => {
        if (!cancelled) setFilterOptions(options);
      })
      .catch(() => {
        // Leave filterOptions at the empty defaults if this fails —
        // filters just won't have any choices, but the page still renders.
      });
    getMetroAreas()
      .then((areas) => {
        if (!cancelled) setMetroAreas(areas);
      })
      .catch(() => {
        // Same graceful fallback — an empty metro area dropdown, not a crash.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<MemberSearchParams>(EMPTY_FILTERS);
  const [results, setResults] = useState<MemberSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const PAGE_SIZE = 50;

  const activeFilterCount = useMemo(() => {
    return [
      filters.icp,
      filters.metro_area_name,
      filters.state,
      filters.industry,
      filters.seniority,
      filters.source,
      filters.team_size,
      filters.tag,
    ].filter(Boolean).length;
  }, [filters]);

  const runSearch = useCallback(async (searchQuery: string, searchFilters: MemberSearchParams) => {
    setLoading(true);
    setError(null);

    try {
      const response = await searchMembers({
        q: searchQuery || undefined,
        ...searchFilters,
        page: 1,
        limit: PAGE_SIZE,
      });
      setResults(response.results);
      setTotal(response.total);
      setPage(1);
    } catch {
      setError('Search failed. Please try again.');
      setResults([]);
      setTotal(0);
      setPage(1);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const response = await searchMembers({
        q: query || undefined,
        ...filters,
        page: nextPage,
        limit: PAGE_SIZE,
      });
      setResults((prev) => [...prev, ...response.results]);
      setTotal(response.total);
      setPage(nextPage);
    } catch {
      setError('Failed to load more members. Please try again.');
    } finally {
      setLoadingMore(false);
    }
  }, [page, query, filters]);

  useEffect(() => {
    const timer = setTimeout(() => {
      runSearch(query, filters);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, filters, runSearch]);

  const updateFilter = <K extends keyof MemberSearchParams>(
    key: K,
    value: MemberSearchParams[K] | '',
  ) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (!value) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setQuery('');
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">Member Search</h2>
        <p className="mt-1 text-sm text-slate-500">
          Search by name, company, role, or email
        </p>

        <div className="mt-4">
          <label htmlFor="member-search" className="sr-only">
            Search members
          </label>
          <input
            id="member-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, company, role, or email…"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <FilterSelect
            label="ICP"
            value={filters.icp ?? ''}
            onChange={(v) => updateFilter('icp', v as 'YES' | 'NO' | 'TBD' | 'NONE' | '')}
            options={[
              { value: 'YES', label: 'YES' },
              { value: 'NO', label: 'NO' },
              { value: 'TBD', label: 'TBD' },
              { value: 'NONE', label: 'Not classified' },
            ]}
          />
          <FilterSelect
            label="Metro Area"
            value={filters.metro_area_name ?? ''}
            onChange={(v) => updateFilter('metro_area_name', v)}
            options={metroAreas.map((m) => ({ value: m.name, label: m.name }))}
          />
          <FilterSelect
            label="State"
            value={filters.state ?? ''}
            onChange={(v) => updateFilter('state', v)}
            options={filterOptions.states.map((s) => ({ value: s, label: s }))}
          />
          <FilterSelect
            label="Industry"
            value={filters.industry ?? ''}
            onChange={(v) => updateFilter('industry', v)}
            options={filterOptions.industries.map((i) => ({ value: i, label: i }))}
          />
          <FilterSelect
            label="Seniority"
            value={filters.seniority ?? ''}
            onChange={(v) => updateFilter('seniority', v)}
            options={filterOptions.seniorityLevels.map((s) => ({ value: s, label: s }))}
          />
          <FilterSelect
            label="Signup source"
            value={filters.source ?? ''}
            onChange={(v) => updateFilter('source', v)}
            options={filterOptions.signupSources.map((s) => ({ value: s, label: s }))}
          />
          <FilterSelect
            label="Team Size"
            value={filters.team_size ?? ''}
            onChange={(v) => updateFilter('team_size', v)}
            options={filterOptions.teamSizes.map((s) => ({ value: s, label: s }))}
          />
          <FilterSelect
            label="Tags"
            value={filters.tag ?? ''}
            onChange={(v) => updateFilter('tag', v)}
            options={filterOptions.companyTags.map((t) => ({ value: t, label: t }))}
          />
        </div>

        {(activeFilterCount > 0 || query) && (
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            Clear all filters
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="mb-2 flex items-center justify-between px-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {loading ? 'Searching…' : `${total} member${total === 1 ? '' : 's'}`}
          </p>
        </div>

        {error && (
          <p className="mx-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {!loading && !error && results.length === 0 && (
          <p className="px-2 py-8 text-center text-sm text-slate-500">
            No members match your search criteria.
          </p>
        )}

        <ul className="space-y-1">
          {results.map((member) => {
            const isSelected = member.id === selectedMemberId;
            return (
              <li key={member.id}>
                <button
                  type="button"
                  onClick={() => onSelectMember(member.id)}
                  className={`w-full rounded-lg px-3 py-3 text-left transition-colors ${
                    isSelected
                      ? 'bg-blue-50 ring-1 ring-blue-200'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">
                        {fullName(member.first_name, member.last_name)}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-slate-600">
                        {member.current_role ?? '—'}
                        {member.company_name ? ` · ${member.company_name}` : ''}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {member.metro_area_name ?? '—'}
                      </p>
                    </div>
                    <IcpBadge icp={member.icp} />
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    Updated {formatTimestamp(member.last_updated)}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>

        {!loading && !error && results.length < total && (
          <div className="flex justify-center py-4">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : `Load more (${results.length} of ${total})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  const id = `filter-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}