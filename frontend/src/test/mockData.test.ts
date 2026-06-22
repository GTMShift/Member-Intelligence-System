import { describe, expect, it } from 'vitest';
import { MOCK_MEMBERS } from '../api/mockMembers';

describe('mock data consistency', () => {
  it('all mock members have job_title on profile, not current_role', () => {
    for (const member of MOCK_MEMBERS) {
      expect(member.profile).toHaveProperty('job_title');
      expect(member.profile.job_title).toBeTruthy();
      expect(member.profile).not.toHaveProperty('current_role');
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
