function createAuthorization(supabase) {
  async function authenticate(req, res, next) {
    const authorization = req.get('authorization') || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return res.status(401).json({ error: 'Authentication required' });

    const { data, error } = await supabase.auth.getUser(match[1]);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid or expired access token' });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, member_id')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError) {
      console.error('Authorization profile lookup failed:', profileError.message);
      return res.status(503).json({ error: 'Authorization could not be verified' });
    }
    if (!profile || !['admin', 'member'].includes(profile.role)) {
      return res.status(403).json({ error: 'An approved account is required' });
    }

    req.auth = { user: data.user, profile, accessToken: match[1] };
    return next();
  }

  function requireAdmin(req, res, next) {
    if (req.auth?.profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Administrator access required' });
    }
    return next();
  }

  function requireSelfOrAdmin(getMemberId = (req) => req.params.id) {
    return (req, res, next) => {
      const requestedMemberId = getMemberId(req);
      if (req.auth?.profile?.role === 'admin') return next();
      if (
        req.auth?.profile?.role === 'member' &&
        req.auth.profile.member_id &&
        requestedMemberId &&
        req.auth.profile.member_id.toLowerCase() === String(requestedMemberId).toLowerCase()
      ) {
        return next();
      }
      return res.status(403).json({ error: 'Access to this member is not allowed' });
    };
  }

  function requireWebhookSecret(req, res, next) {
    const expected = process.env.EMAIL_WEBHOOK_SECRET;
    const provided = req.get('x-webhook-secret');
    if (!expected) {
      return res.status(503).json({ error: 'Email webhook authentication is not configured' });
    }
    if (!provided) {
      return res.status(401).json({ error: 'Invalid webhook credentials' });
    }
    const crypto = require('node:crypto');
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    if (
      providedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      return res.status(401).json({ error: 'Invalid webhook credentials' });
    }
    return next();
  }

  return { authenticate, requireAdmin, requireSelfOrAdmin, requireWebhookSecret };
}

let defaultAuthorization;
function getDefaultAuthorization() {
  if (!defaultAuthorization) {
    defaultAuthorization = createAuthorization(require('../supabaseClient'));
  }
  return defaultAuthorization;
}

module.exports = { createAuthorization };
for (const name of ['authenticate', 'requireAdmin', 'requireSelfOrAdmin', 'requireWebhookSecret']) {
  Object.defineProperty(module.exports, name, {
    enumerable: true,
    get: () => getDefaultAuthorization()[name],
  });
}
