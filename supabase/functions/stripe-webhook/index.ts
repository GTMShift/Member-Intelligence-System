// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import Stripe from "npm:stripe";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
});
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

// This function is called directly by Stripe, which cannot send Supabase
// credentials — so we use auth: 'none' (public endpoint) and verify the
// caller ourselves via Stripe's own webhook signature instead.
export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response("Missing stripe-signature header", { status: 400 });
    }

    // Stripe's signature check needs the RAW request body, not parsed JSON.
    const rawBody = await req.text();

    let event: Stripe.Event;
    try {
      // constructEventAsync (not the sync constructEvent) since Deno/edge
      // runtimes use SubtleCrypto rather than Node's crypto module.
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
    } catch (err) {
      console.error("Stripe webhook signature verification failed:", err);
      return new Response("Invalid signature", { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const applicationId = session.client_reference_id;

      if (!applicationId) {
        // Return 200 so Stripe doesn't keep retrying — this just means the
        // payment link was used without a client_reference_id attached,
        // which we can't do anything about after the fact.
        console.error("checkout.session.completed with no client_reference_id");
        return new Response(JSON.stringify({ received: true, warning: "no client_reference_id" }), {
          status: 200,
        });
      }

      const { error } = await ctx.supabaseAdmin
        .from("otr_applications")
        .update({ status: "Seat Confirmed" })
        .eq("id", applicationId);

      if (error) {
        console.error("Failed to update application status:", error.message);
        return new Response("Database update failed", { status: 500 });
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }),
};