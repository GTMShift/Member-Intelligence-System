function createAuthMiddleware(client) {
  const getClient = () => client || require('../supabaseClient');
  async function requireAuth(req, res, next) {
    const authorization = req.get('authorization') || '';
    const match = /^Bearer\s+(\S+)$/i.exec(authorization);
    if (!match) return res.status(401).json({ error: 'Authentication required' });

    try {
      const { data, error } = await getClient().auth.getUser(match[1]);
      if (error || !data?.user) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
      req.user = data.user;
      return next();
    } catch {
      return res.status(401).json({ error: 'Authentication failed' });
    }
  }

  function requireRole(allowedRoles) {
    return async (req, res, next) => {
      if (!req.user) return res.status(401).json({ error: 'Authentication required' });
      try {
        const { data: profile, error } = await getClient()
          .from('profiles')
          .select('role, member_id')
          .eq('id', req.user.id)
          .maybeSingle();

        if (error || !profile || !allowedRoles.includes(profile.role)) {
          return res.status(403).json({ error: 'Forbidden' });
        }
        req.profile = profile;
        return next();
      } catch {
        return res.status(403).json({ error: 'Forbidden' });
      }
    };
  }

  return { requireAuth, requireRole };
}

module.exports = { ...createAuthMiddleware(), createAuthMiddleware };
