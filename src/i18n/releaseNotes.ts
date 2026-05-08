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
    id: 'v9.2',
    version: 'v9.2',
    date: '2026-05-08',
    title: {
      'en': 'Category picker now respects property assignments',
      'pt-BR': 'Seletor de categorias agora respeita as atribuições de propriedade',
    },
    body: {
      'en':
        "Fixed a bug where a category that you assigned to one or more specific properties (in Manage Categories) was still showing up in the Add Transaction picker for unrelated properties. " +
        "The picker now matches what you see in Manage Categories: a category appears for a property only if it's truly Global (assigned to none) or explicitly assigned to that property. " +
        "If a user previously saw extra categories that didn't belong to their property, they'll now see only the right ones — no admin action required.",
      'pt-BR':
        'Corrigimos um problema em que uma categoria atribuída a uma ou mais propriedades específicas (em Gerenciar Categorias) ainda aparecia no seletor de Adicionar Transação para outras propriedades. ' +
        'O seletor agora segue o que você vê em Gerenciar Categorias: uma categoria aparece para uma propriedade somente se for realmente Global (sem atribuições) ou estiver explicitamente atribuída àquela propriedade. ' +
        'Se um usuário estava vendo categorias extras que não pertenciam à propriedade dele, agora verá apenas as corretas — sem precisar de ação do administrador.',
    },
  },
  {
    id: 'v9.1',
    version: 'v9.1',
    date: '2026-05-08',
    title: {
      'en': 'Smarter receipt date reading',
      'pt-BR': 'Leitura de data de recibo mais inteligente',
    },
    body: {
      'en':
        "The OCR scanner now knows today's date, so it can self-correct when a receipt year looks implausible — the common '2023 vs 2026' misread is much less likely to slip through. " +
        "We also added a yellow warning banner on the Add Transaction form whenever the date is more than 90 days in the past, so you can catch and fix a bad scan before it skews your spending summary.",
      'pt-BR':
        'O leitor de recibos agora conhece a data de hoje, então consegue se autocorrigir quando o ano do recibo parece improvável — o erro comum de "2023 vs 2026" tem muito menos chance de passar despercebido. ' +
        'Também adicionamos um aviso amarelo no formulário de Adicionar Transação quando a data é de mais de 90 dias atrás, para você identificar e corrigir uma leitura errada antes que ela distorça o seu resumo de gastos.',
    },
  },
  {
    id: 'v9.0',
    version: 'v9.0',
    date: '2026-05-08',
    title: {
      'en': 'Cleaner new-user setup',
      'pt-BR': 'Configuração de novos usuários mais limpa',
    },
    body: {
      'en':
        "New users no longer auto-join every property. When you create a user in Manage Users, the property checklist now starts empty — tick only the ones that user should see, and they get exactly that access. " +
        "We also tightened the receipt RLS so a user's own submissions stay visible to them even if you later move them between properties — no more receipts disappearing on you when memberships change. " +
        "If you have an existing user who already sees every property by mistake, open Manage Users → Households for that user and uncheck the ones you didn't intend.",
      'pt-BR':
        'Novos usuários não entram mais automaticamente em todas as propriedades. Ao criar um usuário em Gerenciar Usuários, a lista de propriedades agora começa vazia — marque apenas as que ele deve ver, e ele recebe exatamente esse acesso. ' +
        'Também reforçamos as permissões dos recibos para que os envios de cada usuário continuem visíveis para ele mesmo se depois você mudar a propriedade dele — chega de recibos sumindo ao trocar de grupo. ' +
        'Se algum usuário já existe e está vendo todas as propriedades por engano, abra Gerenciar Usuários → Residências e desmarque as que você não pretendia.',
    },
  },
  {
    id: 'v8.9',
    version: 'v8.9',
    date: '2026-05-06',
    title: {
      'en': 'Reports by person + last sign-in',
      'pt-BR': 'Relatórios por pessoa + último acesso',
    },
    body: {
      'en':
        "Reports now let admins pick any combination of people in the selected households — not just one person at a time. The submitter's name shows up as a column in the on-screen results, in the CSV export, and on every PDF cell, and you can sort the report by submitter (or by date, amount, vendor, or category). " +
        "Manage Users now also shows each account's last sign-in next to the join date, so it's easy to spot dormant logins.",
      'pt-BR':
        'Os Relatórios agora permitem que administradores escolham qualquer combinação de pessoas nas residências selecionadas — não apenas uma de cada vez. O nome de quem enviou aparece como coluna nos resultados, na exportação CSV e em cada cartão do PDF, e você pode ordenar o relatório por autor (ou por data, valor, fornecedor ou categoria). ' +
        'A tela Gerenciar Usuários também passou a mostrar o último acesso ao lado da data de entrada, facilitando identificar contas inativas.',
    },
  },
  {
    id: 'v8.8',
    version: 'v8.8',
    date: '2026-05-05',
    title: {
      'en': 'Smarter Email Inbox',
      'pt-BR': 'Caixa de Entrada de E-mail mais inteligente',
    },
    body: {
      'en':
        "Three upgrades to forwarded receipts: when you finish reviewing one, you'll see a quick confirmation that it landed in Recent Transactions (or Invoices) and was cleared from the inbox. " +
        'The pending count at the top of the inbox now updates instantly when you discard or save items — no more stale "3" sitting on an empty list. ' +
        "And we now read receipts that come embedded in the email body itself (Uber, airline, SaaS bills, etc.) — not just the ones with a PDF or photo attached.",
      'pt-BR':
        'Três melhorias para recibos encaminhados por e-mail: ao terminar a revisão, você vê uma confirmação rápida de que o item entrou em Transações Recentes (ou Notas Fiscais) e saiu da caixa de entrada. ' +
        'A contagem de pendências no topo da caixa de entrada agora atualiza na hora quando você descarta ou salva — chega de "3" parado em uma lista vazia. ' +
        'E passamos a ler recibos que vêm embutidos no corpo do próprio e-mail (Uber, companhias aéreas, SaaS, etc.) — não só os com PDF ou foto anexados.',
    },
  },
  {
    id: 'v8.7',
    version: 'v8.7',
    date: '2026-05-04',
    title: {
      'en': 'Reports open ready to run',
      'pt-BR': 'Relatórios prontos para rodar',
    },
    body: {
      'en':
        'When you open Reports, all categories are now pre-selected so you can hit Run Report right away. ' +
        'If you only belong to one household, that household is also pre-ticked — no more clicking boxes before you see any results.',
      'pt-BR':
        'Ao abrir Relatórios, todas as categorias agora já vêm marcadas, então você pode clicar em Gerar Relatório na hora. ' +
        'Se você só pertence a uma residência, ela também já fica marcada — chega de clicar em caixinhas antes de ver qualquer resultado.',
    },
  },
  {
    id: 'v8.6',
    version: 'v8.6',
    date: '2026-05-03',
    title: {
      'en': 'Reports now respect privacy',
      'pt-BR': 'Relatórios agora respeitam a privacidade',
    },
    body: {
      'en':
        'Critical fix: regular users running Reports or Export now see only the transactions they personally submitted, matching the Transactions list they already had. ' +
        'Admins and household admins can still see the full picture and now have a "Submitted by" dropdown to narrow a report to a specific person — anyone in the selected household, or just themselves.',
      'pt-BR':
        'Correção importante: usuários comuns ao rodar Relatórios ou Exportar agora veem apenas as transações que eles próprios enviaram, igual à lista de Transações que já tinham. ' +
        'Administradores e administradores de família continuam vendo o todo e agora têm um menu "Enviado por" para filtrar um relatório por uma pessoa específica — qualquer membro da residência selecionada ou apenas você mesmo.',
    },
  },
  {
    id: 'v8.5',
    version: 'v8.5',
    date: '2026-05-03',
    title: {
      'en': 'Cleaner login screen',
      'pt-BR': 'Tela de login mais limpa',
    },
    body: {
      'en':
        'The login screen drops the Sign Up tab. New accounts are always created by an admin (so the right household and category access can be set up for you), so a self-serve sign-up button just led to a dead-end. The login screen is now a single, focused form.',
      'pt-BR':
        'A tela de login removeu a aba Cadastrar. Novas contas são sempre criadas por um administrador (para que o acesso à residência e às categorias certas seja configurado para você), então um botão de cadastro próprio só levava a um beco sem saída. Agora a tela de login é um formulário único e focado.',
    },
  },
  {
    id: 'v8.4',
    version: 'v8.4',
    date: '2026-05-03',
    title: {
      'en': 'Help docs caught up',
      'pt-BR': 'Ajuda em dia',
    },
    body: {
      'en':
        'The in-app help is in sync with everything that just shipped — the new account avatar menu, the simplified Save receipt button, the OCR text toggle, the small-list filter chip, the two-tap delete, and Esc-to-close on every modal.',
      'pt-BR':
        'A ajuda do app está em sincronia com tudo que acabou de chegar — o novo menu suspenso do avatar, o botão Salvar recibo simplificado, o botão de ver texto do OCR, o filtro discreto para listas curtas, a exclusão em dois toques e o Esc para fechar todos os modais.',
    },
  },
  {
    id: 'v8.3',
    version: 'v8.3',
    date: '2026-05-03',
    title: {
      'en': 'Cleaner, calmer, faster',
      'pt-BR': 'Mais limpo, calmo e rápido',
    },
    body: {
      'en':
        'A round of polish across the whole app. The header collapses Settings, Help, and Sign Out into a single account menu. ' +
        'Add Transaction is now one clear button (with a checkbox if you\'re entering a batch). Charts speak your language. ' +
        'Edit Transaction hides raw OCR text behind a toggle. Filters in the transaction list only appear when you actually need them. ' +
        'Delete now asks for a second tap instead of an ugly browser dialog. And every modal closes on Escape.',
      'pt-BR':
        'Uma rodada de polimento em todo o app. O cabeçalho agrupa Configurações, Ajuda e Sair em um único menu da conta. ' +
        'Adicionar Transação agora é um botão claro (com uma caixa de seleção quando você está adicionando vários). Os gráficos falam seu idioma. ' +
        'Editar Transação esconde o texto bruto do OCR atrás de um botão. Os filtros da lista de transações só aparecem quando realmente precisa. ' +
        'Excluir agora pede um segundo toque em vez de uma caixa de diálogo do navegador. E todos os modais fecham com Esc.',
    },
  },
  {
    id: 'v8.2',
    version: 'v8.2',
    date: '2026-05-03',
    title: {
      'en': 'Friendlier first-run screens',
      'pt-BR': 'Telas iniciais mais amigáveis',
    },
    body: {
      'en':
        'When a section is empty — no transactions yet, no invoices yet — the app now shows a warm welcome card with a clear next step instead of a blank box. ' +
        'A single primary button gets you started, and a quiet hint reminds you that you can also forward receipts by email.',
      'pt-BR':
        'Quando uma seção está vazia — sem transações, sem notas fiscais — o app agora mostra um cartão de boas-vindas com um próximo passo claro em vez de uma caixa em branco. ' +
        'Um botão principal te coloca em movimento, e uma dica discreta lembra que você também pode encaminhar recibos por e-mail.',
    },
  },
  {
    id: 'v8.1',
    version: 'v8.1',
    date: '2026-05-03',
    title: {
      'en': 'Welcome tour for new users',
      'pt-BR': 'Tour de boas-vindas para novos usuários',
    },
    body: {
      'en':
        'A friendly 7-step walkthrough now greets first-time visitors right on the login screen — ' +
        'covering snap-a-receipt, email forwarding, organization, charts, and account settings. ' +
        'Tap "Take a quick tour" any time to revisit it in your preferred language.',
      'pt-BR':
        'Um tour amigável de 7 passos agora recebe os visitantes de primeira viagem diretamente na tela de login — ' +
        'mostrando como fotografar recibos, encaminhar por e-mail, organizar, ver gráficos e configurar a conta. ' +
        'Toque em "Fazer um tour rápido" a qualquer momento para revisitá-lo no seu idioma preferido.',
    },
  },
  {
    id: 'v8.0',
    version: 'v8.0',
    date: '2026-05-03',
    title: {
      'en': 'Settings now available everywhere',
      'pt-BR': 'Configurações disponíveis em todo lugar',
    },
    body: {
      'en':
        'The Settings (gear) button is now in the top header for every account, not just regular users. ' +
        'Admins, household admins, and contractors can now change their language, password, real email, ' +
        'and email-forwarding senders without needing someone else to do it for them.',
      'pt-BR':
        'O botão de Configurações (engrenagem) agora aparece no cabeçalho superior para todas as contas, ' +
        'não só usuários comuns. Administradores, administradores de família e contratados agora podem ' +
        'alterar seu idioma, senha, email real e remetentes de encaminhamento sem precisar de ninguém.',
    },
  },
  {
    id: 'v7.9',
    version: 'v7.9',
    date: '2026-05-01',
    title: {
      'en': 'Cleaner admin panel',
      'pt-BR': 'Painel admin mais limpo',
    },
    body: {
      'en':
        'The admin panel has a new home screen with quick actions and navigation tiles. ' +
        'The sidebar is now organized with a collapsible Manage group. ' +
        'Sign out moved to the top-right header, consistent with all other views.',
      'pt-BR':
        'O painel admin tem uma nova tela inicial com ações rápidas e atalhos de navegação. ' +
        'A barra lateral agora tem um grupo "Gerenciar" recolhível. ' +
        'O botão de sair foi movido para o cabeçalho superior direito, consistente com todas as outras telas.',
    },
  },
  {
    id: 'v7.8',
    version: 'v7.8',
    date: '2026-05-01',
    title: {
      'en': 'Help docs caught up',
      'pt-BR': 'Ajuda em dia',
    },
    body: {
      'en':
        "The in-app Help (?) panel and the README now cover everything " +
        "shipped recently: forwarding receipts by email, registering " +
        "sender addresses in Settings, the new \"Review ▾\" picker on " +
        "inbox cards, and the collapsible Dashboard sections. Open Help " +
        "any time you want a refresher.",
      'pt-BR':
        'O painel de Ajuda (?) dentro do app e o README agora cobrem ' +
        'tudo que foi lançado recentemente: encaminhamento de recibos ' +
        'por e-mail, cadastro de remetentes em Configurações, o novo ' +
        'seletor "Revisar ▾" nos cartões da caixa de entrada e as ' +
        'seções recolhíveis do Painel. Abra a Ajuda quando precisar.',
    },
  },
  {
    id: 'v7.7',
    version: 'v7.7',
    date: '2026-05-02',
    title: {
      'en': 'Code cleanup + smarter vendor handling',
      'pt-BR': 'Limpeza de código + melhor gestão de fornecedores',
    },
    body: {
      'en':
        "Removed the automatic vendor-to-category learning that ran silently " +
        "on every save — it was the source of recent save errors and is no " +
        "longer needed now that the global vendor catalog handles auto-fill. " +
        "Also cleaned up duplicated internal code to keep the app fast and " +
        "easier to maintain.",
      'pt-BR':
        "Removemos o aprendizado automático de fornecedor para categoria que " +
        "rodava silenciosamente a cada salvamento — era a causa dos erros " +
        "recentes e não é mais necessário, pois o catálogo global de " +
        "fornecedores já cuida do preenchimento automático. Também limpamos " +
        "código interno duplicado para manter o app rápido e fácil de manter.",
    },
  },
  {
    id: 'v7.6',
    version: 'v7.6',
    date: '2026-05-02',
    title: {
      'en': 'Vendor auto-fill works again',
      'pt-BR': 'Preenchimento automático do fornecedor voltou a funcionar',
    },
    body: {
      'en':
        "When you save a transaction, the app remembers which category " +
        "you picked for that vendor and auto-fills it next time. A " +
        "schema tweak a few days ago quietly broke that learning step, " +
        "so it had been failing in the background. Fixed — your saves " +
        "now memorize vendor → category like before, and the noisy " +
        "console errors during save are gone.",
      'pt-BR':
        "Quando você salva uma transação, o app lembra qual categoria " +
        "você escolheu para aquele fornecedor e preenche automaticamente " +
        "na próxima vez. Uma alteração no esquema de alguns dias atrás " +
        "quebrou silenciosamente esse aprendizado. Corrigido — seus " +
        "salvamentos agora memorizam fornecedor → categoria como antes, " +
        "e os erros barulhentos no console durante o salvamento sumiram.",
    },
  },
  {
    id: 'v7.5',
    version: 'v7.5',
    date: '2026-04-30',
    title: {
      'en': 'Tidier dashboard + smaller review menu',
      'pt-BR': 'Painel mais arrumado + menu de revisão menor',
    },
    body: {
      'en':
        "Each section on the dashboard — Email Inbox, Summary, Spending " +
        "charts, and Transactions — now has a small chevron next to its " +
        "title that lets you collapse or expand it. Your choices stick " +
        "across reloads on this device. We also shrunk the inbox " +
        "\"Review\" action down to a single compact button with a " +
        "dropdown for Receipt vs Invoice, so the cards don't dominate " +
        "the page anymore.",
      'pt-BR':
        'Cada seção do painel — Caixa de Entrada, Resumo, Gráficos de ' +
        'gastos e Transações — agora tem uma pequena seta ao lado do ' +
        'título que permite recolher ou expandir. Suas escolhas ficam ' +
        'salvas neste dispositivo. Também encolhemos o botão "Revisar" ' +
        'da caixa de entrada para um botão compacto com menu suspenso ' +
        'entre Recibo e Nota Fiscal, então os cartões não dominam mais ' +
        'a página.',
    },
  },
  {
    id: 'v7.4',
    version: 'v7.4',
    date: '2026-04-30',
    title: {
      'en': 'You pick: receipt or invoice',
      'pt-BR': 'Você escolhe: recibo ou nota fiscal',
    },
    body: {
      'en':
        "Each item in your email inbox now has two clear buttons — " +
        "\"Review as Receipt\" and \"Review as Invoice\" — so the system " +
        "doesn't have to guess what you forwarded. The form runs full OCR " +
        "after you pick (works for both images and PDFs), so vendor, amount, " +
        "and date pre-fill themselves the same way as a direct upload. You " +
        "can also click any attachment thumbnail in the form to open it " +
        "full-size in a new tab.",
      'pt-BR':
        'Cada item da sua caixa de entrada de e-mail agora tem dois botões ' +
        'claros — "Revisar como Recibo" e "Revisar como Nota Fiscal" — ' +
        'então o sistema não precisa adivinhar o que você encaminhou. O ' +
        'formulário roda o OCR completo depois da sua escolha (funciona ' +
        'para imagens e PDFs), então fornecedor, valor e data são ' +
        'preenchidos automaticamente. Você também pode clicar em qualquer ' +
        'miniatura de anexo no formulário para abrir em tamanho original.',
    },
  },
  {
    id: 'v7.3',
    version: 'v7.3',
    date: '2026-04-30',
    title: {
      'en': 'Email inbox fixes + mobile polish',
      'pt-BR': 'Correções na caixa de entrada de e-mail + ajustes para celular',
    },
    body: {
      'en':
        "Fixed two issues with email-forwarded receipts: the attachment " +
        "thumbnails now show in your inbox, and tapping \"Review & Accept\" " +
        "actually opens the form with the receipt or invoice attached. We " +
        "also tightened the inbox cards on mobile so the subject line wraps " +
        "instead of getting cut off, and added a clear notice when an " +
        "attachment couldn't be auto-read so you know to fill the fields " +
        "in by hand.",
      'pt-BR':
        'Corrigimos dois problemas com recibos enviados por e-mail: as ' +
        'miniaturas dos anexos agora aparecem na sua caixa de entrada, e ' +
        'tocar em "Revisar e Aceitar" realmente abre o formulário com o ' +
        'recibo ou nota anexado. Também ajustamos os cartões da caixa de ' +
        'entrada no celular para que o assunto quebre em várias linhas em ' +
        'vez de ser cortado, e adicionamos um aviso claro quando um anexo ' +
        'não pôde ser lido automaticamente.',
    },
  },
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
