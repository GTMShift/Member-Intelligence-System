-- 040: move the legacy application admin roster into trusted profile roles.
-- This is a one-time role grant, run by the database migration owner. The
-- application and database policies continue to authorize from profiles.role.
-- Only existing, email-confirmed Supabase Auth accounts are promoted.

with intended_admin_emails(email) as (
  values
    ('vedanutheti@gmail.com'),
    ('bdb6@illinois.edu'),
    ('chloeat2@illinois.edu'),
    ('chris@solutionexec.com'),
    ('james@solutionexec.com'),
    ('jtran63@illinois.edu'),
    ('meghan@solutionexec.com'),
    ('vivaanb2@illinois.edu'),
    ('wchen236@illinois.edu'),
    ('seteam@solutionexec.com'),
    ('atlas@solutionexec.com'),
    ('wblum@illinois.edu')
), eligible_users as (
  select distinct on (u.id)
    u.id,
    u.email,
    u.raw_user_meta_data ->> 'full_name' as full_name,
    u.raw_user_meta_data ->> 'avatar_url' as avatar_url
  from auth.users u
  join intended_admin_emails e on lower(e.email) = lower(u.email)
  where u.email_confirmed_at is not null
  order by u.id
)
insert into public.profiles (id, email, role, full_name, avatar_url)
select id, email, 'admin', full_name, avatar_url
from eligible_users
on conflict (id) do update
set role = 'admin',
    updated_at = now();
