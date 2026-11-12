import { describe, expect, it } from 'vitest';
import {
  employmentFormFromCurrent,
  formatEmploymentDate,
  isCalendarDate,
  previousJobEndDate,
  sortEmploymentHistory,
  validateEmploymentForm,
} from '../lib/employmentForm';
import type { EmploymentHistoryEntry } from '../types/api';

const salesforce: EmploymentHistoryEntry = {
  id: 'job-1',
  company: 'Salesforce',
  role: 'Solutions Engineering Manager',
  start_date: '2021-03-01',
  end_date: null,
  is_current: true,
  source: 'Manual',
};

const TODAY = '2026-11-12';

describe('validateEmploymentForm: changed jobs', () => {
  it('accepts a new company, title and start date', () => {
    expect(
      validateEmploymentForm('change', { company: 'Microsoft', role: 'Director', start_date: '2026-11-01' }, salesforce, TODAY),
    ).toBeNull();
  });

  it('requires company, title and start date', () => {
    expect(validateEmploymentForm('change', { company: ' ', role: 'Director', start_date: '2026-11-01' }, salesforce, TODAY))
      .toMatch(/new company/);
    expect(validateEmploymentForm('change', { company: 'Microsoft', role: '', start_date: '2026-11-01' }, salesforce, TODAY))
      .toMatch(/new job title/);
    expect(validateEmploymentForm('change', { company: 'Microsoft', role: 'Director', start_date: '' }, salesforce, TODAY))
      .toMatch(/date you started/);
  });

  it('rejects impossible, future and too-early start dates', () => {
    expect(validateEmploymentForm('change', { company: 'Microsoft', role: 'Director', start_date: '2026-02-30' }, salesforce, TODAY))
      .toMatch(/valid start date/);
    expect(validateEmploymentForm('change', { company: 'Microsoft', role: 'Director', start_date: '2026-12-01' }, salesforce, TODAY))
      .toMatch(/future/);
    expect(validateEmploymentForm('change', { company: 'Microsoft', role: 'Director', start_date: '2020-01-01' }, salesforce, TODAY))
      .toMatch(/can't start before your current job/);
  });

  it('points a same-company, same-title "change" to the correction form', () => {
    expect(
      validateEmploymentForm('change', { company: 'salesforce', role: 'Solutions Engineering Manager', start_date: '2026-11-01' }, salesforce, TODAY),
    ).toMatch(/Correct current information/);
  });

  it('allows a first job when no current job exists', () => {
    expect(validateEmploymentForm('change', { company: 'Microsoft', role: 'Director', start_date: '2026-11-01' }, undefined, TODAY))
      .toBeNull();
  });
});

describe('validateEmploymentForm: correct current information', () => {
  it('accepts a fixed job title', () => {
    expect(
      validateEmploymentForm('correct', { ...employmentFormFromCurrent(salesforce), role: 'Senior Solutions Engineering Manager' }, salesforce, TODAY),
    ).toBeNull();
  });

  it('asks for a change when nothing was edited', () => {
    expect(validateEmploymentForm('correct', employmentFormFromCurrent(salesforce), salesforce, TODAY)).toMatch(/Nothing has changed/);
    expect(
      validateEmploymentForm('correct', { ...employmentFormFromCurrent(salesforce), start_date: '' }, salesforce, TODAY),
    ).toMatch(/Nothing has changed/);
  });

  it('does not require a start date', () => {
    expect(validateEmploymentForm('correct', { company: 'Microsoft', role: 'Director', start_date: '' }, undefined, TODAY)).toBeNull();
  });
});

describe('date helpers', () => {
  it('checks real calendar dates', () => {
    expect(isCalendarDate('2024-02-29')).toBe(true);
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('11/01/2026')).toBe(false);
  });

  it('matches the backend end date for the previous job', () => {
    expect(previousJobEndDate('2026-11-01', '2021-03-01')).toBe('2026-10-31');
    expect(previousJobEndDate('2026-03-01', '2021-03-01')).toBe('2026-02-28');
    expect(previousJobEndDate('2021-03-01', '2021-03-01')).toBe('2021-03-01');
    expect(previousJobEndDate('', '2021-03-01')).toBeNull();
  });

  it('formats dates for the timeline', () => {
    expect(formatEmploymentDate('2026-11-01')).toBe('Nov 1, 2026');
    expect(formatEmploymentDate(null)).toBe('Not listed');
  });
});

describe('sortEmploymentHistory', () => {
  it('puts the current job first, then newest previous jobs', () => {
    const rows: EmploymentHistoryEntry[] = [
      { ...salesforce, id: 'old', company: 'Oracle', start_date: '2015-01-01', end_date: '2018-12-31', is_current: false },
      { ...salesforce, id: 'mid', is_current: false, end_date: '2026-10-31' },
      { ...salesforce, id: 'now', company: 'Microsoft', start_date: '2026-11-01', is_current: true },
    ];
    expect(sortEmploymentHistory(rows).map((row) => row.id)).toEqual(['now', 'mid', 'old']);
  });
});
