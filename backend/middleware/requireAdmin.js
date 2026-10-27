const supabase = require('../supabaseClient');

async function requireAdmin(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization token' });
  }

  const token = authorization.slice('Bearer '.length);

  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return res.status(401).json({ error: 'Invalid or expired authorization token' });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError || profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  req.user = userData.user;
  next();
}

module.exports = requireAdmin;