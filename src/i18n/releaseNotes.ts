// Static release-notes feed surfaced through the bell icon ("What's New").
//
// We keep this in a typed module rather than an i18n JSON file because
// (a) the bodies are long-form prose, awkward inside a flat key/value
// store, and (b) we want to ship release notes alongside the feature
// commit itself — no DB migration, no separate CMS.
//
// Read-state is tracked per-device in localStorage under the key
// LAST_SEEN_KEY. The bell shows a red dot when the highest release ID
// in this list is newer than the value stored there. Per-device is the
// right granularity: power users on multiple devices see each device
// pick up new notes the first time they open the bell.
//
// Order: NEWEST FIRST. New entries go at the top.

import type { Language } from './index';

export interface ReleaseNote {
  /** Stable identifier — never change after release. Used as the
   *  localStorage cursor. Match the version string for simplicity. */
  id: string;
  /** Display version, e.g. "v6.5". */
  version: string;
  /** ISO date the release went live. */
  date: string;
  /** Short title shown in the modal list view. */
  title: Record<Language, string>;
  /** One- or two-paragraph body. Plain text; no markdown rendering. */
  body: Record<Language, string>;
}

export const LAST_SEEN_KEY = 'ledgerx:lastSeenReleaseId';

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    id: 'v7.1',
    version: 'v7.1',
    date: '2026-04-30',
    title: {
      'en': 'Forward receipts by email',
      'pt-BR': 'Encaminhe recibos por e-mail',
    },
    body: {
      'en':
        "You can now forward any receipt or invoice email straight to " +
        "receipts@90ten.life and it will appear in your dashboard for review. " +
        "Go to Settings → Email Forwarding to register the address(es) you'll " +
        "send from. The system OCR-reads attachments and pre-fills the form — " +
        "just check the details and hit Accept. Unrecognised senders are " +
        "silently ignored, so only your registered addresses land in your inbox.",
      'pt-BR':
        'Agora você pode encaminhar qualquer recibo ou nota fiscal para ' +
        'receipts@90ten.life e ele aparecerá no seu painel para revisão. ' +
        'Vá em Configurações → Encaminhamento por E-mail para registrar os ' +
        'endereços a partir dos quais você enviará. O sistema lê os anexos ' +
        'com OCR e preenche o formulário automaticamente — basta conferir ' +
        'os dados e clicar em Aceitar. Remetentes não reconhecidos são ' +
        'ignorados silenciosamente.',
    },
  },
  {
    id: 'v6.9',
    version: 'v6.9',
    date: '2026-04-30',
    title: {
      'en': "What's New on the login screen",
      'pt-BR': 'Novidades na tela de login',
    },
    body: {
      'en':
        "You no longer need to sign in to see what's been shipped. The new " +
        "\"See what's new\" button on the login screen shows the two most " +
        "recent updates — readable by anyone, no account needed. We also " +
        "tightened up TypeScript types across the board so the app is more " +
        "reliable under the hood.",
      'pt-BR':
        'Você não precisa mais entrar para ver o que foi lançado. O novo ' +
        'botão "Veja o que há de novo" na tela de login exibe as duas ' +
        'atualizações mais recentes — visível para qualquer pessoa, sem ' +
        'conta. Também ajustamos os tipos TypeScript em todo o app para ' +
        'maior confiabilidade.',
    },
  },
  {
    id: 'v6.8',
    version: 'v6.8',
    date: '2026-04-29',
    title: {
      'en': 'Save as template + one-tap reuse',
      'pt-BR': 'Salvar como modelo + reuso em um toque',
    },
    body: {
      'en':
        "Tick \"Save as template\" at the bottom of Add Transaction or " +
        "Submit Invoice and give it a name (\"Monthly Rent\", \"Internet " +
        "Bill\", etc.). Next time, tap \"Use a saved template\" at the top " +
        "of the form to pre-fill every field in one click. Templates are " +
        "private to your account — no shared confusion about whose rent " +
        "template is the right one this month.",
      'pt-BR':
        'Marque "Salvar como modelo" na parte inferior de Adicionar ' +
        'Transação ou Enviar Nota Fiscal e dê um nome ("Aluguel Mensal", ' +
        '"Conta de Internet" etc.). Da próxima vez, toque em "Usar um ' +
        'modelo salvo" no topo do formulário para preencher todos os ' +
        'campos com um clique. Modelos são privados da sua conta — sem ' +
        'confusão sobre qual modelo de aluguel é o correto este mês.',
    },
  },
  {
    id: 'v6.7',
    version: 'v6.7',
    date: '2026-04-29',
    title: {
      'en': 'Possible-duplicate warning on upload',
      'pt-BR': 'Aviso de possível duplicata no envio',
    },
    body: {
      'en':
        "If you upload a receipt with the same vendor, amount, and date " +
        "(±1 day) as one already in this household, an amber banner now " +
        "appears at the top of the form so you can spot a re-upload before " +
        "saving. Same logic for invoices, matched by invoice number within " +
        "the property. The warning is non-blocking — if you really do mean " +
        "to submit, just hit Save.",
      'pt-BR':
        'Se você enviar um recibo com o mesmo fornecedor, valor e data ' +
        '(±1 dia) de outro já registrado nesta residência, um aviso âmbar ' +
        'aparece no topo do formulário para você identificar um reenvio ' +
        'antes de salvar. A mesma lógica vale para notas fiscais, comparando ' +
        'pelo número dentro do imóvel. O aviso não bloqueia — se for ' +
        'mesmo intencional, basta clicar Salvar.',
    },
  },
  {
    id: 'v6.6',
    version: 'v6.6',
    date: '2026-04-29',
    title: {
      'en': 'Vendor catalog with auto-fill',
      'pt-BR': 'Catálogo de fornecedores com preenchimento automático',
    },
    body: {
      'en':
        "When you type a vendor name on Add Transaction, the field now " +
        "autocompletes from a shared catalog — vendors you've used before " +
        "plus globals an admin set up. Picking a known vendor auto-fills " +
        "the category. Admins can curate the global catalog (and any " +
        "household-specific overrides) under Manage Vendors in the admin nav.",
      'pt-BR':
        'Ao digitar um fornecedor em Adicionar Transação, o campo agora ' +
        'se completa automaticamente a partir de um catálogo compartilhado ' +
        '— fornecedores que você já usou mais os globais que o admin ' +
        'configurou. Escolher um fornecedor conhecido preenche a ' +
        'categoria. Administradores gerenciam o catálogo global (e ' +
        'sobrescritas por residência) em Fornecedores no menu admin.',
    },
  },
  {
    id: 'v6.5',
    version: 'v6.5',
    date: '2026-04-29',
    title: {
      'en': "What's New panel",
      'pt-BR': 'Novidades disponíveis',
    },
    body: {
      'en':
        "Tap the bell icon at the top to see what's been shipped recently. " +
        "Bell turns amber with a dot when there's something you haven't read. " +
        "We'll use this to keep you in the loop as new features roll out — no " +
        'more silent updates.',
      'pt-BR':
        'Toque no ícone do sino no topo para ver o que foi lançado recentemente. ' +
        'O sino fica âmbar com um ponto quando há algo que você ainda não leu. ' +
        'Vamos usar este painel para manter você por dentro à medida que novos ' +
        'recursos forem lançados — sem mais atualizações silenciosas.',
    },
  },
  {
    id: 'v6.4',
    version: 'v6.4',
    date: '2026-04-28',
    title: {
      'en': 'Faster, focused receipt scanner',
      'pt-BR': 'Leitor de recibos mais rápido e direto',
    },
    body: {
      'en':
        "Receipt OCR now extracts only what you actually need: vendor, total, " +
        "date, and any handwritten notes. We dropped tax / tip / payment-method " +
        'parsing and itemized recaps — they cluttered the notes field and ' +
        "slowed scans. Category is auto-filled from the vendor catalog instead. " +
        'Invoice scanning is unchanged and still extracts full detail.',
      'pt-BR':
        'A leitura de recibos agora extrai apenas o essencial: fornecedor, total, ' +
        'data e qualquer anotação manuscrita. Removemos extração de imposto, ' +
        'gorjeta, forma de pagamento e resumo de itens — só atrapalhavam o ' +
        'campo de notas e tornavam a leitura mais lenta. A categoria é ' +
        'preenchida pelo catálogo de fornecedores. Notas fiscais continuam ' +
        'extraindo o conjunto completo de campos.',
    },
  },
  {
    id: 'v6.3',
    version: 'v6.3',
    date: '2026-04-28',
    title: {
      'en': 'Privacy fix + admin submitter filter',
      'pt-BR': 'Correção de privacidade + filtro por remetente para admins',
    },
    body: {
      'en':
        "Regular users now only see receipts they personally submitted on " +
        "their dashboard — not other household members'. Admins and household " +
        'admins gained a new "Filter by Submitter" chip row in Analytics with ' +
        'a "Just me" shortcut, plus the recent-transactions list now shows the ' +
        '@username next to each row.',
      'pt-BR':
        'Usuários comuns agora veem somente os recibos que enviaram, não os de ' +
        'outros membros da residência. Administradores e administradores de ' +
        'imóvel ganharam um filtro "Filtrar por Remetente" em Análises com ' +
        'atalho "Somente eu", e a lista de transações recentes mostra o ' +
        '@usuário ao lado de cada linha.',
    },
  },
];

/** Returns the highest (newest) release id, or null if the list is empty. */
export function latestReleaseId(): string | null {
  return RELEASE_NOTES[0]?.id ?? null;
}

/** Reads the last-seen id from localStorage. Safe in SSR / no-storage contexts. */
export function getLastSeenReleaseId(): string | null {
  try {
    return window.localStorage.getItem(LAST_SEEN_KEY);
  } catch {
    return null;
  }
}

/** Writes the last-seen id. Safe to call when storage is unavailable. */
export function setLastSeenReleaseId(id: string): void {
  try {
    window.localStorage.setItem(LAST_SEEN_KEY, id);
  } catch {
    /* no-op */
  }
}

/** True when there's at least one release the user hasn't seen yet. */
export function hasUnreadReleases(): boolean {
  const latest = latestReleaseId();
  if (!latest) return false;
  return getLastSeenReleaseId() !== latest;
}
