// src/lib/profileOptions.ts
// Choices for professional fields members fill in during onboarding
// (CompleteProfilePage) so My Profile offers the same options.

export const SENIORITY_OPTIONS = [
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

export const MANAGEMENT_LAYER_OPTIONS = [
  { value: '', label: 'Select layers' },
  { value: '1', label: '1 layer' },
  { value: '2', label: '2 layers' },
  { value: '3', label: '3 layers' },
  { value: '4+', label: '4+ layers' },
] as const;

export const TSHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;
export type TshirtSize = typeof TSHIRT_SIZES[number];

// Teams a member oversees. save_my_member_profile stores these booleans
// (onboarding's free-text "Other" is not stored on member_profile).
export const TEAM_FIELDS = [
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

export const REGION_FIELDS = [
  { key: 'region_north_america', label: 'North America' },
  { key: 'region_regional_usa', label: 'Regional USA' },
  { key: 'region_global', label: 'Global' },
  { key: 'region_emea', label: 'EMEA' },
  { key: 'region_apac', label: 'APAC' },
  { key: 'region_latin_america', label: 'Latin America' },
] as const;

export type TeamKey = typeof TEAM_FIELDS[number]['key'];
export type RegionKey = typeof REGION_FIELDS[number]['key'];
export type TeamFlags = Record<TeamKey, boolean>;
export type RegionFlags = Record<RegionKey, boolean>;

export function emptyTeamFlags(): TeamFlags {
  return Object.fromEntries(TEAM_FIELDS.map(({ key }) => [key, false])) as TeamFlags;
}

export function emptyRegionFlags(): RegionFlags {
  return Object.fromEntries(REGION_FIELDS.map(({ key }) => [key, false])) as RegionFlags;
}

export function isTshirtSize(value: unknown): value is TshirtSize {
  return typeof value === 'string' && (TSHIRT_SIZES as readonly string[]).includes(value);
}
