-- 025_welcome_reception_to_text.sql
--
-- welcome_reception was created as a boolean in migration 018, but the
-- actual Stripe checkout question has three possible answers (Yes / No /
-- Unsure), which a boolean can't represent. Converting to text.

alter table otr_applications alter column welcome_reception drop default;
alter table otr_applications alter column welcome_reception type text using welcome_reception::text;