-- 022_events_stripe_payment_link.sql

alter table events add column if not exists stripe_payment_link text;