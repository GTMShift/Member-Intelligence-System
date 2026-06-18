import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: corsHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await request.json();

    const first_name = body.first_name;
    const last_name = body.last_name;
    const email_address = body.email_address ?? body.email;
    const linkedin = body.linkedin ?? body.linkedin_url;
    const phone_number = body.phone_number ?? body.phone;
    const company = body.company ?? body.current_company;
    const job_title = body.job_title ?? body.current_role;

    if (!first_name || !last_name || !email_address) {
      return jsonResponse(
        {
          error:
            "Missing required fields: first_name, last_name, email (or email_address)",
        },
        400,
      );
    }

    const { data: existingByEmail } = await supabase
      .from("form_responses")
      .select("id")
      .eq("email_address", email_address)
      .maybeSingle();

    if (existingByEmail) {
      return jsonResponse(
        { error: "A response with this email already exists" },
        409,
      );
    }

    if (linkedin) {
      const { data: existingByLinkedIn } = await supabase
        .from("form_responses")
        .select("id")
        .eq("linkedin", linkedin)
        .maybeSingle();

      if (existingByLinkedIn) {
        return jsonResponse(
          { error: "A response with this LinkedIn URL already exists" },
          409,
        );
      }
    }

    const { data: row, error: insertError } = await supabase
      .from("form_responses")
      .insert({
        first_name,
        last_name,
        email_address,
        linkedin: linkedin || null,
        phone_number: phone_number || null,
        company: company || null,
        job_title: job_title || null,
      })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return jsonResponse(
          { error: "A response with this email or LinkedIn URL already exists" },
          409,
        );
      }
      return jsonResponse({ error: insertError.message }, 500);
    }

    return jsonResponse({ success: true, id: row.id }, 201);
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      500,
    );
  }
}
