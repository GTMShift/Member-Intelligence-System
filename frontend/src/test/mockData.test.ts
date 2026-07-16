import { describe, expect, it } from 'vitest';
import { MOCK_MEMBERS } from '../testFixtures/members';

describe('mock data consistency', () => {
  it('all mock members have a current role in employment_history, not job_title on profile', () => {
    for (const member of MOCK_MEMBERS) {
      expect(member.profile).not.toHaveProperty('job_title');

      const currentEmployment = member.employment_history.filter(
        (entry) => entry.is_current === true,
      );
      expect(currentEmployment.length).toBeGreaterThanOrEqual(1);

      for (const entry of currentEmployment) {
        expect(entry).toHaveProperty('role');
        expect(entry.role).toBeTruthy();
      }
    }
  });

  it('all mock interactions have interaction_type, not type', () => {
    for (const member of MOCK_MEMBERS) {
      for (const interaction of member.interactions) {
        expect(interaction).toHaveProperty('interaction_type');
        expect(interaction.interaction_type).toBeTruthy();
        expect(interaction).not.toHaveProperty('type');
      }
    }
  });

  it('all mock members have company_id and company_name on profile, not current_company', () => {
    for (const member of MOCK_MEMBERS) {
      expect(member.profile).toHaveProperty('company_id');
      expect(member.profile).toHaveProperty('company_name');
      expect(member.profile.company_id).toBeTruthy();
      expect(member.profile.company_name).toBeTruthy();
      expect(member.profile).not.toHaveProperty('current_company');
    }
  });
});
