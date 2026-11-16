function normalizeText(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeLinkedIn(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return raw.replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  }
}

function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 7 ? digits : '';
}

function similarity(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const bigrams = (value) => Array.from({ length: Math.max(0, value.length - 1) }, (_, i) => value.slice(i, i + 2));
  const aPairs = bigrams(a);
  const bPairs = bigrams(b);
  if (!aPairs.length || !bPairs.length) return 0;
  const remaining = [...bPairs];
  let matches = 0;
  for (const pair of aPairs) {
    const index = remaining.indexOf(pair);
    if (index !== -1) {
      matches++;
      remaining.splice(index, 1);
    }
  }
  return (2 * matches) / (aPairs.length + bPairs.length);
}

function memberSignals(member) {
  const history = member.employment_history ?? [];
  const profileCompany = member.profile?.company?.name ?? member.profile?.company_name;
  const companies = new Set([
    ...history.map((job) => normalizeText(job.company)),
    normalizeText(profileCompany),
  ].filter(Boolean));
  const roles = new Set(history.map((job) => normalizeText(job.role)).filter(Boolean));
  const current = history.find((job) => job.is_current);
  return {
    email: normalizeEmail(member.email),
    linkedin: normalizeLinkedIn(member.linkedin_url),
    phone: normalizePhone(member.phone),
    name: `${normalizeText(member.first_name)} ${normalizeText(member.last_name)}`.trim(),
    companies,
    roles,
    currentCompany: normalizeText(current?.company ?? profileCompany),
    currentRole: normalizeText(current?.role ?? member.profile?.job_title),
  };
}

function buildDuplicateCandidates(members) {
  const candidates = [];
  // ponytail: O(n²) pair scan keeps the first review prototype simple; switch to indexed buckets if the member set grows materially.
  for (let i = 0; i < members.length; i++) {
    const left = members[i];
    const a = memberSignals(left);
    for (let j = i + 1; j < members.length; j++) {
      const right = members[j];
      if (left.id === right.id) continue;
      const b = memberSignals(right);
      const reasons = [];
      if (a.email && a.email === b.email) reasons.push({ field: 'email', label: 'Normalized email matches' });
      if (a.linkedin && a.linkedin === b.linkedin) reasons.push({ field: 'linkedin_url', label: 'Normalized LinkedIn URL matches' });
      const nameSimilarity = similarity(a.name, b.name);
      if (a.phone && a.phone === b.phone) reasons.push({ field: 'phone', label: 'Normalized phone matches' });
      const sharedCompany = [...a.companies].some((value) => b.companies.has(value));
      const sharedRole = [...a.roles].some((value) => b.roles.has(value));
      if (sharedCompany) reasons.push({ field: 'company', label: 'Current or past company matches' });
      if (sharedRole) reasons.push({ field: 'past_role', label: 'Current or past role matches' });
      if (nameSimilarity >= 0.72) reasons.push({ field: 'name', label: nameSimilarity === 1 ? 'Name matches' : 'Name is similar' });

      const strong = reasons.some((reason) => reason.field === 'email' || reason.field === 'linkedin_url');
      const supportedSecondary = (a.phone && a.phone === b.phone && nameSimilarity >= 0.72)
        || (nameSimilarity >= 0.82 && (sharedCompany || sharedRole));
      if (!strong && !supportedSecondary) continue; // Name-only and phone-only matches are too weak to propose.

      let confidence = 0.78;
      if (reasons.some((reason) => reason.field === 'email') && reasons.some((reason) => reason.field === 'linkedin_url')) confidence = 0.995;
      else if (strong) confidence = 0.96;
      else if (a.phone && a.phone === b.phone) confidence = 0.84;
      else if (sharedCompany && sharedRole) confidence = 0.83;
      else if (sharedCompany || sharedRole) confidence = 0.79;

      const [memberLowId, memberHighId] = [left.id, right.id].sort();
      candidates.push({ member_low_id: memberLowId, member_high_id: memberHighId, match_reasons: reasons, confidence });
    }
  }
  return candidates;
}

module.exports = { buildDuplicateCandidates, normalizeEmail, normalizeLinkedIn, normalizePhone, similarity };
