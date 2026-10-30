// Creates a team account (email + temporary password) and sets its role.
// Only admins and the superadmin may call it; only the superadmin may create admins.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ROLES = ["coordinator", "factdesk", "editor", "admin"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "Sign in first" }, 401);

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "superadmin"].includes(me.role)) return json({ error: "Only admins can add team members" }, 403);

  let body: Record<string, string>;
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const role = String(body.role ?? "");
  const county = String(body.county ?? "").trim() || null;
  const display_name = String(body.display_name ?? "").trim() || null;

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Enter a valid email" }, 400);
  if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);
  if (!ROLES.includes(role)) return json({ error: "Unknown role" }, 400);
  if (role === "admin" && me.role !== "superadmin") return json({ error: "Only the superadmin can create admins" }, 403);
  if (role === "coordinator" && !county) return json({ error: "Coordinators need a county" }, 400);

  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) return json({ error: error?.message ?? "Could not create the account" }, 400);

  const { error: pErr } = await admin.from("profiles")
    .upsert({ id: created.user.id, role, county, display_name });
  if (pErr) return json({ error: pErr.message }, 400);

  return json({ ok: true, id: created.user.id });
});
