import type { PendingDuplicateFlag } from '../types/api';

export const MOCK_DUPLICATE_FLAGS: PendingDuplicateFlag[] = [
  {
    id: 'dup-flag-0001',
    check: {
      duplicate_found: true,
      existing_member_id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
      matched_on: 'email',
    },
    incoming: {
      first_name: 'Emily',
      last_name: 'Nakamura',
      email: 'emily.n@greenfield.co',
      linkedin_url: 'https://www.linkedin.com/in/emilynakamura-new',
      phone: '+12125550999',
    },
  },
  {
    id: 'dup-flag-0002',
    check: {
      duplicate_found: true,
      existing_member_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
      matched_on: 'linkedin_url',
    },
    incoming: {
      first_name: 'Marcus',
      last_name: 'Rivera',
      email: 'm.rivera.personal@gmail.com',
      linkedin_url: 'https://www.linkedin.com/in/marcusrivera',
      phone: '+14155550999',
    },
  },
];
