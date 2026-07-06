/**
 * whatsapp-inbound edge function
 *
 * Twilio WhatsApp webhook. Users text the LedgerX number to:
 *   - create an expense / contractor invoice / estimate (natural language,
 *     parsed by OpenAI, always confirmed with YES before anything is written)
 *   - add photos to an existing invoice or estimate
 *   - run the keyword reports (help / estimates / invoices / pending / todo /
 *     activity — same commands and RPCs as the email bot)
 *
 * Security model:
 *   1. Every request must carry a valid X-Twilio-Signature (HMAC-SHA1 over
 *      the exact public webhook URL + sorted form params, keyed with the
 *      Twilio auth token). The URL is pinned via the TWILIO_WEBHOOK_URL
 *      secret — never derived from req.url, which the platform proxy rewrites.
 *   2. The sender phone must resolve via the admin-managed allow-list
 *      (user_phone_numbers / resolve_sender_phone). Unknown numbers get one
 *      generic decline line — no feature list, no info leak.
 *   3. MessageSid dedup (whatsapp_inbound_dedup) makes Twilio retries no-ops.
 *   4. The bot runs as service role (bypasses RLS), so EVERY write re-checks
 *      permissions in code — same convention as the email_command_* RPCs.
 *
 * Latency model: the webhook returns an empty TwiML response immediately and
 * does the real work (LLM parse, OCR, storage moves) in
 * EdgeRuntime.waitUntil(); replies go out via the Twilio REST Messages API.
 *
 * Conversation state lives in whatsapp_sessions (one row per phone):
 *   idle → collecting (draft with missing fields) → awaiting_confirmation
 *   (summary sent, waiting for YES/NO) → idle. add_photos with several
 *   plausible targets passes through choosing_target (numbered pick).
 *   Media is staged under whatsapp-staging/ in the receipts bucket and only
 *   moved into the household folder when the user confirms.
 *
 * Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM,
 * TWILIO_WEBHOOK_URL, OPENAI_API_KEY, APP_URL, SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

type Lang = "en" | "pt-BR";

interface StagedMedia {
  path: string;
  mime: string;
}

interface DraftFields {
  household?: string | null; // verbatim name hint from the user
  household_id?: string | null; // resolved uuid (code-side)
  household_name?: string | null;
  vendor?: string | null;
  total?: number | null;
  date?: string | null;
  category?: string | null;
  notes?: string | null;
  amount?: number | null;
  currency?: string | null;
  description?: string | null;
  service_date_start?: string | null;
  service_date_end?: string | null;
  invoice_number?: string | null;
  title?: string | null;
  billing_type?: string | null;
  target_type?: string | null;
  target_hint?: string | null;
  target_id?: string | null;
  target_label?: string | null;
}

interface PendingAction {
  intent: string | null;
  fields: DraftFields;
  staged_media: StagedMedia[];
  candidates?: Array<{ id: string; type: string; label: string }>;
  ocr_done?: boolean;
  // Raw OCR result, kept separate so it can be (re)applied under whatever
  // intent is eventually decided — total vs amount land in different fields.
  ocr?: Record<string, unknown>;
}

interface BotContext {
  is_admin: boolean;
  is_household_admin: boolean;
  is_contractor: boolean;
  username: string;
  preferred_language: string;
  notify_channel: string;
  households: Array<{ id: string; name: string }>;
}

// ── Localized strings ─────────────────────────────────────────────────────────
const STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    unknownNumber:
      "This number is not registered with LedgerX. / Este número não está cadastrado no LedgerX.",
    help:
      "Hi @{username}! Here's what you can do:\n" +
      "• Send a photo of a receipt or invoice — I'll read it and file it after you confirm.\n" +
      '• Or just tell me, e.g. *"add a $120 plumbing invoice for {household}"* or *"$45 groceries at Publix for {household}"*.\n' +
      "• *add photos to my last invoice* — attach pictures to an existing invoice or estimate.\n" +
      "• Reports: *estimates* · *invoices* · *pending* · *activity* (admins).\n" +
      "• *cancel* — discard the current draft.",
    adminOnly: "This command is only available to admins and household admins.",
    unknown:
      "Sorry, I didn't catch that. Send *help* to see what I can do, or try something like \"add a $50 expense for {household}\".",
    draftExpired: "Your previous draft expired, so I started fresh.\n\n",
    cancelled: "❌ Draft discarded. Nothing was saved.",
    nothingToCancel: "There's no draft in progress. Send *help* to see what I can do.",
    confirmPrompt: "Reply *YES* to confirm or *NO* to cancel.",
    yesOrNo: "Please reply *YES* to confirm, *NO* to cancel — or tell me what to change.",
    mediaRejected: "⚠️ {count} attachment(s) skipped (unsupported format — please send JPEG, PNG, WEBP or PDF).",
    mediaStaged: "📎 Got {count} attachment(s).",
    whichHousehold: "Which household is this for? Your households: {households}.",
    householdAmbiguous: "Which household did you mean: {households}?",
    noHouseholds: "You aren't a member of any household yet, so I can't file this. Ask an admin.",
    estimateNeedsFile: "An estimate needs at least one photo or PDF attached. Send it and I'll add it to the draft.",
    invoiceRoleDenied: "Only contractors, household admins and admins can submit invoices.",
    rateLimited: "You've hit the hourly limit for the assistant. Plain commands (*help*, *pending*, …) still work — try again later.",
    genericError: "⚠️ Something went wrong on my side — nothing was created. Please try again.",
    createdExpense: "✅ Expense saved: {summary}",
    createdInvoice: "✅ Invoice submitted: {summary}",
    createdEstimate: "✅ Estimate submitted: {summary}",
    photosAdded: "✅ Added {count} photo(s) to {label}.",
    summaryExpense: "New expense — {vendor}, {amount}, {date}, household *{household}*{category}{photos}.",
    summaryInvoice: "New invoice — {amount}, \"{description}\", service {start} → {end}, household *{household}*{number}{photos}.",
    summaryEstimate: "New estimate — \"{title}\", {billing}, household *{household}*{photos}.",
    summaryAddPhotos: "Add {count} photo(s) to {label}.",
    billingTotal: "total billing",
    billingLabor: "labor only",
    noCategory: "",
    targetNotFound: "I couldn't find a matching invoice or estimate you can add photos to.",
    targetChoose: "Which one did you mean? Reply with a number:\n{list}",
    targetNeedsMedia: "Attach the photo(s) you want to add and I'll take care of it.",
    view: "View",
    missingAmount: "What's the amount?",
    missingDescription: "What's the invoice for? (a short description)",
    missingDates: "What service date is this for? (e.g. 2026-07-05, or a range)",
    missingTitle: "What should the estimate be called?",
    missingTotal: "What's the total amount?",
    open: "Open LedgerX",
    reportPending: "*What needs attention*\nInvoices awaiting approval: *{invoices_pending}*\nEstimates open >2 weeks: *{estimates_aging}*",
    reportPendingUncat: "\nUncategorized transactions: *{uncategorized}*",
    reportActivity: "*Last 7 days*\nNew estimates: *{new_estimates}*\nNew invoices: *{new_invoices}*\nNew receipts: *{new_expenses}*\nMembers inactive >2 weeks: *{inactive_members}*",
    reportEstimates: "*Estimates*\nOpen: *{open}*\nAccepted: *{accepted}*\nRejected: *{rejected}*\nTotal: *{total}*\nAcceptance rate: *{rate}*\nAwaiting decision >2 weeks: *{aging}*",
    reportInvoices: "*Invoices*\nPending: *{pending}*\nPaid: *{paid}*\nPending total: *{pending_total}*",
  },
  "pt-BR": {
    unknownNumber:
      "This number is not registered with LedgerX. / Este número não está cadastrado no LedgerX.",
    help:
      "Olá @{username}! Você pode:\n" +
      "• Enviar a foto de um recibo ou fatura — eu leio e registro depois que você confirmar.\n" +
      '• Ou simplesmente dizer, ex.: *"adicionar fatura de encanador de R$120 para {household}"* ou *"R$45 de mercado no Extra para {household}"*.\n' +
      "• *adicionar fotos à minha última fatura* — anexa imagens a uma fatura ou orçamento existente.\n" +
      "• Relatórios: *estimates* · *invoices* · *pending* · *activity* (administradores).\n" +
      "• *cancelar* — descarta o rascunho atual.",
    adminOnly: "Este comando está disponível apenas para administradores e administradores de residência.",
    unknown:
      'Desculpe, não entendi. Envie *help* para ver o que posso fazer, ou tente algo como "adicionar despesa de R$50 para {household}".',
    draftExpired: "Seu rascunho anterior expirou, então comecei um novo.\n\n",
    cancelled: "❌ Rascunho descartado. Nada foi salvo.",
    nothingToCancel: "Não há rascunho em andamento. Envie *help* para ver o que posso fazer.",
    confirmPrompt: "Responda *SIM* para confirmar ou *NÃO* para cancelar.",
    yesOrNo: "Responda *SIM* para confirmar, *NÃO* para cancelar — ou me diga o que mudar.",
    mediaRejected: "⚠️ {count} anexo(s) ignorado(s) (formato não suportado — envie JPEG, PNG, WEBP ou PDF).",
    mediaStaged: "📎 Recebi {count} anexo(s).",
    whichHousehold: "Para qual residência? Suas residências: {households}.",
    householdAmbiguous: "Qual residência você quis dizer: {households}?",
    noHouseholds: "Você ainda não é membro de nenhuma residência, então não posso registrar isso. Fale com um administrador.",
    estimateNeedsFile: "Um orçamento precisa de pelo menos uma foto ou PDF anexado. Envie que eu adiciono ao rascunho.",
    invoiceRoleDenied: "Apenas prestadores, administradores de residência e administradores podem enviar faturas.",
    rateLimited: "Você atingiu o limite por hora do assistente. Comandos simples (*help*, *pending*, …) continuam funcionando — tente de novo mais tarde.",
    genericError: "⚠️ Algo deu errado do meu lado — nada foi criado. Tente novamente.",
    createdExpense: "✅ Despesa salva: {summary}",
    createdInvoice: "✅ Fatura enviada: {summary}",
    createdEstimate: "✅ Orçamento enviado: {summary}",
    photosAdded: "✅ {count} foto(s) adicionada(s) a {label}.",
    summaryExpense: "Nova despesa — {vendor}, {amount}, {date}, residência *{household}*{category}{photos}.",
    summaryInvoice: "Nova fatura — {amount}, \"{description}\", serviço {start} → {end}, residência *{household}*{number}{photos}.",
    summaryEstimate: "Novo orçamento — \"{title}\", {billing}, residência *{household}*{photos}.",
    summaryAddPhotos: "Adicionar {count} foto(s) a {label}.",
    billingTotal: "cobrança total",
    billingLabor: "somente mão de obra",
    noCategory: "",
    targetNotFound: "Não encontrei uma fatura ou orçamento correspondente ao qual você possa adicionar fotos.",
    targetChoose: "Qual deles? Responda com um número:\n{list}",
    targetNeedsMedia: "Anexe a(s) foto(s) que você quer adicionar e eu cuido do resto.",
    view: "Ver",
    missingAmount: "Qual é o valor?",
    missingDescription: "A fatura é referente a quê? (uma descrição curta)",
    missingDates: "Qual a data do serviço? (ex.: 2026-07-05, ou um período)",
    missingTitle: "Qual deve ser o nome do orçamento?",
    missingTotal: "Qual é o valor total?",
    open: "Abrir o LedgerX",
    reportPending: "*O que precisa de atenção*\nFaturas aguardando aprovação: *{invoices_pending}*\nOrçamentos abertos há >2 semanas: *{estimates_aging}*",
    reportPendingUncat: "\nTransações sem categoria: *{uncategorized}*",
    reportActivity: "*Últimos 7 dias*\nNovos orçamentos: *{new_estimates}*\nNovas faturas: *{new_invoices}*\nNovos recibos: *{new_expenses}*\nMembros sem acesso há >2 semanas: *{inactive_members}*",
    reportEstimates: "*Orçamentos*\nEm aberto: *{open}*\nAceitos: *{accepted}*\nRecusados: *{rejected}*\nTotal: *{total}*\nTaxa de aceitação: *{rate}*\nAguardando decisão há >2 semanas: *{aging}*",
    reportInvoices: "*Faturas*\nPendentes: *{pending}*\nPagas: *{paid}*\nTotal pendente: *{pending_total}*",
  },
};

function t(lang: Lang, key: string, vars: Record<string, string | number> = {}): string {
  let s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

// ── Twilio signature validation ───────────────────────────────────────────────
// base64(HMAC-SHA1(url + concat(sorted keys + values), authToken)). The URL
// must be the EXACT public URL Twilio posted to — pinned via secret.
async function computeTwilioSignature(
  authToken: string,
  url: string,
  params: URLSearchParams,
): Promise<string> {
  const keys = [...new Set([...params.keys()])].sort();
  let data = url;
  for (const k of keys) data += k + (params.get(k) ?? "");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function twiml(message?: string): Response {
  const inner = message ? `<Message>${xmlEscape(message)}</Message>` : "";
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function normalizePhone(from: string): string {
  return from.replace(/^whatsapp:/i, "").trim();
}

const KNOWN_COMMANDS = ["help", "estimates", "invoices", "pending", "todo", "activity"];

const YES_WORDS = ["yes", "y", "sim", "s", "confirm", "confirmar", "confirmo"];
const NO_WORDS = ["no", "n", "não", "nao", "cancel", "cancelar", "cancela"];

function normalizeWord(body: string): string {
  return body.trim().toLowerCase().replace(/^[^a-zà-ú]+|[^a-zà-ú]+$/g, "");
}

function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  return y >= 2000 && y <= 2100;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseAmount(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) return null;
  return Math.round(n * 100) / 100;
}

function fmtMoney(amount: number, currency: string): string {
  const sym = currency === "BRL" ? "R$" : "$";
  return `${sym}${amount.toFixed(2)}`;
}

function extFromMime(mime: string): string {
  if (/jpe?g/i.test(mime)) return "jpg";
  if (/png/i.test(mime)) return "png";
  if (/webp/i.test(mime)) return "webp";
  if (/pdf/i.test(mime)) return "pdf";
  return "bin";
}

function isSupportedMedia(mime: string): boolean {
  return /^image\/(jpe?g|png|webp)$/i.test(mime) || /^application\/pdf$/i.test(mime);
}

// ── Twilio REST reply ─────────────────────────────────────────────────────────
async function sendWhatsApp(to: string, body: string): Promise<void> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
  const token = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
  const from = Deno.env.get("TWILIO_WHATSAPP_FROM") ?? "";
  if (!sid || !token || !from) {
    console.error("[whatsapp-inbound] Twilio secrets missing — cannot reply");
    return;
  }
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: `whatsapp:${from}`,
        To: `whatsapp:${to}`,
        Body: body.slice(0, 1500),
      }),
    },
  );
  if (!res.ok) {
    console.error(`[whatsapp-inbound] reply send failed (${res.status}): ${await res.text()}`);
  }
}

// ── OpenAI calls ──────────────────────────────────────────────────────────────
interface ParsedIntent {
  intent: string;
  fields: Record<string, unknown>;
  missing: string[];
  clarify: string | null;
}

async function parseIntent(
  apiKey: string,
  body: string,
  ctx: BotContext,
  draft: PendingAction | null,
  lang: Lang,
): Promise<ParsedIntent | null> {
  const householdNames = ctx.households.map((h) => h.name);
  const system = `You are the intake parser for LedgerX, a household expense tracker.
Today is ${todayIso()}. The user writes in English or Brazilian Portuguese.
User's households: ${JSON.stringify(householdNames)}.
Prior draft fields (merge new info into these, do not discard them): ${JSON.stringify(draft?.fields ?? null)}.
Prior draft intent: ${JSON.stringify(draft?.intent ?? null)}. Staged attachments: ${draft?.staged_media?.length ?? 0}.
Return ONLY JSON:
{
  "intent": "create_expense" | "create_invoice" | "create_estimate" | "add_photos"
          | "report_estimates" | "report_invoices" | "report_pending" | "report_activity"
          | "help" | "cancel" | "unknown",
  "fields": {
    "household": "verbatim household name from the user's message, or null",
    "vendor": "expense: store/business name or null",
    "total": "expense: number or null",
    "date": "expense: YYYY-MM-DD or null",
    "category": "expense: category name or null",
    "notes": "expense: extra notes or null",
    "amount": "invoice: number or null",
    "currency": "USD" | "BRL" | null,
    "description": "invoice: what it is for, or null",
    "service_date_start": "invoice: YYYY-MM-DD or null",
    "service_date_end": "invoice: YYYY-MM-DD or null",
    "invoice_number": "invoice: string or null",
    "title": "estimate: short title or null",
    "billing_type": "estimate: 'total' | 'labor_only' | null",
    "target_type": "add_photos: 'invoice' | 'estimate' | null",
    "target_hint": "add_photos: free text identifying the record ('last invoice', an invoice number, a title fragment) or null"
  },
  "missing": ["field names you could not infer"],
  "clarify": "ONE short question to ask the user, in ${lang === "pt-BR" ? "Brazilian Portuguese" : "English"}, or null"
}
Rules:
- A receipt/purchase is create_expense. A bill for work performed is create_invoice. A quote/proposal for future work is create_estimate.
- If the prior draft intent is set and the new message just fills in details, keep the same intent.
- Amounts: normalize pt-BR "1.234,56" to 1234.56. Dates: resolve "yesterday"/"ontem"/"today"/"hoje" against today's date.
- Never invent household names, amounts, or dates the user didn't state. Unknown request → intent "unknown".
- Keep only JSON in the reply.`;

  for (const model of ["gpt-4o-mini", "gpt-4o"]) {
    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          max_tokens: 500,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: body.slice(0, 2000) },
          ],
        }),
      });
      if (!resp.ok) continue;
      const json = await resp.json();
      const parsed = JSON.parse(json.choices[0].message.content) as ParsedIntent;
      if (typeof parsed.intent === "string") {
        parsed.fields = parsed.fields ?? {};
        parsed.missing = Array.isArray(parsed.missing) ? parsed.missing : [];
        return parsed;
      }
    } catch (err) {
      console.error(`[whatsapp-inbound] intent parse failed on ${model}:`, err);
    }
  }
  return null;
}

// Receipt-style OCR on the first staged image (same shape as extract-receipt).
async function runMediaOCR(
  apiKey: string,
  supabase: SupabaseClient,
  media: StagedMedia,
): Promise<Record<string, unknown>> {
  if (!/^image\//i.test(media.mime)) return {}; // PDFs: stage only, no OCR
  const { data: blob, error } = await supabase.storage.from("receipts").download(media.path);
  if (error || !blob) return {};
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  const dataUrl = `data:${media.mime};base64,${btoa(binary)}`;
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract from this receipt or invoice image as JSON:
- vendor_name: store or business name
- total_amount: total as a number (e.g. 42.50)
- doc_date: date in YYYY-MM-DD format
- invoice_number: invoice/reference number if this is an invoice (null otherwise)
- description: brief description of goods/services
Use null for any field you cannot determine.`,
              },
              { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
            ],
          },
        ],
      }),
    });
    if (!resp.ok) return {};
    const json = await resp.json();
    return JSON.parse(json.choices[0].message.content);
  } catch {
    return {};
  }
}

// ── Session persistence ───────────────────────────────────────────────────────
interface SessionRow {
  phone: string;
  user_id: string;
  state: string;
  pending_action: PendingAction | null;
  llm_calls: number;
  llm_window_start: string | null;
  expires_at: string | null;
}

async function saveSession(
  supabase: SupabaseClient,
  phone: string,
  userId: string,
  state: string,
  pending: PendingAction | null,
  llm: { calls: number; windowStart: string | null },
): Promise<void> {
  const { error } = await supabase.from("whatsapp_sessions").upsert({
    phone,
    user_id: userId,
    state,
    pending_action: pending,
    llm_calls: llm.calls,
    llm_window_start: llm.windowStart,
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  });
  if (error) console.error("[whatsapp-inbound] session save failed:", error.message);
}

async function removeStagedFiles(supabase: SupabaseClient, media: StagedMedia[]): Promise<void> {
  if (media.length === 0) return;
  const { error } = await supabase.storage.from("receipts").remove(media.map((m) => m.path));
  if (error) console.error("[whatsapp-inbound] staged cleanup failed:", error.message);
}

// ── Household + category resolution (code decides, LLM only proposes) ─────────
async function resolveHousehold(
  supabase: SupabaseClient,
  ctx: BotContext,
  hint: string | null | undefined,
): Promise<{ id: string; name: string } | "ambiguous" | null> {
  // Admins may file against any household, not just their memberships.
  let pool = ctx.households;
  if (ctx.is_admin) {
    const { data } = await supabase.from("households").select("id, name").order("name");
    if (data && data.length > 0) pool = data as Array<{ id: string; name: string }>;
  }
  if (pool.length === 0) return null;
  if (!hint || !hint.trim()) {
    return pool.length === 1 ? pool[0] : "ambiguous";
  }
  const h = hint.trim().toLowerCase();
  const exact = pool.filter((x) => x.name.toLowerCase() === h);
  if (exact.length === 1) return exact[0];
  const prefix = pool.filter((x) => x.name.toLowerCase().startsWith(h));
  if (prefix.length === 1) return prefix[0];
  const contains = pool.filter((x) => x.name.toLowerCase().includes(h));
  if (contains.length === 1) return contains[0];
  return "ambiguous";
}

async function matchCategory(
  supabase: SupabaseClient,
  householdId: string,
  hint: string | null | undefined,
): Promise<string | null> {
  if (!hint || !hint.trim()) return null;
  // Global categories (no category_households rows) + ones mapped to this household.
  const [{ data: cats }, { data: maps }] = await Promise.all([
    supabase.from("categories").select("id, name"),
    supabase.from("category_households").select("category_id, household_id"),
  ]);
  if (!cats) return null;
  const mapped = new Map<string, string[]>();
  for (const m of (maps ?? []) as Array<{ category_id: string; household_id: string }>) {
    mapped.set(m.category_id, [...(mapped.get(m.category_id) ?? []), m.household_id]);
  }
  const visible = (cats as Array<{ id: string; name: string }>).filter((c) => {
    const hh = mapped.get(c.id);
    return !hh || hh.includes(householdId);
  });
  const h = hint.trim().toLowerCase();
  const hit = visible.find((c) => c.name.toLowerCase() === h) ??
    visible.find((c) => c.name.toLowerCase().startsWith(h));
  return hit ? hit.name : null;
}

// ── Storage: move staged files into the household folder on confirm ──────────
async function moveStagedToHousehold(
  supabase: SupabaseClient,
  media: StagedMedia[],
  householdId: string,
  subfolder: "" | "estimates/",
): Promise<StagedMedia[]> {
  const moved: StagedMedia[] = [];
  for (const m of media) {
    const ext = m.path.split(".").pop() ?? "bin";
    const dest = `${householdId}/${subfolder}${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const { error } = await supabase.storage.from("receipts").move(m.path, dest);
    if (error) {
      // Fall back to copy + remove (move can fail across some backends).
      const { error: copyErr } = await supabase.storage.from("receipts").copy(m.path, dest);
      if (copyErr) {
        console.error(`[whatsapp-inbound] move+copy failed for ${m.path}: ${copyErr.message}`);
        continue;
      }
      await supabase.storage.from("receipts").remove([m.path]);
    }
    moved.push({ path: dest, mime: m.mime });
  }
  return moved;
}

// ── add_photos target search (v11.9 visibility re-implemented in code) ────────
interface TargetCandidate {
  id: string;
  type: "invoice" | "estimate";
  label: string;
  household_id: string | null;
}

async function findAttachTargets(
  supabase: SupabaseClient,
  userId: string,
  ctx: BotContext,
  targetType: string | null | undefined,
  hint: string | null | undefined,
): Promise<TargetCandidate[]> {
  const myHouseholds = ctx.households.map((h) => h.id);
  const out: TargetCandidate[] = [];

  if (targetType !== "estimate") {
    // Invoices: admin → all; else own OR (household admin AND in my households).
    let q = supabase
      .from("contractor_invoices")
      .select("id, invoice_number, description, household_id, created_by, created_at")
      .order("created_at", { ascending: false })
      .limit(25);
    const { data } = await q;
    for (const inv of (data ?? []) as Array<Record<string, unknown>>) {
      const mine = inv.created_by === userId;
      const haVisible = ctx.is_household_admin && myHouseholds.includes(inv.household_id as string);
      if (!(ctx.is_admin || mine || haVisible)) continue;
      out.push({
        id: inv.id as string,
        type: "invoice",
        label: `Invoice ${inv.invoice_number ?? "—"} · ${(inv.description as string ?? "").slice(0, 40)}`,
        household_id: (inv.household_id as string) ?? null,
      });
    }
  }

  if (targetType !== "invoice") {
    // Estimates: admin → all; else own OR household member OR participant.
    const { data: parts } = await supabase
      .from("estimate_participants")
      .select("estimate_id")
      .eq("user_id", userId);
    const participantIds = new Set(
      ((parts ?? []) as Array<{ estimate_id: string }>).map((p) => p.estimate_id),
    );
    const { data } = await supabase
      .from("estimates")
      .select("id, title, household_id, created_by, created_at")
      .order("created_at", { ascending: false })
      .limit(25);
    for (const est of (data ?? []) as Array<Record<string, unknown>>) {
      const mine = est.created_by === userId;
      const member = myHouseholds.includes(est.household_id as string);
      const participant = participantIds.has(est.id as string);
      if (!(ctx.is_admin || mine || member || participant)) continue;
      out.push({
        id: est.id as string,
        type: "estimate",
        label: `Estimate "${(est.title as string ?? "").slice(0, 40)}"`,
        household_id: (est.household_id as string) ?? null,
      });
    }
  }

  // Rank by hint.
  const h = (hint ?? "").trim().toLowerCase();
  if (h && !/^(last|latest|últim[ao]|ultim[ao])/.test(h)) {
    const scored = out.filter((c) => c.label.toLowerCase().includes(h));
    if (scored.length > 0) return scored.slice(0, 3);
  }
  return out.slice(0, 3);
}

// ── Reports (same RPCs as email-command) ──────────────────────────────────────
async function runReport(
  supabase: SupabaseClient,
  userId: string,
  command: string,
  lang: Lang,
): Promise<string> {
  if (command === "pending" || command === "todo") {
    const { data } = await supabase.rpc("email_command_pending", { p_user_id: userId });
    const r = data as { role: string; invoices_pending: number; estimates_aging: number; uncategorized: number } | null;
    if (!r || r.role === "member") return t(lang, "adminOnly");
    let msg = t(lang, "reportPending", r as unknown as Record<string, number>);
    if (r.role === "admin") msg += t(lang, "reportPendingUncat", { uncategorized: r.uncategorized });
    return msg;
  }
  if (command === "activity") {
    const { data } = await supabase.rpc("email_command_activity", { p_user_id: userId });
    const r = data as { role: string } | null;
    if (!r || r.role === "member") return t(lang, "adminOnly");
    return t(lang, "reportActivity", r as unknown as Record<string, number>);
  }
  // estimates / invoices
  const { data } = await supabase.rpc("email_command_report", { p_user_id: userId });
  const r = data as {
    role: string;
    estimates: { total: number; open: number; accepted: number; rejected: number; aging_over_14: number };
    invoices: { pending: number; paid: number; pending_total: number };
  } | null;
  if (!r || r.role === "member") return t(lang, "adminOnly");
  if (command === "estimates") {
    const e = r.estimates;
    const decided = e.accepted + e.rejected;
    const rate = decided === 0 ? "—" : `${Math.round((e.accepted / decided) * 100)}%`;
    return t(lang, "reportEstimates", { ...e, rate, aging: e.aging_over_14 });
  }
  return t(lang, "reportInvoices", r.invoices as unknown as Record<string, number>);
}

// ── Draft validation / summary / execution ────────────────────────────────────
const CREATE_INTENTS = ["create_expense", "create_invoice", "create_estimate", "add_photos"];

// Announce a bot-created record to admins via send-submission-notification's
// server-to-server path (service-role bearer + explicit actor_id). Best-effort:
// a failure here must not fail the creation the user already confirmed.
function announceSubmission(
  type: "invoice_submitted" | "expense_submitted" | "estimate_submitted",
  idField: "invoice_id" | "expense_id" | "estimate_id",
  recordId: string,
  actorId: string,
): void {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return;
  EdgeRuntime.waitUntil(
    fetch(`${url}/functions/v1/send-submission-notification`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type, [idField]: recordId, actor_id: actorId }),
    })
      .then(async (res) => {
        if (!res.ok) {
          console.error(`[whatsapp-inbound] submission announce ${res.status}: ${await res.text()}`);
        }
      })
      .catch((err) => console.error("[whatsapp-inbound] submission announce failed:", err)),
  );
}

function mergeFields(prior: DraftFields, incoming: Record<string, unknown>): DraftFields {
  const out: DraftFields = { ...prior };
  for (const [k, v] of Object.entries(incoming)) {
    if (v !== null && v !== undefined && v !== "") {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

function applyOcrDefaults(intent: string | null, fields: DraftFields, ocr: Record<string, unknown>): DraftFields {
  const out = { ...fields };
  const amt = parseAmount(ocr.total_amount);
  const date = isIsoDate(ocr.doc_date) ? (ocr.doc_date as string) : null;
  if (intent === "create_invoice") {
    if (out.amount == null && amt != null) out.amount = amt;
    if (!out.description && typeof ocr.description === "string" && ocr.description) out.description = ocr.description as string;
    if (!out.invoice_number && typeof ocr.invoice_number === "string" && ocr.invoice_number) out.invoice_number = ocr.invoice_number as string;
    if (!out.service_date_start && date) out.service_date_start = date;
  } else {
    // expense or undecided
    if (out.total == null && amt != null) out.total = amt;
    if (!out.vendor && typeof ocr.vendor_name === "string" && ocr.vendor_name) out.vendor = ocr.vendor_name as string;
    if (!out.date && date) out.date = date;
  }
  return out;
}

// Returns the localized question for the first missing requirement, or null
// when the draft is complete and ready to confirm.
function firstMissingQuestion(
  intent: string,
  fields: DraftFields,
  stagedCount: number,
  ctx: BotContext,
  lang: Lang,
): string | null {
  const householdList = ctx.households.map((h) => h.name).join(", ") || "—";
  if (intent === "create_expense") {
    if (!fields.household_id) return t(lang, "whichHousehold", { households: householdList });
    if (fields.total == null) return t(lang, "missingTotal");
    return null;
  }
  if (intent === "create_invoice") {
    if (!fields.household_id) return t(lang, "whichHousehold", { households: householdList });
    if (fields.amount == null) return t(lang, "missingAmount");
    if (!fields.description) return t(lang, "missingDescription");
    if (!fields.service_date_start) return t(lang, "missingDates");
    return null;
  }
  if (intent === "create_estimate") {
    if (!fields.household_id) return t(lang, "whichHousehold", { households: householdList });
    if (!fields.title) return t(lang, "missingTitle");
    if (stagedCount === 0) return t(lang, "estimateNeedsFile");
    return null;
  }
  if (intent === "add_photos") {
    if (stagedCount === 0) return t(lang, "targetNeedsMedia");
    if (!fields.target_id) return null; // handled by candidate search, not a question
    return null;
  }
  return null;
}

function buildSummary(pending: PendingAction, lang: Lang): string {
  const f = pending.fields;
  const photos = pending.staged_media.length > 0
    ? (lang === "pt-BR" ? `, ${pending.staged_media.length} foto(s)` : `, ${pending.staged_media.length} photo(s)`)
    : "";
  const currency = f.currency === "BRL" ? "BRL" : "USD";
  if (pending.intent === "create_expense") {
    return t(lang, "summaryExpense", {
      vendor: f.vendor ?? "—",
      amount: fmtMoney(f.total ?? 0, currency),
      date: f.date ?? todayIso(),
      household: f.household_name ?? "—",
      category: f.category ? (lang === "pt-BR" ? `, categoria "${f.category}"` : `, category "${f.category}"`) : "",
      photos,
    });
  }
  if (pending.intent === "create_invoice") {
    return t(lang, "summaryInvoice", {
      amount: fmtMoney(f.amount ?? 0, currency),
      description: f.description ?? "—",
      start: f.service_date_start ?? "—",
      end: f.service_date_end ?? f.service_date_start ?? "—",
      household: f.household_name ?? "—",
      number: f.invoice_number ? ` · #${f.invoice_number}` : "",
      photos,
    });
  }
  if (pending.intent === "create_estimate") {
    return t(lang, "summaryEstimate", {
      title: f.title ?? "—",
      billing: f.billing_type === "labor_only" ? t(lang, "billingLabor") : t(lang, "billingTotal"),
      household: f.household_name ?? "—",
      photos,
    });
  }
  // add_photos
  return t(lang, "summaryAddPhotos", {
    count: pending.staged_media.length,
    label: f.target_label ?? "—",
  });
}

async function executePending(
  supabase: SupabaseClient,
  userId: string,
  ctx: BotContext,
  pending: PendingAction,
  lang: Lang,
  appUrl: string,
): Promise<string> {
  const f = pending.fields;
  const currency = f.currency === "BRL" ? "BRL" : "USD";

  if (pending.intent === "create_expense") {
    // Permission: member of the target household (admins exempt).
    if (!f.household_id) throw new Error("expense without household");
    if (!ctx.is_admin && !ctx.households.some((h) => h.id === f.household_id)) {
      throw new Error("expense household not permitted");
    }
    const moved = await moveStagedToHousehold(supabase, pending.staged_media, f.household_id, "");
    const first = moved[0] ?? null;
    const { data: row, error } = await supabase
      .from("expenses")
      .insert({
        created_by: userId,
        household_id: f.household_id,
        expense_date: f.date ?? todayIso(),
        vendor: f.vendor ?? null,
        total: f.total ?? 0,
        currency,
        category: f.category ?? null,
        notes: f.notes ?? null,
        image_path: first?.path ?? null,
        image_mime: first?.mime ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(`expense insert: ${error.message}`);
    if (moved.length > 0) {
      const { error: imgErr } = await supabase.from("expense_images").insert(
        moved.map((m, i) => ({
          expense_id: row.id,
          image_path: m.path,
          image_mime: m.mime,
          display_order: i,
        })),
      );
      if (imgErr) console.error("[whatsapp-inbound] expense_images insert:", imgErr.message);
    }
    announceSubmission("expense_submitted", "expense_id", row.id, userId);
    return t(lang, "createdExpense", { summary: `${f.vendor ?? "—"}, ${fmtMoney(f.total ?? 0, currency)} (${f.household_name}). ${appUrl}` });
  }

  if (pending.intent === "create_invoice") {
    // Permission: contractor / household admin / admin; household member unless admin.
    if (!(ctx.is_contractor || ctx.is_household_admin || ctx.is_admin)) {
      return t(lang, "invoiceRoleDenied");
    }
    if (!f.household_id) throw new Error("invoice without household");
    if (!ctx.is_admin && !ctx.households.some((h) => h.id === f.household_id)) {
      throw new Error("invoice household not permitted");
    }
    const start = f.service_date_start!;
    const end = f.service_date_end ?? start;
    const moved = await moveStagedToHousehold(supabase, pending.staged_media, f.household_id, "");
    const first = moved[0] ?? null;
    const { data: row, error } = await supabase
      .from("contractor_invoices")
      .insert({
        created_by: userId,
        household_id: f.household_id,
        invoice_number: f.invoice_number ?? null,
        amount: f.amount,
        currency,
        description: f.description,
        service_date_start: start,
        service_date_end: end,
        image_path: first?.path ?? null,
        image_mime: first?.mime ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(`invoice insert: ${error.message}`);
    if (moved.length > 0) {
      const { error: imgErr } = await supabase.from("invoice_images").insert(
        moved.map((m, i) => ({
          invoice_id: row.id,
          image_path: m.path,
          image_mime: m.mime,
          display_order: i,
        })),
      );
      if (imgErr) console.error("[whatsapp-inbound] invoice_images insert:", imgErr.message);
    }
    announceSubmission("invoice_submitted", "invoice_id", row.id, userId);
    return t(lang, "createdInvoice", {
      summary: `${fmtMoney(f.amount ?? 0, currency)} (${f.household_name}). ${t(lang, "view")}: ${appUrl}/?invoice=${row.id}`,
    });
  }

  if (pending.intent === "create_estimate") {
    // Permission: any user, but the household must be theirs (admins exempt).
    if (!f.household_id) throw new Error("estimate without household");
    if (!ctx.is_admin && !ctx.households.some((h) => h.id === f.household_id)) {
      throw new Error("estimate household not permitted");
    }
    if (pending.staged_media.length === 0) throw new Error("estimate without attachment");
    const moved = await moveStagedToHousehold(supabase, pending.staged_media, f.household_id, "estimates/");
    const first = moved[0] ?? null;
    const { data: row, error } = await supabase
      .from("estimates")
      .insert({
        created_by: userId,
        household_id: f.household_id,
        title: f.title,
        description: f.description ?? f.notes ?? null,
        billing_type: f.billing_type === "labor_only" ? "labor_only" : "total",
        file_path: first?.path ?? null,
        file_mime: first?.mime ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(`estimate insert: ${error.message}`);
    if (moved.length > 0) {
      const { error: attErr } = await supabase.from("estimate_attachments").insert(
        moved.map((m, i) => ({
          estimate_id: row.id,
          file_path: m.path,
          file_mime: m.mime,
          display_order: i,
        })),
      );
      if (attErr) console.error("[whatsapp-inbound] estimate_attachments insert:", attErr.message);
    }
    announceSubmission("estimate_submitted", "estimate_id", row.id, userId);
    return t(lang, "createdEstimate", {
      summary: `"${f.title}" (${f.household_name}). ${t(lang, "view")}: ${appUrl}/?estimate=${row.id}`,
    });
  }

  if (pending.intent === "add_photos") {
    const targetId = f.target_id;
    const targetType = f.target_type as "invoice" | "estimate";
    if (!targetId || !targetType) throw new Error("add_photos without target");

    // Re-verify visibility at execution time (v11.9 rules, code-side).
    const table = targetType === "invoice" ? "contractor_invoices" : "estimates";
    const { data: rec } = await supabase
      .from(table)
      .select("id, household_id, created_by")
      .eq("id", targetId)
      .maybeSingle();
    if (!rec) throw new Error("add_photos target vanished");
    const myHouseholds = ctx.households.map((h) => h.id);
    let allowed = ctx.is_admin || rec.created_by === userId;
    if (!allowed && targetType === "invoice") {
      allowed = ctx.is_household_admin && myHouseholds.includes(rec.household_id);
    }
    if (!allowed && targetType === "estimate") {
      allowed = myHouseholds.includes(rec.household_id);
      if (!allowed) {
        const { data: part } = await supabase
          .from("estimate_participants")
          .select("user_id")
          .eq("estimate_id", targetId)
          .eq("user_id", userId)
          .maybeSingle();
        allowed = !!part;
      }
    }
    if (!allowed) throw new Error("add_photos not permitted");

    if (!rec.household_id) throw new Error("add_photos target has no household");
    const subfolder = targetType === "estimate" ? "estimates/" : "";
    const moved = await moveStagedToHousehold(supabase, pending.staged_media, rec.household_id, subfolder);
    if (moved.length === 0) throw new Error("add_photos nothing moved");

    if (targetType === "invoice") {
      const { count } = await supabase
        .from("invoice_images")
        .select("id", { count: "exact", head: true })
        .eq("invoice_id", targetId)
        .lt("display_order", 1000);
      const base = count ?? 0;
      const { error } = await supabase.from("invoice_images").insert(
        moved.map((m, i) => ({
          invoice_id: targetId,
          image_path: m.path,
          image_mime: m.mime,
          display_order: base + i,
        })),
      );
      if (error) throw new Error(`invoice_images insert: ${error.message}`);
    } else {
      const { count } = await supabase
        .from("estimate_attachments")
        .select("id", { count: "exact", head: true })
        .eq("estimate_id", targetId);
      const base = count ?? 0;
      const { error } = await supabase.from("estimate_attachments").insert(
        moved.map((m, i) => ({
          estimate_id: targetId,
          file_path: m.path,
          file_mime: m.mime,
          display_order: base + i,
        })),
      );
      if (error) throw new Error(`estimate_attachments insert: ${error.message}`);
    }
    return t(lang, "photosAdded", { count: moved.length, label: f.target_label ?? targetType });
  }

  throw new Error(`unknown intent ${pending.intent}`);
}

// ── Media staging ─────────────────────────────────────────────────────────────
async function stageMedia(
  supabase: SupabaseClient,
  params: URLSearchParams,
  phone: string,
): Promise<{ staged: StagedMedia[]; rejected: number }> {
  const numMedia = Math.min(Number(params.get("NumMedia") ?? "0") || 0, 10);
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
  const token = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
  const staged: StagedMedia[] = [];
  let rejected = 0;

  const jobs: Promise<void>[] = [];
  for (let i = 0; i < numMedia; i++) {
    const url = params.get(`MediaUrl${i}`);
    const mime = (params.get(`MediaContentType${i}`) ?? "").toLowerCase();
    if (!url) continue;
    if (!isSupportedMedia(mime)) {
      rejected++;
      continue;
    }
    jobs.push(
      (async () => {
        try {
          // Basic auth on the Twilio hop; fetch drops the header on the
          // cross-origin redirect to the CDN, which is the correct behavior.
          const res = await fetch(url, {
            headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}` },
          });
          if (!res.ok) {
            console.error(`[whatsapp-inbound] media fetch ${i} failed: ${res.status}`);
            return;
          }
          const bytes = new Uint8Array(await res.arrayBuffer());
          if (bytes.length === 0 || bytes.length > 16 * 1024 * 1024) return;
          const digits = phone.replace(/[^0-9]/g, "");
          const path = `whatsapp-staging/${digits}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${extFromMime(mime)}`;
          const { error } = await supabase.storage
            .from("receipts")
            .upload(path, bytes, { contentType: mime, upsert: false });
          if (error) {
            console.error(`[whatsapp-inbound] media upload ${i} failed: ${error.message}`);
            return;
          }
          staged.push({ path, mime });
        } catch (err) {
          console.error(`[whatsapp-inbound] media ${i} error:`, err);
        }
      })(),
    );
  }
  await Promise.all(jobs);
  return { staged, rejected };
}

// ── The async worker ──────────────────────────────────────────────────────────
async function process(params: URLSearchParams, userId: string, phone: string): Promise<void> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const appUrl = (Deno.env.get("APP_URL") ?? "https://ledger.90ten.life").replace(/\/$/, "");

  let lang: Lang = "en";
  try {
    const { data: ctxData } = await supabase.rpc("whatsapp_bot_context", { p_user_id: userId });
    const ctx = ctxData as BotContext | null;
    if (!ctx) {
      console.error(`[whatsapp-inbound] no context for user ${userId}`);
      return;
    }
    lang = ctx.preferred_language === "pt-BR" ? "pt-BR" : "en";
    const exampleHousehold = ctx.households[0]?.name ?? "Oak House";

    // Load session; expired counts as idle (with a note) and drops staged files.
    const { data: sessData } = await supabase
      .from("whatsapp_sessions")
      .select("*")
      .eq("phone", phone)
      .maybeSingle();
    let session = sessData as SessionRow | null;
    let expiredNote = "";
    if (session && session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
      if (session.pending_action?.staged_media?.length) {
        await removeStagedFiles(supabase, session.pending_action.staged_media);
        expiredNote = t(lang, "draftExpired");
      }
      session = { ...session, state: "idle", pending_action: null };
    }

    // LLM rate window (per phone, hourly).
    const nowIso = new Date().toISOString();
    let llmCalls = session?.llm_calls ?? 0;
    let llmWindow = session?.llm_window_start ?? null;
    if (!llmWindow || Date.now() - new Date(llmWindow).getTime() > 60 * 60 * 1000) {
      llmCalls = 0;
      llmWindow = nowIso;
    }
    const llm = () => ({ calls: llmCalls, windowStart: llmWindow });

    const bodyRaw = (params.get("Body") ?? "").trim();
    const word = normalizeWord(bodyRaw);

    // Stage any media first — it participates in every state.
    const { staged: newMedia, rejected } = await stageMedia(supabase, params, phone);
    let notePrefix = expiredNote;
    if (rejected > 0) notePrefix += t(lang, "mediaRejected", { count: rejected }) + "\n\n";

    // ── Keyword fast path (text-only messages) ────────────────────────────────
    if (newMedia.length === 0 && KNOWN_COMMANDS.includes(word)) {
      if (word === "help") {
        await sendWhatsApp(phone, notePrefix + t(lang, "help", { username: ctx.username, household: exampleHousehold }));
      } else {
        await sendWhatsApp(phone, notePrefix + (await runReport(supabase, userId, word, lang)));
      }
      return;
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    let pending: PendingAction = session?.pending_action ?? { intent: null, fields: {}, staged_media: [] };
    if (newMedia.length > 0) {
      pending = { ...pending, staged_media: [...(pending.staged_media ?? []), ...newMedia] };
    }
    let state = session?.state ?? "idle";

    // ── Cancel words work in every state, no LLM needed ───────────────────────
    if (NO_WORDS.includes(word)) {
      if (state === "idle" && !session?.pending_action) {
        await sendWhatsApp(phone, notePrefix + t(lang, "nothingToCancel"));
        return;
      }
      await removeStagedFiles(supabase, pending.staged_media ?? []);
      await saveSession(supabase, phone, userId, "idle", null, llm());
      await sendWhatsApp(phone, notePrefix + t(lang, "cancelled"));
      return;
    }

    // ── Confirmation state: YES executes (atomically claimed) ─────────────────
    if (state === "awaiting_confirmation" && YES_WORDS.includes(word)) {
      // Atomic claim: only the update that actually flips the state gets to
      // execute — a double-YES or an out-of-order retry loses the race.
      const { data: claimed } = await supabase
        .from("whatsapp_sessions")
        .update({ state: "idle", pending_action: null, updated_at: nowIso })
        .eq("phone", phone)
        .eq("state", "awaiting_confirmation")
        .select("pending_action")
        .maybeSingle();
      // maybeSingle returns the UPDATED row (pending_action already null), so
      // the license to execute is the row coming back at all; the draft itself
      // is what we loaded before the claim.
      if (!claimed) {
        await sendWhatsApp(phone, notePrefix + t(lang, "nothingToCancel"));
        return;
      }
      try {
        const reply = await executePending(supabase, userId, ctx, pending, lang, appUrl);
        await sendWhatsApp(phone, notePrefix + reply);
      } catch (err) {
        console.error("[whatsapp-inbound] execute failed:", err);
        await removeStagedFiles(supabase, pending.staged_media ?? []);
        await sendWhatsApp(phone, t(lang, "genericError"));
      }
      return;
    }

    // ── choosing_target: a bare number picks a candidate ──────────────────────
    if (state === "choosing_target" && /^\d{1,2}$/.test(bodyRaw)) {
      const idx = Number(bodyRaw) - 1;
      const cand = pending.candidates?.[idx];
      if (cand) {
        pending.fields.target_id = cand.id;
        pending.fields.target_type = cand.type;
        pending.fields.target_label = cand.label;
        pending.candidates = [];
        await saveSession(supabase, phone, userId, "awaiting_confirmation", pending, llm());
        await sendWhatsApp(phone, `${buildSummary(pending, lang)}\n\n${t(lang, "confirmPrompt")}`);
        return;
      }
    }

    // ── Everything else goes through the LLM (or pure-media handling) ─────────
    if (llmCalls >= 20) {
      await sendWhatsApp(phone, notePrefix + t(lang, "rateLimited"));
      return;
    }
    if (!openaiKey) {
      console.error("[whatsapp-inbound] OPENAI_API_KEY missing");
      await sendWhatsApp(phone, t(lang, "genericError"));
      return;
    }

    // OCR the first staged image once per draft — cheap prefill for the
    // media-first flow and better defaults for text+photo messages.
    if (pending.staged_media.length > 0 && !pending.ocr_done) {
      llmCalls++;
      pending.ocr = await runMediaOCR(openaiKey, supabase, pending.staged_media[0]);
      pending.ocr_done = true;
    }

    // Media-only message with no draft intent → ask what it is (no LLM parse
    // of an empty string).
    if (!bodyRaw && pending.intent == null) {
      const q = lang === "pt-BR"
        ? "Recebi a foto — é uma *despesa*, uma *fatura* ou um novo *orçamento*? E para qual residência?"
        : "Got the photo — is this an *expense*, an *invoice*, or a new *estimate*? And for which household?";
      await saveSession(supabase, phone, userId, "collecting", pending, llm());
      await sendWhatsApp(phone, notePrefix + q);
      return;
    }

    let intent = pending.intent;
    if (bodyRaw) {
      llmCalls++;
      const parsed = await parseIntent(openaiKey, bodyRaw, ctx, pending, lang);
      if (!parsed) {
        await saveSession(supabase, phone, userId, state, pending, llm());
        await sendWhatsApp(phone, t(lang, "genericError"));
        return;
      }

      if (parsed.intent === "cancel") {
        await removeStagedFiles(supabase, pending.staged_media ?? []);
        await saveSession(supabase, phone, userId, "idle", null, llm());
        await sendWhatsApp(phone, notePrefix + t(lang, "cancelled"));
        return;
      }
      if (parsed.intent === "help") {
        await saveSession(supabase, phone, userId, state, pending, llm());
        await sendWhatsApp(phone, notePrefix + t(lang, "help", { username: ctx.username, household: exampleHousehold }));
        return;
      }
      if (parsed.intent.startsWith("report_")) {
        await saveSession(supabase, phone, userId, state, pending, llm());
        const cmd = parsed.intent.replace("report_", "");
        await sendWhatsApp(phone, notePrefix + (await runReport(supabase, userId, cmd, lang)));
        return;
      }
      if (parsed.intent === "unknown" && intent == null) {
        await saveSession(supabase, phone, userId, state, pending, llm());
        const q = parsed.clarify || t(lang, "unknown", { household: exampleHousehold });
        await sendWhatsApp(phone, notePrefix + q);
        return;
      }

      if (CREATE_INTENTS.includes(parsed.intent)) intent = parsed.intent;
      pending.intent = intent;
      pending.fields = mergeFields(pending.fields, parsed.fields);
    }

    // Apply OCR defaults under the decided intent — user/LLM fields win, OCR
    // only fills gaps (applyOcrDefaults never overwrites non-null fields).
    if (intent && pending.ocr) {
      pending.fields = applyOcrDefaults(intent, pending.fields, pending.ocr);
    }

    if (!intent) {
      await saveSession(supabase, phone, userId, "collecting", pending, llm());
      await sendWhatsApp(phone, notePrefix + t(lang, "unknown", { household: exampleHousehold }));
      return;
    }

    // ── Code-side validation (LLM proposes, code disposes) ───────────────────
    const f = pending.fields;
    // Numbers / dates re-validated regardless of what the model claimed.
    if (f.total != null) f.total = parseAmount(f.total);
    if (f.amount != null) f.amount = parseAmount(f.amount);
    for (const k of ["date", "service_date_start", "service_date_end"] as const) {
      if (f[k] != null && !isIsoDate(f[k])) f[k] = null;
    }
    if (f.service_date_start && f.service_date_end && f.service_date_end < f.service_date_start) {
      f.service_date_end = f.service_date_start;
    }

    // Household resolution.
    if (intent !== "add_photos" && !f.household_id) {
      const resolved = await resolveHousehold(supabase, ctx, f.household);
      if (resolved === null) {
        await saveSession(supabase, phone, userId, "idle", null, llm());
        await removeStagedFiles(supabase, pending.staged_media ?? []);
        await sendWhatsApp(phone, notePrefix + t(lang, "noHouseholds"));
        return;
      }
      if (resolved === "ambiguous") {
        await saveSession(supabase, phone, userId, "collecting", pending, llm());
        const pool = ctx.households.map((h) => h.name).join(", ") || "—";
        const key = f.household ? "householdAmbiguous" : "whichHousehold";
        await sendWhatsApp(phone, notePrefix + t(lang, key, { households: pool }));
        return;
      }
      f.household_id = resolved.id;
      f.household_name = resolved.name;
    }

    // Expense category: exact/prefix match against visible categories; no
    // match folds the hint into notes instead of blocking.
    if (intent === "create_expense" && f.category && f.household_id) {
      const matched = await matchCategory(supabase, f.household_id, f.category);
      if (!matched) {
        f.notes = [f.notes, f.category].filter(Boolean).join(" · ");
        f.category = null;
      } else {
        f.category = matched;
      }
    }

    // Invoice role gate — fail fast before collecting more fields.
    if (intent === "create_invoice" && !(ctx.is_contractor || ctx.is_household_admin || ctx.is_admin)) {
      await removeStagedFiles(supabase, pending.staged_media ?? []);
      await saveSession(supabase, phone, userId, "idle", null, llm());
      await sendWhatsApp(phone, notePrefix + t(lang, "invoiceRoleDenied"));
      return;
    }

    // add_photos target resolution.
    if (intent === "add_photos" && !f.target_id) {
      if (pending.staged_media.length === 0) {
        await saveSession(supabase, phone, userId, "collecting", pending, llm());
        await sendWhatsApp(phone, notePrefix + t(lang, "targetNeedsMedia"));
        return;
      }
      const candidates = await findAttachTargets(supabase, userId, ctx, f.target_type, f.target_hint);
      if (candidates.length === 0) {
        await saveSession(supabase, phone, userId, "collecting", pending, llm());
        await sendWhatsApp(phone, notePrefix + t(lang, "targetNotFound"));
        return;
      }
      if (candidates.length === 1) {
        f.target_id = candidates[0].id;
        f.target_type = candidates[0].type;
        f.target_label = candidates[0].label;
      } else {
        pending.candidates = candidates.map((c) => ({ id: c.id, type: c.type, label: c.label }));
        await saveSession(supabase, phone, userId, "choosing_target", pending, llm());
        const list = candidates.map((c, i) => `${i + 1}. ${c.label}`).join("\n");
        await sendWhatsApp(phone, notePrefix + t(lang, "targetChoose", { list }));
        return;
      }
    }

    // Missing-field question or ready-to-confirm summary.
    const question = firstMissingQuestion(intent, f, pending.staged_media.length, ctx, lang);
    if (question) {
      await saveSession(supabase, phone, userId, "collecting", pending, llm());
      await sendWhatsApp(phone, notePrefix + question);
      return;
    }

    await saveSession(supabase, phone, userId, "awaiting_confirmation", pending, llm());
    await sendWhatsApp(phone, `${notePrefix}${buildSummary(pending, lang)}\n\n${t(lang, "confirmPrompt")}`);
  } catch (err) {
    console.error("[whatsapp-inbound] process error:", err);
    try {
      await sendWhatsApp(phone, t(lang, "genericError"));
    } catch {
      // last resort: nothing else to do
    }
  }
}

// ── Webhook entry point ───────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200 });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const raw = await req.text();
    const params = new URLSearchParams(raw);

    // 1. Signature check against the pinned public URL.
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
    const webhookUrl = Deno.env.get("TWILIO_WEBHOOK_URL") ?? "";
    const signature = req.headers.get("X-Twilio-Signature") ?? "";
    if (!authToken || !webhookUrl) {
      console.error("[whatsapp-inbound] TWILIO_AUTH_TOKEN / TWILIO_WEBHOOK_URL not configured");
      return new Response("Not configured", { status: 500 });
    }
    const expected = await computeTwilioSignature(authToken, webhookUrl, params);
    if (!signature || !timingSafeEqual(expected, signature)) {
      console.error("[whatsapp-inbound] signature mismatch — rejecting");
      return new Response("Forbidden", { status: 403 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // 2. Dedup on MessageSid — Twilio retries produce conflicts, which we ack.
    const messageSid = params.get("MessageSid") ?? params.get("SmsMessageSid") ?? "";
    if (messageSid) {
      const { data: dedupRow, error: dedupErr } = await supabase
        .from("whatsapp_inbound_dedup")
        .insert({ message_sid: messageSid })
        .select("message_sid")
        .maybeSingle();
      if (dedupErr && dedupErr.code === "23505") return twiml();
      if (!dedupRow && dedupErr) {
        // Unexpected failure: log but keep going — better a rare double-reply
        // than a dropped message.
        console.error("[whatsapp-inbound] dedup insert error:", dedupErr.message);
      }
    }

    // 3. Resolve the sender against the admin-managed allow-list.
    const phone = normalizePhone(params.get("From") ?? "");
    if (!/^\+[1-9][0-9]{6,14}$/.test(phone)) return twiml();
    const { data: userId } = await supabase.rpc("resolve_sender_phone", { p_phone: phone });
    if (!userId) {
      console.log(`[whatsapp-inbound] unknown number — generic decline`);
      return twiml(STRINGS.en.unknownNumber);
    }

    // 4. Track the 24h reply window, then hand off to the async worker and
    //    ack immediately (Twilio times out around 15s; the LLM can take 30).
    await supabase.rpc("touch_phone_inbound", { p_phone: phone });
    EdgeRuntime.waitUntil(process(params, userId as string, phone));
    return twiml();
  } catch (err) {
    console.error("[whatsapp-inbound] webhook error:", err);
    return new Response("Internal error", { status: 500 });
  }
});
