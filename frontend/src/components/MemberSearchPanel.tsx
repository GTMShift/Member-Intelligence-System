import { useCallback, useEffect, useMemo, useState } from 'react';
import { getFilterOptions, getMetroAreas, searchMembers } from '../api/membersApi';
import type { FilterOptions, MemberSearchParams, MemberSearchResult, MemberSortOption } from '../types/api';
import { formatTimestamp, fullName } from '../utils/format';

const EMPTY_FILTER_OPTIONS: FilterOptions = {
  states: [],
  industries: [],
  seniorityLevels: [],
  signupSources: [],
  companyTags: [],
  teamSizes: [],
  countries: [],
};

const SORT_OPTIONS: { value: MemberSortOption; label: string }[] = [
  { value: 'last_name_asc', label: 'Last name (A-Z)' },
  { value: 'last_name_desc', label: 'Last name (Z-A)' },
  { value: 'first_name_asc', label: 'First name (A-Z)' },
  { value: 'first_name_desc', label: 'First name (Z-A)' },
  { value: 'signup_newest', label: 'Newest signup' },
  { value: 'signup_oldest', label: 'Oldest signup' },
  { value: 'updated_newest', label: 'Recently updated' },
  { value: 'updated_oldest', label: 'Least recently updated' },
];

interface MemberSearchPanelProps {
  selectedMemberId: string | null;
  onSelectMember: (id: string) => void;
}

const EMPTY_FILTERS: MemberSearchParams = {};

// Tags that should be merged into a single filter option.
// Any tag in MERGED_INTO_OTR_BA will be hidden from the dropdown and its
// results folded into OTR-BA-2026 when OTR-BA-2026 is selected.
const MERGED_INTO_OTR_BA = new Set(['OTR-SC-2026']);

// ---- Bucket badge -----------------------------------------------------------
const BUCKET_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  primary_icp: {
    bg: 'bg-orange',
    text: 'text-white',
    label: 'Primary ICP',
  },
  secondary_icp: {
    bg: 'bg-orange/20 border border-orange/30',
    text: 'text-orange-dark',
    label: 'Secondary ICP',
  },
  watchlist: {
    bg: 'bg-sage-tint border border-sage/30',
    text: 'text-sage',
    label: 'Watchlist',
  },
  between_jobs: {
    bg: 'bg-sage-tint',
    text: 'text-sage',
    label: 'Between Jobs',
  },
  consultant: {
    bg: 'bg-charcoal/10 border border-charcoal/20',
    text: 'text-white',
    label: 'Consultant',
  },
  partner_sponsor: {
    bg: 'bg-charcoal',
    text: 'text-white',
    label: 'Partner / Sponsor',
  },
  manual_review: {
    bg: 'bg-orange/10 border border-orange/20',
    text: 'text-orange-dark',
    label: 'Manual Review',
  },
  icp_no: {
    bg: 'bg-charcoal/10 border border-charcoal/20',
    text: 'text-white/60',
    label: 'Non-ICP',
  },
};

function IcpBucketBadge({ bucket }: { bucket: string | null | undefined }) {
  if (!bucket) {
    return (
      <span className="shrink-0 whitespace-nowrap rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/70">
        Unclassified
      </span>
    );
  }
  const style = BUCKET_STYLES[bucket];
  if (!style) {
    return (
      <span className="shrink-0 whitespace-nowrap rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/70">
        {bucket}
      </span>
    );
  }
  return (
    <span
      className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${style.bg} ${style.text}`}
    >
      {style.label}
    </span>
  );
}

// Runs searchMembers for a tag and all tags merged into it in parallel,
// then de-duplicates by member id and sums the totals.
// Fetches the primary tag with normal pagination, and fetches ALL members from
// secondary/merged tags in a single high-limit call (they are small groups).
// This means secondary tag members are fully loaded on the first search, so
// "Load more" only ever needs to paginate the primary tag — no dual-pagination
// complexity, no getting stuck.
async function searchWithMergedTags(
  baseParams: MemberSearchParams,
  primaryTag: string,
  mergedTags: Set<string>,
): Promise<{ results: MemberSearchResult[]; total: number }> {
  const [primaryResponse, ...secondaryResponses] = await Promise.all([
    searchMembers({ ...baseParams, tag: primaryTag }),
    ...[...mergedTags].map((t) =>
      searchMembers({ ...baseParams, tag: t, page: 1, limit: 1000 }),
    ),
  ]);

  const seen = new Set<string>();
  const results: MemberSearchResult[] = [];
  for (const member of primaryResponse.results) {
    if (!seen.has(member.id)) { seen.add(member.id); results.push(member); }
  }
  for (const response of secondaryResponses) {
    for (const member of response.results) {
      if (!seen.has(member.id)) { seen.add(member.id); results.push(member); }
    }
  }

  // If all primary tag members fit on this page, the de-duplicated results
  // array IS the true total — use it directly so the "Load more" count isn't
  // inflated by members tagged with both BA and SC (overlap).
  // If primary has more pages to load, fall back to summing both totals as an
  // approximation (load more will still work correctly in that case).
  const allPrimaryLoaded = primaryResponse.results.length >= primaryResponse.total;
  const total = allPrimaryLoaded
    ? results.length
    : primaryResponse.total + secondaryResponses.reduce((sum, r) => sum + r.total, 0);

  return { results, total };
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
      .catch(() => {});
    getMetroAreas()
      .then((areas) => {
        if (!cancelled) setMetroAreas(areas);
      })
      .catch(() => {});
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
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const PAGE_SIZE = 50;

  const activeFilterCount = useMemo(() => {
    return [
      filters.bucket,
      filters.metro_area_name,
      filters.state,
      filters.country,
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
      const baseParams = {
        q: searchQuery || undefined,
        ...searchFilters,
        page: 1,
        limit: PAGE_SIZE,
      };

      if (searchFilters.tag === 'OTR-BA-2026') {
        // Merge OTR-SC-2026 results into OTR-BA-2026
        const { results: merged, total: mergedTotal } = await searchWithMergedTags(
          baseParams,
          'OTR-BA-2026',
          MERGED_INTO_OTR_BA,
        );
        setResults(merged);
        setTotal(mergedTotal);
      } else {
        const response = await searchMembers(baseParams);
        setResults(response.results);
        setTotal(response.total);
      }
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
      const baseParams = {
        q: query || undefined,
        ...filters,
        page: nextPage,
        limit: PAGE_SIZE,
      };

      if (filters.tag === 'OTR-BA-2026') {
        // Secondary tags (OTR-SC-2026) were fully loaded on the initial search.
        // Only paginate the primary tag here to avoid empty-page issues.
        const baResponse = await searchMembers({ ...baseParams, tag: 'OTR-BA-2026' });
        setResults((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          return [...prev, ...baResponse.results.filter((m) => !seen.has(m.id))];
        });
      } else {
        const response = await searchMembers(baseParams);
        setResults((prev) => [...prev, ...response.results]);
        setTotal(response.total);
      }
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

  // Hide otr-sc from the tag dropdown — its results are folded into otr-ba
  const visibleCompanyTags = filterOptions.companyTags.filter(
    (t) => !MERGED_INTO_OTR_BA.has(t),
  );

  return (
    <div className="flex h-full flex-col bg-charcoal">
      <div className="border-b border-white/10 p-4">
        <h2 className="text-lg font-semibold text-white">Member Search</h2>
        <p className="mt-1 text-sm text-white/50">
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
            className="w-full rounded-lg border border-white/15 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-600 focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/20"
          />
        </div>

        <div className="mt-4">
          <label htmlFor="sort-by" className="mb-1 block text-xs font-medium text-white/70">
            Sort by
          </label>
          <select
            id="sort-by"
            value={filters.sort ?? 'last_name_asc'}
            onChange={(e) => updateFilter('sort', e.target.value as MemberSortOption)}
            className="w-full rounded-md border border-white/15 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/20"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => setFiltersExpanded((prev) => !prev)}
          className="mt-4 flex w-full items-center justify-between rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/10"
        >
          <span className="flex items-center gap-2">
            Filters
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-orange px-1.5 py-0.5 text-xs font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
          </span>
          <svg
            className={`h-4 w-4 transition-transform ${filtersExpanded ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {filtersExpanded && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <FilterSelect
              label="ICP Bucket"
              value={filters.bucket ?? ''}
              onChange={(v) => updateFilter('bucket', v)}
              options={[
                { value: 'primary_icp', label: 'Primary ICP' },
                { value: 'secondary_icp', label: 'Secondary ICP' },
                { value: 'watchlist', label: 'Watchlist' },
                { value: 'between_jobs', label: 'Between Jobs' },
                { value: 'consultant', label: 'Consultant' },
                { value: 'partner_sponsor', label: 'Partner / Sponsor' },
                { value: 'icp_no', label: 'Non-ICP' },
                { value: 'manual_review', label: 'Manual Review' },
                { value: 'NONE', label: 'Unclassified' },
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
              label="Country"
              value={filters.country ?? ''}
              onChange={(v) => updateFilter('country', v)}
              options={filterOptions.countries.map((c) => ({ value: c, label: c }))}
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
              options={visibleCompanyTags.map((t) => ({ value: t, label: t }))}
            />
          </div>
        )}

        {(activeFilterCount > 0 || query) && (
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 text-sm font-medium text-orange hover:text-white"
          >
            Clear all filters
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="mb-2 flex items-center justify-between px-2">
          <p className="text-xs font-medium text-white/50">
            {loading ? 'Searching…' : `${total} member${total === 1 ? '' : 's'}`}
          </p>
        </div>

        {error && (
          <p className="mx-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
        )}

        {!loading && !error && results.length === 0 && (
          <p className="px-2 py-8 text-center text-sm text-white/50">
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
                      ? 'bg-orange/15 ring-1 ring-orange/40'
                      : 'hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">
                        {fullName(member.first_name, member.last_name)}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-white/60">
                        {member.current_role ?? '—'}
                        {member.company_name ? ` · ${member.company_name}` : ''}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-white/40">
                        {member.metro_area_name ?? '—'}
                      </p>
                    </div>
                    <IcpBucketBadge bucket={member.bucket} />
                  </div>
                  <p className="mt-2 text-xs text-white/30">
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
              className="rounded-md border border-white/15 bg-transparent px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/5 disabled:opacity-50"
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
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-white/70">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-white/15 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/20"
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