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
    id: 'v11.5',
    version: 'v11.5',
    date: '2026-07-08',
    title: {
      'en': 'The bell now shows real notifications',
      'pt-BR': 'O sininho agora mostra notificações de verdade',
    },
    body: {
      'en':
        "The bell in the top corner is now a real notification center. It lights up with a count when there's something new for you — a new message on an estimate you're part of, a new estimate or invoice submitted in your household, or an estimate/invoice that was reviewed or marked paid. Tap the bell to see the list, tap any item to mark it read, or use \"Mark all read\". " +
        "You'll only be notified about things that involve you: you never get a note about your own action, and contractors only hear about the estimates and invoices they submitted. (\"What's New\" — this window — now lives at the bottom of the screen.)",
      'pt-BR':
        "O sininho no canto superior agora é uma central de notificações de verdade. Ele acende com um número quando há algo novo para você — uma nova mensagem em um orçamento do qual você participa, um novo orçamento ou nota fiscal enviado na sua propriedade, ou um orçamento/nota que foi avaliado ou marcado como pago. Toque no sininho para ver a lista, toque em um item para marcá-lo como lido, ou use \"Marcar tudo como lido\". " +
        "Você só é notificado sobre coisas que envolvem você: nunca recebe aviso da sua própria ação, e prestadores só são avisados sobre os orçamentos e notas que eles mesmos enviaram. (As \"Novidades\" — esta janela — agora ficam na parte de baixo da tela.)",
    },
  },
  {
    id: 'v11.4',
    version: 'v11.4',
    date: '2026-07-07',
    title: {
      'en': 'Household admins can submit estimates',
      'pt-BR': 'Admins de propriedade podem enviar orçamentos',
    },
    body: {
      'en':
        "If you're a household admin, you'll now find a Submit Estimate button right next to Add Transaction and Submit Invoice at the top of your panel — so you can file your own estimates without any workarounds.",
      'pt-BR':
        "Se você é admin de propriedade, agora encontra um botão Enviar Orçamento logo ao lado de Adicionar Transação e Enviar Nota Fiscal no topo do seu painel — assim você pode registrar seus próprios orçamentos sem contornos.",
    },
  },
  {
    id: 'v11.3',
    version: 'v11.3',
    date: '2026-07-06',
    title: {
      'en': 'A cleaner, simpler home',
      'pt-BR': 'Uma tela inicial mais limpa e simples',
    },
    body: {
      'en':
        "We tidied up the home screen. It now leads with your main actions and your transactions, and the Summary and charts are tucked into a single \"Insights\" section you can open when you want it. " +
        "You'll also find a Submit button right inside the Estimates and Invoices screens, so you no longer have to go back to the home page to start one. " +
        "Finally, \"What's New\" (this window) has moved to a link at the bottom of the screen — freeing up the bell for real notifications coming soon.",
      'pt-BR':
        "Deixamos a tela inicial mais organizada. Agora ela começa com suas ações principais e suas transações, e o Resumo e os gráficos ficam reunidos em uma única seção \"Análises\" que você abre quando quiser. " +
        "Você também encontra um botão Enviar dentro das telas de Orçamentos e Notas, então não precisa mais voltar à tela inicial para começar um. " +
        "Por fim, as \"Novidades\" (esta janela) foram para um link na parte de baixo da tela — liberando o sininho para notificações de verdade, que chegam em breve.",
    },
  },
  {
    id: 'v11.2',
    version: 'v11.2',
    date: '2026-07-05',
    title: {
      'en': 'Email commands + activity nudges',
      'pt-BR': 'Comandos por e-mail + avisos de atividade',
    },
    body: {
      'en':
        "Two email additions. Email receipts@90ten.life with a one-word subject and get an instant reply: send \"help\" for the command list, or (admins & household admins) \"estimates\" or \"invoices\" for a quick status summary. It only works from the email address saved on your profile. " +
        "And whenever there's new activity on an invoice or estimate in one of your properties, everyone in that property now gets a short heads-up email so they can check in — contractors only hear about the invoices and estimates they submitted themselves.",
      'pt-BR':
        "Duas novidades por e-mail. Envie um e-mail para receipts@90ten.life com uma palavra no assunto e receba uma resposta na hora: mande \"help\" para ver os comandos, ou (admins e admins de propriedade) \"estimates\" ou \"invoices\" para um resumo rápido. Só funciona a partir do e-mail salvo no seu perfil. " +
        "E sempre que houver nova atividade em uma nota ou orçamento de uma das suas propriedades, todos naquela propriedade agora recebem um aviso curto por e-mail para dar uma olhada — prestadores só são avisados sobre as notas e orçamentos que eles mesmos enviaram.",
    },
  },
  {
    id: 'v11.1',
    version: 'v11.1',
    date: '2026-07-05',
    title: {
      'en': 'Estimate reports for your team',
      'pt-BR': 'Relatórios de orçamentos para sua equipe',
    },
    body: {
      'en':
        'Admins and household admins get a new Estimate report — see how many estimates were submitted, accepted, and rejected, your acceptance rate, average decision time, and a per-contractor breakdown. ' +
        'A separate "Open & aging" view lists every estimate still awaiting a decision, oldest first, so nothing slips through the cracks. ' +
        'Estimate activity (submitted, accepted, rejected) now also shows up in the Activity report alongside receipts and invoices.',
      'pt-BR':
        'Administradores e admins de propriedade têm um novo Relatório de orçamentos — veja quantos orçamentos foram enviados, aceitos e recusados, sua taxa de aceitação, o tempo médio de decisão e um detalhamento por prestador. ' +
        'Uma aba separada, "Abertos e parados", lista todos os orçamentos ainda aguardando decisão, dos mais antigos primeiro, para que nada passe despercebido. ' +
        'A atividade de orçamentos (enviados, aceitos, recusados) agora também aparece no Relatório de atividade, ao lado de recibos e notas.',
    },
  },
  {
    id: 'v11.0',
    version: 'v11.0',
    date: '2026-07-05',
    title: {
      'en': 'Talk through estimates as a team',
      'pt-BR': 'Converse sobre orçamentos em equipe',
    },
    body: {
      'en':
        "Everyone on a property can now take part in an estimate's conversation — not just the person who submitted it and admins. " +
        "If you're a household admin or a regular member of the property, you can now post messages in any estimate thread you can see, ask questions, and weigh in. " +
        "(Other contractors on the property still see estimates read-only.)",
      'pt-BR':
        'Agora todos em uma propriedade podem participar da conversa de um orçamento — não apenas quem o enviou e os administradores. ' +
        'Se você é administrador da casa ou membro comum da propriedade, agora pode enviar mensagens em qualquer conversa de orçamento que consiga ver, tirar dúvidas e opinar. ' +
        '(Outros prestadores na propriedade continuam vendo os orçamentos somente leitura.)',
    },
  },
  {
    id: 'v10.9',
    version: 'v10.9',
    date: '2026-07-05',
    title: {
      'en': 'Estimate fixes + fully translated chat',
      'pt-BR': 'Correções de orçamentos + chat traduzido',
    },
    body: {
      'en':
        'Two fixes to the estimates feature. You can now submit a new estimate at any time — the submit button was disappearing once your dashboard filled up with estimates shared from your network. ' +
        'And every message in the estimates area, including the conversation thread and invite notices, now appears fully in your selected language.',
      'pt-BR':
        'Duas correções no recurso de orçamentos. Agora você pode enviar um novo orçamento a qualquer momento — o botão de enviar sumia quando o seu painel enchia de orçamentos compartilhados pela sua rede. ' +
        'E todas as mensagens na área de orçamentos, incluindo a conversa e os avisos de convite, agora aparecem totalmente no idioma selecionado.',
    },
  },
  {
    id: 'v10.8',
    version: 'v10.8',
    date: '2026-07-05',
    title: {
      'en': 'Invite anyone into an estimate',
      'pt-BR': 'Convide qualquer pessoa para um orçamento',
    },
    body: {
      'en':
        'Admins can now invite any user into a specific estimate\'s conversation — even someone who isn\'t a contractor or household member. ' +
        'Open an estimate in the Estimates section, scroll to "Invited participants", type a username, and tap Invite. ' +
        'The invited user immediately sees the estimate in their dashboard and can join the message thread with full read/write access.',
      'pt-BR':
        'Administradores agora podem convidar qualquer usuário para a conversa de um orçamento específico — mesmo quem não é prestador ou membro da propriedade. ' +
        'Abra um orçamento na seção Orçamentos, role até "Participantes convidados", digite um nome de usuário e toque em Convidar. ' +
        'O usuário convidado vê imediatamente o orçamento no seu painel e pode participar da conversa com acesso completo de leitura e escrita.',
    },
  },
  {
    id: 'v10.7',
    version: 'v10.7',
    date: '2026-07-03',
    title: {
      'en': 'Network estimates + billing type',
      'pt-BR': 'Orçamentos da rede + tipo de cobrança',
    },
    body: {
      'en':
        "Two improvements to estimates. First — anyone who shares a property with the contractor can now see their estimates, not just the admin. Open the Estimates section on your dashboard and you'll find quotes from contractors working on your properties, complete with attachments and the conversation thread (read-only). " +
        "Second — every new estimate now requires a billing type: \"Total bill\" or \"Labor only (materials separate)\". This shows as a badge on every estimate card so everyone knows at a glance whether materials are included.",
      'pt-BR':
        'Duas melhorias nos orçamentos. Primeiro — qualquer pessoa que compartilha uma propriedade com o prestador agora pode ver seus orçamentos, não apenas o administrador. Abra a seção Orçamentos no seu painel e encontrará cotações de prestadores que trabalham nas suas propriedades, com anexos e a conversa completa (somente leitura). ' +
        'Segundo — todo novo orçamento agora exige um tipo de cobrança: "Valor total" ou "Somente mão de obra (materiais à parte)". Isso aparece como um selo em cada card de orçamento para que todos saibam de relance se os materiais estão incluídos.',
    },
  },
  {
    id: 'v10.6',
    version: 'v10.6',
    date: '2026-07-02',
    title: {
      'en': 'Admins can submit estimates too',
      'pt-BR': 'Administradores também podem enviar orçamentos',
    },
    body: {
      'en':
        "Estimates aren't just for contractors anymore. If a subcontractor sends you a quote directly, you can now log it yourself — there's a “Submit an estimate” button on your admin home. Pick any property, attach the JPEG or PDF, and it lands in the Estimates section like any other, ready to accept, reject, or discuss.",
      'pt-BR':
        'Os orçamentos não são mais só para prestadores. Se um subcontratado lhe envia uma cotação diretamente, agora você mesmo pode registrá-la — há um botão “Enviar um orçamento” na sua tela inicial de administrador. Escolha qualquer propriedade, anexe o JPEG ou PDF, e ele aparece na seção Orçamentos como qualquer outro, pronto para aceitar, recusar ou discutir.',
    },
  },
  {
    id: 'v10.5',
    version: 'v10.5',
    date: '2026-07-01',
    title: {
      'en': 'Estimates — submit quotes and chat about them',
      'pt-BR': 'Orçamentos — envie cotações e converse sobre elas',
    },
    body: {
      'en':
        "Contractors can now submit estimates, not just invoices. Tap “Submit an estimate”, pick the property, give it a title, and attach a JPEG or PDF — that's it. " +
        "Every estimate has its own conversation thread, so you and the admin can go back and forth right on the estimate: ask questions, clarify scope, agree on a number. A little red badge shows when there's a new message waiting. " +
        "Admins review all estimates from the new Estimates section, accept or reject them, and reply in the same thread. Estimate files are kept on file until an admin deletes them.",
      'pt-BR':
        'Os prestadores agora podem enviar orçamentos, não apenas notas. Toque em “Enviar um orçamento”, escolha a propriedade, dê um título e anexe um JPEG ou PDF — pronto. ' +
        'Cada orçamento tem sua própria conversa, então você e o administrador podem trocar mensagens ali mesmo: tirar dúvidas, esclarecer o escopo, combinar um valor. Um selo vermelho mostra quando há uma nova mensagem esperando. ' +
        'Os administradores revisam todos os orçamentos na nova seção Orçamentos, aceitam ou recusam, e respondem na mesma conversa. Os arquivos de orçamento ficam guardados até que um administrador os exclua.',
    },
  },
  {
    id: 'v10.4',
    version: 'v10.4',
    date: '2026-06-15',
    title: {
      'en': 'Bulk-assign categories, edit invoices in one shot',
      'pt-BR': 'Atribuir categorias em lote, editar notas em uma janela',
    },
    body: {
      'en':
        "Two quality-of-life wins for admins. First — when you open a household in Manage Households, there's now a Categories section with a checkbox list. Tick or untick to assign categories to that household; saves automatically as you go. No more opening the category modal ten times after creating a new property. " +
        "Second — invoice review now has a single Edit button (replacing the old Assign Category one) that opens a dialog with Property, Category, and Admin notes all editable in one place. Change any combination and tap Save.",
      'pt-BR':
        'Duas melhorias rápidas para administradores. Primeiro — ao abrir um domicílio em Gerenciar Domicílios, agora aparece uma seção Categorias com lista de marcação. Marque ou desmarque para atribuir categorias àquele domicílio; salva automaticamente conforme você clica. Não precisa mais abrir a janela de cada categoria dez vezes depois de criar uma nova propriedade. ' +
        'Segundo — a revisão de notas agora tem um único botão Editar (no lugar do antigo Atribuir Categoria) que abre uma janela com Propriedade, Categoria e Notas do admin todos editáveis no mesmo lugar. Mude o que quiser e toque em Salvar.',
    },
  },
  {
    id: 'v10.3',
    version: 'v10.3',
    date: '2026-06-09',
    title: {
      'en': 'Activity report: filter by person on both tabs',
      'pt-BR': 'Relatório de atividade: filtrar por pessoa nas duas abas',
    },
    body: {
      'en':
        "A small but useful follow-up to the Activity screen. The Person filter is now available from the moment you open the report — no need to wait for results to load — and it works on the Last logins tab too, alongside the Household filter. So you can quickly answer questions like 'when did Alex last sign in?' or 'show me everyone in Beach House who hasn't logged in for a while'.",
      'pt-BR':
        'Um ajuste pequeno mas útil na tela de Atividade. O filtro de Pessoa agora aparece desde o momento em que você abre o relatório — sem precisar esperar os resultados carregarem — e também funciona na aba de Últimos acessos, junto com o filtro de Domicílio. Assim dá para responder rapidamente perguntas como "quando o Alex entrou pela última vez?" ou "me mostre quem da Casa de Praia está sem acessar há um tempo".',
    },
  },
  {
    id: 'v10.2',
    version: 'v10.2',
    date: '2026-06-08',
    title: {
      'en': 'See who is active across your team',
      'pt-BR': 'Veja quem está ativo na sua equipe',
    },
    body: {
      'en':
        "Admins and household admins have a new Activity screen. It shows a clean timeline of who submitted receipts, who submitted invoices, and what's been marked paid — across the people you oversee. Tap any row to jump straight into the underlying receipt or invoice. " +
        "There's also a Last logins tab so you can spot who hasn't signed in for a while. Full admins see everyone; household admins see the contractors and members of their own households. Filters for date range, household, person, and event type are right at the top.",
      'pt-BR':
        'Administradores e administradores de domicílio agora têm uma tela de Atividade. Ela mostra uma linha do tempo com quem enviou recibos, quem enviou notas e o que foi marcado como pago — entre as pessoas que você acompanha. Toque em qualquer linha para abrir o recibo ou a nota correspondente. ' +
        'Há também uma aba de Últimos acessos para identificar quem não entra há um tempo. Administradores completos veem todos; administradores de domicílio veem os prestadores e membros dos seus próprios domicílios. Os filtros de período, domicílio, pessoa e tipo de evento ficam no topo.',
    },
  },
  {
    id: 'v10.1',
    version: 'v10.1',
    date: '2026-05-24',
    title: {
      'en': 'Work-in-progress photos & smarter notifications',
      'pt-BR': 'Fotos do trabalho e notificações mais inteligentes',
    },
    body: {
      'en':
        "Two things this release. First — when you submit a receipt or contractor invoice, you can now attach photos of the work itself: before/after shots, materials, the leak you just fixed. No more digging through WhatsApp to find what the job looked like. Photos are saved as compact JPEGs so they don't eat up storage. " +
        "Second — admins (full and household) now get an email the moment a contractor submits a new receipt or invoice. And if you go two weeks without using LedgerX, you'll get a gentle (random, slightly silly) nudge with a link straight back in. We escalate gracefully: a second nudge at 30 days, then about monthly, so no spam.",
      'pt-BR':
        'Duas novidades nesta versão. Primeiro — ao enviar um recibo ou nota de prestador, agora você pode anexar fotos do trabalho em si: antes/depois, materiais, o vazamento que acabou de consertar. Chega de procurar no WhatsApp para lembrar como ficou o serviço. As fotos são salvas como JPEGs compactos para não estourar o armazenamento. ' +
        'Segundo — administradores (completos e de domicílio) agora recebem um e-mail no momento em que um prestador envia um novo recibo ou nota. E se ficar duas semanas sem usar o LedgerX, você recebe um lembrete leve (aleatório, um pouco bobo) com um link direto. A cadência é educada: um segundo lembrete em 30 dias, depois aproximadamente mensal — sem spam.',
    },
  },
  {
    id: 'v10.0',
    version: 'v10.0',
    date: '2026-05-18',
    title: {
      'en': 'Sort your transactions',
      'pt-BR': 'Ordene suas transações',
    },
    body: {
      'en':
        "The transactions list now has a sort control next to the search box. Pick newest or oldest date, highest or lowest amount, or sort alphabetically by vendor or category — it updates instantly without re-loading. " +
        "Sort works on top of any filters you have applied, so you can narrow to a category or household and then re-order what's left.",
      'pt-BR':
        'A lista de transações agora tem um controle de ordenação ao lado da busca. Escolha por data mais recente ou mais antiga, valor maior ou menor, ou ordene alfabeticamente por fornecedor ou categoria — atualiza na hora, sem recarregar. ' +
        'A ordenação se aplica em cima dos filtros, então você pode restringir a uma categoria ou domicílio e depois reordenar o que sobrar.',
    },
  },
  {
    id: 'v9.9',
    version: 'v9.9',
    date: '2026-05-17',
    title: {
      'en': 'Email Inbox now visible to admins',
      'pt-BR': 'Caixa de Entrada agora visível para administradores',
    },
    body: {
      'en':
        "Admins and household admins forwarded receipts to receipts@90ten.life but never saw the resulting cards — the inbox panel only existed on the regular dashboard. " +
        "It now appears on the admin home view too, so every account that can register a sender address can also review the items that arrive. " +
        "Full admins also see a small inbound-activity diagnostic so you can confirm new forwards are reaching the database even when your own inbox is empty.",
      'pt-BR':
        'Administradores e administradores de domicílio encaminhavam recibos para receipts@90ten.life mas nunca viam os cards resultantes — o painel da caixa de entrada só existia no painel comum. ' +
        'Agora ele também aparece na tela inicial do administrador, para que qualquer conta que possa cadastrar um endereço também consiga revisar os itens recebidos. ' +
        'Administradores completos também veem um diagnóstico compacto da atividade de entrada para confirmar que novos encaminhamentos estão chegando ao banco, mesmo quando a sua própria caixa está vazia.',
    },
  },
  {
    id: 'v9.8',
    version: 'v9.8',
    date: '2026-05-15',
    title: {
      'en': 'Email Inbox: re-forward fixes and richer cards',
      'pt-BR': 'Caixa de Entrada: reencaminhar volta a funcionar e cards mais informativos',
    },
    body: {
      'en':
        "If you discarded an email-forwarded receipt and then forwarded it again, the second copy used to vanish silently — the system thought it had already seen it. " +
        "Now the inbox only treats a Message-ID as a duplicate when there's still a pending row for it, so re-forwards land cleanly. " +
        "Cards also now show the extracted vendor, amount, and date as small pills so you can tell similar items apart without opening them, and the inbox refreshes automatically when you switch back to the LedgerX tab.",
      'pt-BR':
        'Se você descartava um recibo encaminhado por e-mail e depois o reenviava, a segunda cópia sumia em silêncio — o sistema achava que já tinha visto. ' +
        'Agora a caixa de entrada só considera duplicado quando ainda existe uma linha pendente para aquela mensagem, então reencaminhamentos aparecem normalmente. ' +
        'Os cards também mostram fornecedor, valor e data extraídos como etiquetas pequenas, e a caixa atualiza automaticamente quando você volta para a aba do LedgerX.',
    },
  },
  {
    id: 'v9.7',
    version: 'v9.7',
    date: '2026-05-11',
    title: {
      'en': 'Smarter year-detection on receipt scans',
      'pt-BR': 'Detecção de ano mais inteligente em recibos',
    },
    body: {
      'en':
        "Receipt scanning occasionally misread a year digit (typically turning a 6 into a 3) and saved expenses with dates years in the past. " +
        "We now sanity-check the year against today's date — if the scanned year falls outside a plausible window, we substitute the current year while keeping the month and day exactly as scanned. " +
        "You can still edit the date on the form if anything looks off.",
      'pt-BR':
        'O escaneamento de recibos às vezes lia um dígito do ano errado (geralmente trocando 6 por 3) e salvava despesas com datas anos no passado. ' +
        'Agora validamos o ano em relação à data de hoje — se o ano detectado estiver fora de uma faixa plausível, substituímos pelo ano atual mantendo o mês e o dia exatamente como foram lidos. ' +
        'Você ainda pode editar a data no formulário se algo parecer errado.',
    },
  },
  {
    id: 'v9.6',
    version: 'v9.6',
    date: '2026-05-10',
    title: {
      'en': 'Email forwarding now matches every sender format',
      'pt-BR': 'Encaminhamento de e-mails reconhece todos os formatos de remetente',
    },
    body: {
      'en':
        "Fixed a quiet bug in the Email Inbox: when a forwarded email arrived with the sender shown as \"Your Name <you@example.com>\" instead of just \"you@example.com\", it wasn't being matched to your account and the message silently disappeared. " +
        "The inbound handler now extracts the bare address from any common From-header format before looking it up, so anything you added under Settings → Email Forwarding will work regardless of how your email client labels the sender.",
      'pt-BR':
        'Corrigimos um bug silencioso na Caixa de Entrada por E-mail: quando um e-mail encaminhado chegava com o remetente no formato "Seu Nome <voce@exemplo.com>" em vez de apenas "voce@exemplo.com", ele não era associado à sua conta e a mensagem sumia sem aviso. ' +
        'O processador agora extrai o endereço puro de qualquer formato comum de cabeçalho From antes de consultar, então qualquer endereço cadastrado em Configurações → Encaminhamento de E-mail vai funcionar, não importa como seu cliente de e-mail rotule o remetente.',
    },
  },
  {
    id: 'v9.5',
    version: 'v9.5',
    date: '2026-05-08',
    title: {
      'en': 'Email notifications for invoices',
      'pt-BR': 'Notificações por e-mail para faturas',
    },
    body: {
      'en':
        "LedgerX now sends automatic email notifications at two key moments: when a contractor or household admin submits a new invoice, all full admins receive an email summary so nothing slips through the cracks; " +
        "and when an admin marks an invoice as paid, the submitter gets a confirmation email. " +
        "Notifications only go to accounts that have a real email address on file — no action needed if you're already set up.",
      'pt-BR':
        'O LedgerX agora envia notificações automáticas por e-mail em dois momentos importantes: quando um contratado ou administrador de propriedade envia uma nova fatura, todos os administradores recebem um resumo por e-mail para que nada passe despercebido; ' +
        'e quando um administrador marca uma fatura como paga, o remetente recebe um e-mail de confirmação. ' +
        'As notificações só são enviadas para contas que possuem um endereço de e-mail real cadastrado — nenhuma ação necessária se você já estiver configurado.',
    },
  },
  {
    id: 'v9.4',
    version: 'v9.4',
    date: '2026-05-08',
    title: {
      'en': 'Under-the-hood reliability fixes',
      'pt-BR': 'Melhorias internas de confiabilidade',
    },
    body: {
      'en':
        "A batch of code quality fixes: receipt scanning now times out cleanly after 30 seconds instead of hanging forever; " +
        "saving a user's property assignments now surfaces errors immediately if something goes wrong instead of silently ignoring them; " +
        "the category security check was tightened so users can only retrieve categories for properties they actually belong to.",
      'pt-BR':
        'Uma série de melhorias de qualidade: o escaneamento de recibos agora encerra corretamente após 30 segundos em vez de travar indefinidamente; ' +
        'ao salvar as atribuições de propriedades de um usuário, erros agora são exibidos imediatamente em vez de serem ignorados silenciosamente; ' +
        'a verificação de segurança de categorias foi reforçada para que usuários só possam acessar categorias das propriedades às quais realmente pertencem.',
    },
  },
  {
    id: 'v9.3',
    version: 'v9.3',
    date: '2026-05-08',
    title: {
      'en': 'Category picker properly scoped per property',
      'pt-BR': 'Seletor de categorias corretamente limitado por propriedade',
    },
    body: {
      'en':
        "Completed the fix for the category picker. The previous attempt missed that permission rules were hiding other properties' category assignments from regular users, making scoped categories look global. " +
        "The picker now runs a server-side check that correctly identifies whether a category belongs to the selected property or is truly available to everyone — no more stray categories showing up where they shouldn't.",
      'pt-BR':
        'Concluímos a correção do seletor de categorias. A tentativa anterior não considerou que as regras de permissão ocultavam as atribuições de categorias de outras propriedades para usuários comuns, fazendo com que categorias restritas parecessem globais. ' +
        'O seletor agora realiza uma verificação no servidor que identifica corretamente se uma categoria pertence à propriedade selecionada ou está realmente disponível para todos — sem mais categorias aparecendo onde não deveriam.',
    },
  },
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
