// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

interface OtrApplicationRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  status: string;
  event_id: string | null;
}

interface DatabaseWebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: OtrApplicationRow;
  old_record: OtrApplicationRow | null;
}

// PLACEHOLDER: swap this out once Mailchimp Transactional (Mandrill) access
// is confirmed. For now it just logs what WOULD have been sent, so the rest
// of this function's logic (detecting the status change, building the
// personalized link) can be fully tested without a real email going out.
async function sendPaymentLinkEmail(params: {
  to: string;
  firstName: string;
  personalizedLink: string;
}): Promise<void> {
  console.log(
    `[PLACEHOLDER] Would send email to ${params.to} with link: ${params.personalizedLink}`,
  );
  // TODO: replace with a real Mailchimp Transactional (Mandrill) API call, e.g.:
  // await fetch("https://mandrillapp.com/api/1.0/messages/send.json", {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify({
  //     key: Deno.env.get("MANDRILL_API_KEY"),
  //     message: {
  //       to: [{ email: params.to }],
  //       subject: "Your OTR seat is ready — complete your payment",
  //       html: `<p>Hi ${params.firstName},</p><p>Your application has been accepted! Complete your payment here: <a href="${params.personalizedLink}">${params.personalizedLink}</a></p>`,
  //       from_email: "hello@yourdomain.com",
  //     },
  //   }),
  // });
}

// Called by a Supabase Database Webhook, not an external third party — but
// since we still don't want random internet traffic hitting this URL and
// triggering emails, we check a shared secret header ourselves instead of
// relying on Supabase's built-in auth checks (which is why auth: 'none' is
// used here, matching the config.toml verify_jwt = false setting).
export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    const providedSecret = req.headers.get("x-webhook-secret");
    const expectedSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
    if (!expectedSecret || providedSecret !== expectedSecret) {
      return new Response("Unauthorized", { status: 401 });
    }

    const payload: DatabaseWebhookPayload = await req.json();

    if (payload.table !== "otr_applications" || payload.type !== "UPDATE") {
      return new Response(JSON.stringify({ skipped: true, reason: "not a relevant event" }), {
        status: 200,
      });
    }

    const { record, old_record } = payload;

    // Only fire on the actual transition INTO 'Accepted' — not every save of
    // an already-Accepted row.
    const justAccepted = record.status === "Accepted" && old_record?.status !== "Accepted";
    if (!justAccepted) {
      return new Response(JSON.stringify({ skipped: true, reason: "not a new Accepted status" }), {
        status: 200,
      });
    }

    if (!record.event_id) {
      console.error(`Application ${record.id} accepted with no event_id — cannot build payment link`);
      return new Response(JSON.stringify({ error: "missing event_id" }), { status: 200 });
    }

    const { data: event, error: eventErr } = await ctx.supabaseAdmin
      .from("events")
      .select("stripe_payment_link")
      .eq("id", record.event_id)
      .maybeSingle();

    if (eventErr) {
      console.error("Failed to look up event:", eventErr.message);
      return new Response(JSON.stringify({ error: "event lookup failed" }), { status: 500 });
    }
    if (!event?.stripe_payment_link) {
      console.error(`No stripe_payment_link set for event ${record.event_id}`);
      return new Response(JSON.stringify({ error: "no payment link configured for this event" }), {
        status: 200,
      });
    }

    const personalizedLink = `${event.stripe_payment_link}?client_reference_id=${record.id}`;

    await sendPaymentLinkEmail({
      to: record.email,
      firstName: record.first_name,
      personalizedLink,
    });

    return new Response(JSON.stringify({ sent: true }), { status: 200 });
  }),
};