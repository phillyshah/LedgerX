/**
 * statement-email edge function
 *
 * Lets a full admin create a credit-card statement by EMAIL instead of the
 * Labs upload screen, with a review round-trip in between so OCR output is
 * never trusted blind.
 *
 *   1. Admin mails receipts@90ten.life, subject starting "statement", the
 *      statement attached and optional `key: value` lines in the body.
 *   2. inbound-email forwards it here (with attachments, unlike the other
 *      email commands) using the shared INBOUND_EMAIL_SECRET.
 *   3. This function OCRs it via extract-statement, stores a DRAFT, and
 *      emails back a numbered table of everything it read.
 *   4. The admin replies with corrections. The reply subject carries a
 *      [LX-XXXXXX] token that identifies the draft. Each reply re-renders
 *      and re-sends the draft.
 *   5. "confirm" promotes the draft into credit_card_statements +
 *      statement_line_items + statement_households, exactly as an in-app
 *      upload would, and it shows up in Reconciliation.
 *
 * The draft is deliberately NOT a credit_card_statements row until confirmed
 * — see the migration header for why.
 *
 * Admin-only. A non-admin sender never reaches this function: inbound-email
 * only routes here when the sender resolves to a full admin, so an ordinary
 * "Statement of account" forward is still processed as a normal receipt.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

type Lang = "en" | "pt-BR";

interface LineItem {
  date: string;
  description: string;
  amount: number;
}

interface Attachment {
  filename: string;
  content_type: string;
  data: string;
}

// ── Token ─────────────────────────────────────────────────────────────────────
// Threading is done with a token in the SUBJECT, not In-Reply-To/References:
// the IMAP poller doesn't forward those headers, and a subject token also
// survives a forward or a fresh compose. Ambiguous glyphs (0/O, 1/I) are left
// out so a token read off a screen and retyped still matches.
const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TOKEN_RE = /\[LX-([A-Z0-9]{6})\]/i;

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join("");
}

function tokenFromSubject(subject: string): string | null {
  const m = TOKEN_RE.exec(subject ?? "");
  return m ? m[1].toUpperCase() : null;
}

// ── Body parsing ──────────────────────────────────────────────────────────────
/**
 * Strips the quoted original out of a reply.
 *
 * Without this, every reply would re-parse the draft table we just sent —
 * the rendered line items look enough like `N: date | desc | amount` edit
 * commands that the draft would reapply its own output, and a "confirm" in
 * the quoted instructions would fire on a reply that never said it.
 */
function stripQuotedReply(body: string): string {
  const lines = (body ?? "").split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith(">")) break;
    if (/^-{2,}\s*(original message|forwarded message)/i.test(t)) break;
    if (/^_{5,}$/.test(t)) break;
    // "On <date>, <someone> wrote:" — the common Gmail/Apple Mail attribution.
    if (/^on .{10,80}\bwrote:$/i.test(t)) break;
    if (/^em .{10,80}\bescreveu:$/i.test(t)) break;
    if (/^from:\s/i.test(t) && out.length > 0) break;
    out.push(line);
  }
  return out.join("\n");
}

function parseAmount(raw: string): number | null {
  let s = (raw ?? "").trim().replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  // pt-BR "1.234,56" — comma is the decimal separator when it comes last.
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Math.abs(parseFloat(s));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function parseDate(raw: string, fallbackYear?: number): string | null {
  const s = (raw ?? "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  // MM/DD or MM/DD/YY(YY) — US card statements print both.
  m = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(s);
  if (m) {
    let year = m[3] ? parseInt(m[3], 10) : (fallbackYear ?? new Date().getUTCFullYear());
    if (year < 100) year += 2000;
    return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

interface Directives {
  card?: string;
  periodStart?: string;
  periodEnd?: string;
  households?: string[];
  confirm: boolean;
  cancel: boolean;
  edits: Array<{ index: number; item: LineItem }>;
  drops: number[];
  adds: LineItem[];
  unknown: string[];
}

/**
 * Parses the directive lines out of an email body.
 *
 * Deliberately forgiving: this gets typed on a phone. Keys are matched in
 * both languages, `|` separates line-item fields, and anything unrecognised
 * is collected into `unknown` and echoed back rather than silently ignored —
 * a mistyped command that vanishes is how someone ends up confirming a
 * statement they thought they had corrected.
 */
function parseDirectives(body: string, fallbackYear?: number): Directives {
  const d: Directives = {
    confirm: false, cancel: false, edits: [], drops: [], adds: [], unknown: [],
  };

  for (const rawLine of stripQuotedReply(body).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const lower = line.toLowerCase();
    if (lower === "confirm" || lower === "confirmar") { d.confirm = true; continue; }
    if (lower === "cancel" || lower === "cancelar") { d.cancel = true; continue; }

    let m: RegExpExecArray | null;

    if ((m = /^(?:card|cartao|cartão)\s*:\s*(.+)$/i.exec(line))) {
      d.card = m[1].trim(); continue;
    }

    if ((m = /^(?:period|per[ií]odo)\s*:\s*(.+)$/i.exec(line))) {
      const parts = m[1].split(/\s*(?:\.\.|to|a|até|ate|-{1,2}>|—)\s*/i).filter(Boolean);
      if (parts.length >= 2) {
        const a = parseDate(parts[0], fallbackYear);
        const b = parseDate(parts[parts.length - 1], fallbackYear);
        if (a) d.periodStart = a;
        if (b) d.periodEnd = b;
        if (!a || !b) d.unknown.push(line);
      } else d.unknown.push(line);
      continue;
    }

    if ((m = /^(?:households?|propert(?:y|ies)|propriedades?|resid[êe]ncias?)\s*:\s*(.+)$/i.exec(line))) {
      d.households = m[1].split(/\s*[,;]\s*/).map((s) => s.trim()).filter(Boolean);
      continue;
    }

    if ((m = /^(?:drop|remove|delete|remover|excluir)\s+(.+)$/i.exec(line))) {
      const nums = m[1].split(/[\s,]+/).map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n));
      if (nums.length) d.drops.push(...nums); else d.unknown.push(line);
      continue;
    }

    if ((m = /^(?:add|adicionar)\s*:\s*(.+)$/i.exec(line))) {
      const item = parseItemFields(m[1], fallbackYear);
      if (item) d.adds.push(item); else d.unknown.push(line);
      continue;
    }

    // "3: 2026-10-14 | Home Depot | 128.44" — edit line 3 in place.
    if ((m = /^(\d{1,3})\s*[:.)]\s*(.+)$/.exec(line))) {
      const item = parseItemFields(m[2], fallbackYear);
      if (item) d.edits.push({ index: parseInt(m[1], 10), item });
      else d.unknown.push(line);
      continue;
    }

    d.unknown.push(line);
  }
  return d;
}

function parseItemFields(raw: string, fallbackYear?: number): LineItem | null {
  const parts = raw.split("|").map((s) => s.trim());
  if (parts.length < 3) return null;
  const date = parseDate(parts[0], fallbackYear);
  const amount = parseAmount(parts[parts.length - 1]);
  const description = parts.slice(1, -1).join(" | ").trim();
  if (!date || amount === null || !description) return null;
  return { date, description, amount };
}

// ── CSV ───────────────────────────────────────────────────────────────────────
/**
 * Best-effort CSV parse for an exported statement. Finds the header row by
 * looking for date/description/amount-ish column names in either language,
 * rather than assuming a fixed column order — every bank exports a different
 * shape. Anything it can't map is reported, not guessed.
 */
function parseCsv(text: string, fallbackYear?: number): { items: LineItem[]; error?: string } {
  const rows = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean).map(splitCsvRow);
  if (!rows.length) return { items: [], error: "empty" };

  let headerIdx = -1, dateCol = -1, descCol = -1, amtCol = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = rows[i].map((c) => c.toLowerCase().trim());
    // Word-boundary, not anchored: banks ship "Posting Date",
    // "Transaction Date" and "Date" alike, and an anchored match
    // silently rejects the first two as having no header at all.
    const dc = cells.findIndex((c) => /\bdate\b|\bdata\b/.test(c));
    const sc = cells.findIndex((c) => /desc|merchant|payee|name|hist[óo]rico|estabelecimento/.test(c));
    const ac = cells.findIndex((c) => /amount|debit|charge|valor|montante/.test(c));
    if (dc >= 0 && sc >= 0 && ac >= 0) { headerIdx = i; dateCol = dc; descCol = sc; amtCol = ac; break; }
  }
  if (headerIdx < 0) return { items: [], error: "no-header" };

  const items: LineItem[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length <= Math.max(dateCol, descCol, amtCol)) continue;
    const date = parseDate(r[dateCol], fallbackYear);
    const amount = parseAmount(r[amtCol]);
    const description = (r[descCol] ?? "").trim();
    if (date && amount !== null && amount > 0 && description) items.push({ date, description, amount });
  }
  return { items };
}

function splitCsvRow(row: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      if (inQ && row[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ;
    } else if (ch === "," && !inQ) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

// ── Email rendering ───────────────────────────────────────────────────────────
function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function shell(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:24px 12px;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
    <div style="background:linear-gradient(135deg,#065f46,#14532d);padding:24px 28px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:.1em;color:#6ee7b7;text-transform:uppercase;">LedgerX</p>
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#fff;">${esc(title)}</h1>
    </div>
    <div style="padding:24px 28px;color:#334155;font-size:14px;line-height:1.55;">${bodyHtml}</div>
  </div>
</body></html>`;
}

function itemsTable(items: LineItem[], lang: Lang): string {
  if (!items.length) {
    return `<p style="margin:0 0 16px;color:#b45309;"><strong>${
      lang === "pt-BR" ? "Nenhum lançamento foi lido." : "No line items were read."
    }</strong></p>`;
  }
  const head = lang === "pt-BR" ? ["#", "Data", "Descrição", "Valor"] : ["#", "Date", "Description", "Amount"];
  const rows = items.map((it, i) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;color:#94a3b8;">${i + 1}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;white-space:nowrap;">${esc(it.date)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">${esc(it.description)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:right;white-space:nowrap;">${money(it.amount)}</td>
    </tr>`).join("");
  const total = items.reduce((s, it) => s + it.amount, 0);
  return `
  <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 8px;">
    <thead><tr>${head.map((h, i) => `<th style="padding:6px 8px;text-align:${
      i === 3 ? "right" : "left"
    };border-bottom:2px solid #e2e8f0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">${h}</th>`).join("")}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="margin:0 0 16px;text-align:right;font-weight:700;">${
    lang === "pt-BR" ? "Total" : "Total"}: ${money(total)}</p>`;
}

function metaBlock(d: {
  card_label: string | null; period_start: string | null; period_end: string | null;
}, householdNames: string[], lang: Lang): string {
  const dash = `<span style="color:#dc2626;">${lang === "pt-BR" ? "não informado" : "not set"}</span>`;
  const L = lang === "pt-BR"
    ? { card: "Cartão", period: "Período", hh: "Propriedades", none: "todas" }
    : { card: "Card", period: "Period", hh: "Properties", none: "all" };
  const period = d.period_start && d.period_end
    ? `${esc(d.period_start)} → ${esc(d.period_end)}` : dash;
  return `<div style="background:#f1f5f9;border-radius:10px;padding:12px 16px;margin:0 0 16px;">
    <p style="margin:0 0 4px;"><strong>${L.card}:</strong> ${d.card_label ? esc(d.card_label) : dash}</p>
    <p style="margin:0 0 4px;"><strong>${L.period}:</strong> ${period}</p>
    <p style="margin:0;"><strong>${L.hh}:</strong> ${householdNames.length ? esc(householdNames.join(", ")) : L.none}</p>
  </div>`;
}

function howTo(lang: Lang): string {
  const en = `
  <p style="margin:16px 0 8px;font-weight:700;">Reply to this email to change anything:</p>
  <pre style="margin:0 0 12px;padding:12px 14px;background:#0f172a;color:#e2e8f0;border-radius:10px;font-size:12px;line-height:1.6;overflow-x:auto;white-space:pre-wrap;">card: Chase Ink ...1234
period: 2026-10-01 to 2026-10-31
households: Beach House, Mountain Cabin

3: 2026-10-14 | Home Depot | 128.44     <span style="color:#94a3b8;">(fix line 3)</span>
drop 7, 9                               <span style="color:#94a3b8;">(remove lines)</span>
add: 2026-10-20 | Lowes | 45.00         <span style="color:#94a3b8;">(add a line)</span>

confirm                                 <span style="color:#94a3b8;">(save it)</span>
cancel                                  <span style="color:#94a3b8;">(throw it away)</span></pre>
  <p style="margin:0;color:#64748b;font-size:12px;">Send only the lines you want to change — everything else is kept. Nothing is saved to Reconciliation until you reply <strong>confirm</strong>. Keep the code in the subject line so we know which statement you mean.</p>`;
  const pt = `
  <p style="margin:16px 0 8px;font-weight:700;">Responda a este e-mail para alterar qualquer coisa:</p>
  <pre style="margin:0 0 12px;padding:12px 14px;background:#0f172a;color:#e2e8f0;border-radius:10px;font-size:12px;line-height:1.6;overflow-x:auto;white-space:pre-wrap;">cartão: Chase Ink ...1234
período: 2026-10-01 a 2026-10-31
propriedades: Casa de Praia, Cabana

3: 2026-10-14 | Home Depot | 128,44     <span style="color:#94a3b8;">(corrige a linha 3)</span>
remover 7, 9                            <span style="color:#94a3b8;">(remove linhas)</span>
adicionar: 2026-10-20 | Lowes | 45,00   <span style="color:#94a3b8;">(adiciona uma linha)</span>

confirmar                               <span style="color:#94a3b8;">(salva)</span>
cancelar                                <span style="color:#94a3b8;">(descarta)</span></pre>
  <p style="margin:0;color:#64748b;font-size:12px;">Envie apenas as linhas que quer mudar — o resto é mantido. Nada vai para a Conciliação até você responder <strong>confirmar</strong>. Mantenha o código no assunto para sabermos de qual extrato se trata.</p>`;
  return lang === "pt-BR" ? pt : en;
}

async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) { console.log("[statement-email] RESEND_API_KEY missing — not sending"); return; }
  const from = Deno.env.get("NOTIFICATION_FROM_EMAIL") ?? "LedgerX <notifications@ledger.90ten.life>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) console.error(`[statement-email] Resend failed ${res.status}: ${await res.text()}`);
}

// ── OCR / ingestion helpers ───────────────────────────────────────────────────
const OCR_IMAGE_RE = /^image\/(jpe?g|png|webp|gif)$/i;
const MAX_PAGES = 10;   // matches extract-statement's own cap

async function runStatementOcr(
  images: string[], periodStart?: string, periodEnd?: string,
): Promise<{ items: LineItem[]; error?: string }> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/extract-statement`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Service-role key satisfies the platform JWT gate; extract-statement
      // does no per-user authorization of its own.
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({
      images: images.slice(0, MAX_PAGES),
      periodStart, periodEnd,
      today: new Date().toISOString().slice(0, 10),
    }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    console.error(`[statement-email] extract-statement ${res.status}: ${detail}`);
    return { items: [], error: `OCR failed (${res.status})` };
  }
  const json = await res.json().catch(() => ({}));
  const raw = Array.isArray(json.line_items) ? json.line_items : [];
  const items: LineItem[] = [];
  for (const r of raw) {
    const date = typeof r?.date === "string" ? r.date : null;
    const amount = typeof r?.amount === "number" ? Math.abs(r.amount) : parseAmount(String(r?.amount ?? ""));
    const description = typeof r?.description === "string" ? r.description.trim() : "";
    if (date && amount !== null && amount > 0 && description) items.push({ date, description, amount });
  }
  return { items };
}

function extFor(mime: string, filename: string): string {
  const fromName = filename.includes(".") ? filename.split(".").pop()! : "";
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  if (/pdf/i.test(mime)) return "pdf";
  if (/csv/i.test(mime)) return "csv";
  if (/png/i.test(mime)) return "png";
  return "jpg";
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const payload = await req.json();
    const secret = Deno.env.get("INBOUND_EMAIL_SECRET");
    if (!secret || payload?.secret !== secret) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const senderAddress = String(payload.from_email ?? "").trim().toLowerCase();
    const subject = String(payload.subject ?? "");
    const body = String(payload.body_text ?? payload.body_html ?? "");
    const attachments: Attachment[] = Array.isArray(payload.attachments) ? payload.attachments : [];

    const { data: userId } = await supabase.rpc("resolve_sender_email", { p_email: senderAddress });
    if (!userId) { console.log(`[statement-email] unresolved sender ${senderAddress}`); return json({ ok: true, matched: false }); }

    // Full admins only. inbound-email already checks this before routing here;
    // re-checking means the function is still safe if it is ever called directly.
    const { data: roleRow } = await supabase
      .from("user_roles").select("is_admin").eq("user_id", userId).maybeSingle();
    if (!roleRow?.is_admin) { console.log(`[statement-email] non-admin ${senderAddress} — ignoring`); return json({ ok: true, matched: false }); }

    const { data: profile } = await supabase
      .from("user_profiles").select("preferred_language").eq("id", userId).maybeSingle();
    const lang: Lang = profile?.preferred_language === "pt-BR" ? "pt-BR" : "en";

    const token = tokenFromSubject(subject);
    return token
      ? await handleReply(supabase, { token, senderAddress, subject, body, userId, lang }, json)
      : await handleKickoff(supabase, { senderAddress, subject, body, attachments, userId, lang }, json);
  } catch (err) {
    console.error("[statement-email] error:", err);
    return json({ error: String(err) }, 500);
  }
});

type DB = ReturnType<typeof createClient>;
type Json = (b: unknown, status?: number) => Response;

/** The columns of statement_email_drafts this function actually reads. */
interface DraftRow {
  id: string;
  user_id: string;
  card_label: string | null;
  period_start: string | null;
  period_end: string | null;
  household_ids: string[];
  file_path: string | null;
  file_mime: string | null;
  source_type: "csv" | "pdf" | "image";
  line_items: LineItem[];
  status: "draft" | "confirmed" | "cancelled" | "error";
  expires_at: string;
}

async function resolveHouseholds(supabase: DB, names: string[]): Promise<{ ids: string[]; missing: string[] }> {
  if (!names.length) return { ids: [], missing: [] };
  const { data } = await supabase.from("households").select("id, name");
  const all = (data ?? []) as Array<{ id: string; name: string }>;
  const ids: string[] = [], missing: string[] = [];
  for (const n of names) {
    const hit = all.find((h) => h.name.toLowerCase() === n.toLowerCase())
      ?? all.find((h) => h.name.toLowerCase().includes(n.toLowerCase()));
    if (hit) ids.push(hit.id); else missing.push(n);
  }
  return { ids: Array.from(new Set(ids)), missing };
}

async function householdNames(supabase: DB, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const { data } = await supabase.from("households").select("name").in("id", ids);
  return ((data ?? []) as Array<{ name: string }>).map((h) => h.name);
}

// ── Kickoff: first email, with the statement attached ─────────────────────────
async function handleKickoff(
  supabase: DB,
  ctx: { senderAddress: string; subject: string; body: string; attachments: Attachment[]; userId: string; lang: Lang },
  json: Json,
): Promise<Response> {
  const { senderAddress, subject, body, attachments, userId, lang } = ctx;

  const d = parseDirectives(body);
  // "statement Chase Ink ...1234" — anything after the command word in the
  // subject is taken as the card label when the body didn't name one.
  const fromSubject = subject.replace(/^\s*(statement|stmt|extrato)\b[\s:–—-]*/i, "").trim();
  const cardLabel = d.card ?? (fromSubject || null);

  const csv = attachments.find((a) => /csv|text\/plain/i.test(a.content_type) || /\.csv$/i.test(a.filename));
  const pdf = attachments.find((a) => /pdf/i.test(a.content_type) || /\.pdf$/i.test(a.filename));
  const images = attachments.filter((a) => OCR_IMAGE_RE.test(a.content_type));

  if (!csv && !pdf && !images.length) {
    await sendMail(senderAddress, lang === "pt-BR" ? "Nenhum extrato anexado" : "No statement attached",
      shell(lang === "pt-BR" ? "Nenhum extrato anexado" : "No statement attached",
        `<p style="margin:0;">${lang === "pt-BR"
          ? "Anexe o extrato (PDF, imagem ou CSV) e envie de novo."
          : "Attach the statement (PDF, image, or CSV) and send it again."}</p>${howTo(lang)}`));
    return json({ ok: true, matched: true, result: "no-attachment" });
  }

  const draftId = crypto.randomUUID();
  const source = csv ?? pdf ?? images[0];
  const sourceType: "csv" | "pdf" | "image" = csv ? "csv" : pdf ? "pdf" : "image";

  // Keep the original document, exactly as the in-app upload does, so the
  // finished statement is still auditable against what the bank sent.
  const path = `statements/${draftId}.${extFor(source.content_type, source.filename)}`;
  const bytes = Uint8Array.from(atob(source.data), (c) => c.charCodeAt(0));
  const { error: upErr } = await supabase.storage.from("receipts")
    .upload(path, bytes, { contentType: source.content_type, upsert: false });
  if (upErr) console.error(`[statement-email] upload failed: ${upErr.message}`);

  const fallbackYear = d.periodStart ? parseInt(d.periodStart.slice(0, 4), 10) : undefined;
  let items: LineItem[] = [];
  let ingestError: string | undefined;

  if (csv) {
    const parsed = parseCsv(new TextDecoder().decode(Uint8Array.from(atob(csv.data), (c) => c.charCodeAt(0))), fallbackYear);
    items = parsed.items;
    if (parsed.error === "no-header") {
      ingestError = lang === "pt-BR"
        ? "Não encontrei colunas de data/descrição/valor no CSV."
        : "Couldn't find date/description/amount columns in that CSV.";
    }
  } else if (images.length) {
    // PDFs arrive as rasterized page images ahead of the PDF itself (the VPS
    // poller renders them), so this covers both the PDF and image paths.
    const r = await runStatementOcr(images.map((a) => a.data), d.periodStart, d.periodEnd);
    items = r.items; ingestError = r.error;
  } else {
    ingestError = lang === "pt-BR"
      ? "O PDF não pôde ser convertido em imagens para leitura."
      : "That PDF couldn't be converted to page images for reading.";
  }

  const { ids: householdIds, missing } = await resolveHouseholds(supabase, d.households ?? []);

  const token = newToken();
  const { error: insErr } = await supabase.from("statement_email_drafts").insert({
    id: draftId, token, user_id: userId,
    card_label: cardLabel, period_start: d.periodStart ?? null, period_end: d.periodEnd ?? null,
    household_ids: householdIds, file_path: upErr ? null : path,
    file_mime: source.content_type, source_type: sourceType,
    line_items: items, status: "draft",
  });
  if (insErr) { console.error(`[statement-email] draft insert failed: ${insErr.message}`); return json({ error: insErr.message }, 500); }

  await sendDraftEmail(supabase, {
    to: senderAddress, token, lang,
    draft: { card_label: cardLabel, period_start: d.periodStart ?? null, period_end: d.periodEnd ?? null, household_ids: householdIds },
    items, notes: buildNotes(lang, { ingestError, missing, unknown: d.unknown, pageCount: images.length }),
  });

  console.log(`[statement-email] draft ${token} created items=${items.length} src=${sourceType}`);
  return json({ ok: true, matched: true, token, items: items.length });
}

function buildNotes(
  lang: Lang,
  o: { ingestError?: string; missing: string[]; unknown: string[]; pageCount?: number },
): string[] {
  const n: string[] = [];
  if (o.ingestError) n.push(o.ingestError);
  if (o.pageCount && o.pageCount >= MAX_PAGES) {
    n.push(lang === "pt-BR"
      ? `Apenas as primeiras ${MAX_PAGES} páginas foram lidas.`
      : `Only the first ${MAX_PAGES} pages were read.`);
  }
  if (o.missing.length) {
    n.push(lang === "pt-BR"
      ? `Propriedade não encontrada: ${o.missing.join(", ")}.`
      : `Couldn't find these properties: ${o.missing.join(", ")}.`);
  }
  if (o.unknown.length) {
    n.push((lang === "pt-BR" ? "Linhas que não entendi: " : "Lines I didn't understand: ")
      + o.unknown.slice(0, 5).map((u) => `"${u}"`).join(", "));
  }
  return n;
}

async function sendDraftEmail(
  supabase: DB,
  o: {
    to: string; token: string; lang: Lang; notes: string[]; items: LineItem[];
    draft: { card_label: string | null; period_start: string | null; period_end: string | null; household_ids: string[] };
  },
): Promise<void> {
  const names = await householdNames(supabase, o.draft.household_ids);
  const title = o.lang === "pt-BR" ? "Rascunho de extrato" : "Statement draft";
  const subject = `[LX-${o.token}] ${title}${o.draft.card_label ? ` — ${o.draft.card_label}` : ""}`;

  const missingCard = !o.draft.card_label;
  const warn = missingCard
    ? `<p style="margin:0 0 12px;padding:10px 14px;background:#fef3c7;border-radius:8px;color:#92400e;">${
        o.lang === "pt-BR"
          ? "Falta o nome do cartão — responda com <strong>cartão: ...</strong> antes de confirmar."
          : "The card name is missing — reply with <strong>card: ...</strong> before confirming."}</p>`
    : "";
  const notesHtml = o.notes.length
    ? `<div style="margin:0 0 12px;padding:10px 14px;background:#fff7ed;border-radius:8px;color:#9a3412;">${
        o.notes.map((n) => `<p style="margin:0 0 4px;">${esc(n)}</p>`).join("")}</div>`
    : "";

  await sendMail(o.to, subject, shell(title,
    `<p style="margin:0 0 12px;">${o.lang === "pt-BR"
      ? `Li <strong>${o.items.length}</strong> lançamento(s). Confira e corrija o que precisar — nada é salvo até você responder <strong>confirmar</strong>.`
      : `I read <strong>${o.items.length}</strong> line item(s). Check them over and fix anything that's wrong — nothing is saved until you reply <strong>confirm</strong>.`}</p>
     ${warn}${notesHtml}
     ${metaBlock(o.draft, names, o.lang)}
     ${itemsTable(o.items, o.lang)}
     ${howTo(o.lang)}`));
}

// ── Reply: corrections, confirm, or cancel ────────────────────────────────────
async function handleReply(
  supabase: DB,
  ctx: { token: string; senderAddress: string; subject: string; body: string; userId: string; lang: Lang },
  json: Json,
): Promise<Response> {
  const { token, senderAddress, body, userId, lang } = ctx;

  const { data: draftRow } = await supabase
    .from("statement_email_drafts").select("*").eq("token", token).maybeSingle();
  const draft = draftRow as DraftRow | null;

  if (!draft || draft.user_id !== userId) {
    await sendMail(senderAddress, lang === "pt-BR" ? "Rascunho não encontrado" : "Draft not found",
      shell(lang === "pt-BR" ? "Rascunho não encontrado" : "Draft not found",
        `<p style="margin:0;">${lang === "pt-BR"
          ? `Não encontrei o rascunho <strong>${esc(token)}</strong>. Envie o extrato de novo com o assunto <strong>statement</strong>.`
          : `I couldn't find draft <strong>${esc(token)}</strong>. Send the statement again with subject <strong>statement</strong>.`}</p>`));
    return json({ ok: true, matched: false });
  }

  if (draft.status !== "draft") {
    const already = lang === "pt-BR"
      ? (draft.status === "confirmed" ? "Esse extrato já foi confirmado e salvo." : "Esse rascunho já foi descartado.")
      : (draft.status === "confirmed" ? "That statement was already confirmed and saved." : "That draft was already discarded.");
    await sendMail(senderAddress, lang === "pt-BR" ? "Nada a fazer" : "Nothing to do",
      shell(lang === "pt-BR" ? "Nada a fazer" : "Nothing to do", `<p style="margin:0;">${already}</p>`));
    return json({ ok: true, matched: true, result: "already-" + draft.status });
  }

  if (new Date(draft.expires_at).getTime() < Date.now()) {
    await supabase.from("statement_email_drafts").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", draft.id);
    await sendMail(senderAddress, lang === "pt-BR" ? "Rascunho expirado" : "Draft expired",
      shell(lang === "pt-BR" ? "Rascunho expirado" : "Draft expired",
        `<p style="margin:0;">${lang === "pt-BR"
          ? "Esse rascunho passou de 14 dias e foi descartado. Envie o extrato de novo."
          : "That draft is more than 14 days old and has been discarded. Send the statement again."}</p>`));
    return json({ ok: true, matched: true, result: "expired" });
  }

  const fallbackYear = draft.period_start ? parseInt(String(draft.period_start).slice(0, 4), 10) : undefined;
  const d = parseDirectives(body, fallbackYear);

  if (d.cancel) {
    await supabase.from("statement_email_drafts")
      .update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", draft.id);
    await sendMail(senderAddress, lang === "pt-BR" ? "Rascunho descartado" : "Draft discarded",
      shell(lang === "pt-BR" ? "Rascunho descartado" : "Draft discarded",
        `<p style="margin:0;">${lang === "pt-BR"
          ? "Pronto — nada foi salvo na Conciliação."
          : "Done — nothing was saved to Reconciliation."}</p>`));
    return json({ ok: true, matched: true, result: "cancelled" });
  }

  // Apply metadata changes.
  const cardLabel: string | null = d.card ?? draft.card_label;
  const periodStart = d.periodStart ?? draft.period_start;
  const periodEnd = d.periodEnd ?? draft.period_end;
  let householdIds: string[] = draft.household_ids ?? [];
  let missing: string[] = [];
  if (d.households) {
    const r = await resolveHouseholds(supabase, d.households);
    householdIds = r.ids; missing = r.missing;
  }

  // Line edits all resolve against the numbering the admin was looking at, so
  // "drop 7, 9" means the rows printed as 7 and 9 — not whatever those
  // positions become after an earlier edit shifts the array.
  const items: LineItem[] = Array.isArray(draft.line_items) ? [...draft.line_items] : [];
  const outOfRange: number[] = [];
  for (const e of d.edits) {
    if (e.index >= 1 && e.index <= items.length) items[e.index - 1] = e.item;
    else outOfRange.push(e.index);
  }
  const dropSet = new Set<number>();
  for (const n of d.drops) {
    if (n >= 1 && n <= items.length) dropSet.add(n); else outOfRange.push(n);
  }
  let next = items.filter((_, i) => !dropSet.has(i + 1));
  next = next.concat(d.adds);
  next.sort((a, b) => a.date.localeCompare(b.date));

  const notes = buildNotes(lang, { missing, unknown: d.unknown });
  if (outOfRange.length) {
    notes.push(lang === "pt-BR"
      ? `Número de linha fora do intervalo: ${outOfRange.join(", ")}.`
      : `Line number out of range: ${outOfRange.join(", ")}.`);
  }

  // ── Confirm ────────────────────────────────────────────────────────────────
  if (d.confirm) {
    if (!cardLabel) {
      notes.push(lang === "pt-BR"
        ? "Não dá para confirmar sem o nome do cartão."
        : "Can't confirm without a card name.");
    } else if (!next.length) {
      notes.push(lang === "pt-BR"
        ? "Não dá para confirmar um extrato sem lançamentos."
        : "Can't confirm a statement with no line items.");
    } else {
      return await finalize(supabase, {
        draft, cardLabel, periodStart, periodEnd, householdIds, items: next,
        senderAddress, lang, token,
      }, json);
    }
  }

  await supabase.from("statement_email_drafts").update({
    card_label: cardLabel, period_start: periodStart, period_end: periodEnd,
    household_ids: householdIds, line_items: next, updated_at: new Date().toISOString(),
  }).eq("id", draft.id);

  await sendDraftEmail(supabase, {
    to: senderAddress, token, lang, items: next, notes,
    draft: { card_label: cardLabel, period_start: periodStart, period_end: periodEnd, household_ids: householdIds },
  });

  console.log(`[statement-email] draft ${token} updated items=${next.length}`);
  return json({ ok: true, matched: true, token, items: next.length });
}

// ── Finalize: draft becomes a real statement ──────────────────────────────────
async function finalize(
  supabase: DB,
  o: {
    draft: DraftRow; cardLabel: string; periodStart: string | null; periodEnd: string | null;
    householdIds: string[]; items: LineItem[]; senderAddress: string; lang: Lang; token: string;
  },
  json: Json,
): Promise<Response> {
  const { draft, cardLabel, periodStart, periodEnd, householdIds, items, senderAddress, lang, token } = o;

  // uploaded_by must be set explicitly: the column default and the
  // statements_set_uploaded_by trigger both read auth.uid(), which is NULL
  // under the service role, and the column is NOT NULL.
  const { data: statement, error: stErr } = await supabase
    .from("credit_card_statements").insert({
      uploaded_by: draft.user_id,
      card_label: cardLabel,
      period_start: periodStart, period_end: periodEnd,
      file_path: draft.file_path ?? "pending",
      file_mime: draft.file_mime,
      source_type: draft.source_type,
      status: "ready",
    }).select("id").single();

  if (stErr || !statement) {
    console.error(`[statement-email] statement insert failed: ${stErr?.message}`);
    await supabase.from("statement_email_drafts")
      .update({ status: "error", error_message: stErr?.message ?? "insert failed", updated_at: new Date().toISOString() })
      .eq("id", draft.id);
    await sendMail(senderAddress, lang === "pt-BR" ? "Falha ao salvar" : "Couldn't save",
      shell(lang === "pt-BR" ? "Falha ao salvar" : "Couldn't save",
        `<p style="margin:0;">${lang === "pt-BR"
          ? "Algo deu errado ao salvar o extrato. Nada foi criado."
          : "Something went wrong saving the statement. Nothing was created."}</p>`));
    return json({ error: stErr?.message }, 500);
  }

  const { error: liErr } = await supabase.from("statement_line_items").insert(
    items.map((it) => ({
      statement_id: statement.id, line_date: it.date,
      description: it.description, amount: it.amount, currency: "USD",
    })));
  if (liErr) console.error(`[statement-email] line items failed: ${liErr.message}`);

  if (householdIds.length) {
    const { error: hhErr } = await supabase.from("statement_households")
      .insert(householdIds.map((h) => ({ statement_id: statement.id, household_id: h })));
    if (hhErr) console.error(`[statement-email] households failed: ${hhErr.message}`);
  }

  await supabase.from("statement_email_drafts").update({
    status: "confirmed", statement_id: statement.id,
    card_label: cardLabel, period_start: periodStart, period_end: periodEnd,
    household_ids: householdIds, line_items: items, updated_at: new Date().toISOString(),
  }).eq("id", draft.id);

  const appUrl = Deno.env.get("APP_URL") ?? "https://ledger.90ten.life";
  const names = await householdNames(supabase, householdIds);
  const total = items.reduce((s, it) => s + it.amount, 0);
  const title = lang === "pt-BR" ? "Extrato salvo" : "Statement saved";

  await sendMail(senderAddress, `[LX-${token}] ${title} — ${cardLabel}`, shell(title,
    `<p style="margin:0 0 12px;">${lang === "pt-BR"
      ? `<strong>${items.length}</strong> lançamento(s), total ${money(total)}. Já está disponível na Conciliação.`
      : `<strong>${items.length}</strong> line item(s), ${money(total)} total. It's in Reconciliation now.`}</p>
     ${metaBlock({ card_label: cardLabel, period_start: periodStart, period_end: periodEnd }, names, lang)}
     <a href="${appUrl}" style="display:inline-block;background:linear-gradient(135deg,#059669,#0d9488);color:#fff;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;">${
       lang === "pt-BR" ? "Abrir o LedgerX →" : "Open LedgerX →"}</a>`));

  console.log(`[statement-email] draft ${token} CONFIRMED statement=${statement.id} items=${items.length}`);
  return json({ ok: true, matched: true, confirmed: true, statement_id: statement.id });
}
