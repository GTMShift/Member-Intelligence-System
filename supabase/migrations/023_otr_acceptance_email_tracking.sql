-- 023_otr_acceptance_email_tracking.sql
--
-- Tracks when the Make-driven "you've been accepted, here's your payment
-- link" email was actually sent for a given application. Used as a filter
-- condition in the Make scenario (status = 'Accepted' AND this is null) so
-- an unrelated later edit to an already-accepted application never
-- re-triggers the email.

alter table otr_applications add column if not exists acceptance_email_sent_at timestamptz;