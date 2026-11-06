-- 021_otr_applications_status_enum.sql
--
-- Converts status from a plain text column (with a CHECK constraint) into a
-- real Postgres enum type. This preserves the same set of allowed values —
-- it does NOT reduce this to a boolean, since there are 8 distinct states
-- (Pending, Accepted, Waitlisted, Denied, Seat Confirmed, Withdrawn, Welcome
-- Reception Only, Confirmed) that a true/false value could never represent.
--
-- The practical benefit: Supabase's Table Editor automatically renders enum
-- columns as a dropdown selector, instead of a free-text box — giving the
-- easier editing experience that was actually being asked for here.

-- Drop the old check constraint first — the enum type itself will enforce
-- valid values going forward, making this constraint redundant.
alter table otr_applications drop constraint if exists otr_applications_status_check;

-- The trigger from migration 018 reads NEW.status, so Postgres won't allow
-- changing this column's type while it's still attached. Drop it temporarily
-- and recreate it identically afterward — the function itself doesn't need
-- any changes, since comparing an enum value against text literals still
-- works the same way.
drop trigger if exists trg_sync_otr_tag on otr_applications;

do $$
declare
  v_labels text[];
begin
  select array_agg(e.enumlabel order by e.enumsortorder)
    into v_labels
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid
   where n.nspname = 'public'
     and t.typname = 'otr_application_status';

  if v_labels is null then
    create type public.otr_application_status as enum (
      'Pending',
      'Accepted',
      'Waitlisted',
      'Denied',
      'Seat Confirmed',
      'Withdrawn',
      'Welcome Reception Only',
      'Confirmed'
    );
  elsif v_labels is distinct from array[
      'Pending',
      'Accepted',
      'Waitlisted',
      'Denied',
      'Seat Confirmed',
      'Withdrawn',
      'Welcome Reception Only',
      'Confirmed'
    ]::text[] then
    raise exception 'public.otr_application_status has unexpected labels: %', v_labels;
  end if;
end;
$$;

alter table otr_applications alter column status drop default;

alter table otr_applications
  alter column status type public.otr_application_status
  using status::text::public.otr_application_status;

alter table otr_applications
  alter column status set default 'Pending'::public.otr_application_status;

create trigger trg_sync_otr_tag
    after insert or update of status on otr_applications
    for each row
    execute function sync_otr_tag_to_member();
