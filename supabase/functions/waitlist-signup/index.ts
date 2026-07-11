import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://orionfold.com",
  "https://www.orionfold.com",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(
  body: Record<string, unknown>,
  corsHeaders: Record<string, string>,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT = 5; // max signups per IP per hour

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, corsHeaders, 405);
  }

  try {
    const body = await req.json();
    const { email, website } = body;

    // Honeypot — bots fill hidden fields
    if (website) {
      // Silently accept to not tip off bots
      return jsonResponse({ success: true }, corsHeaders);
    }

    // Validate email
    if (!email || typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
      return jsonResponse({ error: "Please enter a valid email address." }, corsHeaders, 400);
    }

    const cleanEmail = email.trim().toLowerCase();

    // Supabase client with service role (auto-injected)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Rate limiting by IP
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count } = await supabase
      .from("waitlist")
      .select("*", { count: "exact", head: true })
      .eq("ip_address", ip)
      .gte("created_at", oneHourAgo);

    if (count !== null && count >= RATE_LIMIT) {
      return jsonResponse(
        { error: "Too many requests. Please try again later." },
        corsHeaders,
        429,
      );
    }

    // Check if email already exists
    const { data: existing } = await supabase
      .from("waitlist")
      .select("email, confirmed")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (existing) {
      if (existing.confirmed) {
        return jsonResponse({
          success: true,
          message: "You're already on the waitlist.",
          already_confirmed: true,
        }, corsHeaders);
      }
      // Re-send confirmation for unconfirmed
      // Generate new token and update
      const newToken = crypto.randomUUID();
      await supabase
        .from("waitlist")
        .update({ confirm_token: newToken })
        .eq("email", cleanEmail);

      await sendConfirmationEmail(cleanEmail, newToken);

      return jsonResponse({
        success: true,
        message: "We sent another confirmation link. Check your inbox.",
      }, corsHeaders);
    }

    // Insert new signup
    const confirmToken = crypto.randomUUID();
    const userAgent = req.headers.get("user-agent") || "";

    const { error: insertError } = await supabase.from("waitlist").insert({
      email: cleanEmail,
      confirmed: false,
      confirm_token: confirmToken,
      ip_address: ip,
      user_agent: userAgent,
    });

    if (insertError) {
      console.error("Insert error:", insertError);
      return jsonResponse({ error: "Something went wrong. Please try again." }, corsHeaders, 500);
    }

    // Send confirmation email
    await sendConfirmationEmail(cleanEmail, confirmToken);

    return jsonResponse({ success: true }, corsHeaders);
  } catch (err) {
    console.error("Unhandled error:", err);
    return jsonResponse({ error: "Something went wrong. Please try again." }, corsHeaders, 500);
  }
});

async function sendConfirmationEmail(email: string, token: string) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY not configured");
  }

  const confirmEmailUrl = Deno.env.get("CONFIRM_EMAIL_URL");
  if (!confirmEmailUrl) {
    throw new Error("CONFIRM_EMAIL_URL not configured");
  }
  const confirmUrl = `${confirmEmailUrl}?token=${encodeURIComponent(token)}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Orionfold <team@orionfold.com>",
      to: [email],
      subject: "Confirm your Orionfold Relay waitlist spot",
      text: confirmationEmailText(confirmUrl),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Resend error:", res.status, text);
    throw new Error(`Resend API error: ${res.status}`);
  }
}

function confirmationEmailText(confirmUrl: string): string {
  return `Hi,

You requested early access to Orionfold Relay -- the operating system
for AI-native business. Relay orchestrates AI agents
across your entire business with governance, visibility, and cost controls
that keep you in charge.

Open Source | Local-First | 5 Runtimes | Human-in-the-Loop

Confirm your spot:

${confirmUrl}

This link expires in 7 days. If you didn't request this,
you can safely ignore this email.

--
Orionfold Relay | orionfold.com/relay
The operating system for the agentic economy
`;
}
