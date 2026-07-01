# LedgerX

Um rastreador de despesas seguro e compartilhado para residências e equipes. Registre gastos, escaneie recibos, gere relatórios e mantenha todos na mesma página — tudo em uma interface limpa.

---

## Sumário

- [Primeiros Passos](#primeiros-passos)
- [Fazendo Login](#fazendo-login)
- [Visão Geral do Painel](#visão-geral-do-painel)
- [Adicionar uma Transação](#adicionar-uma-transação)
- [Leitura de Recibos e OCR](#leitura-de-recibos-e-ocr)
- [Caixa de Entrada de E-mail (Encaminhar Recibos)](#caixa-de-entrada-de-e-mail-encaminhar-recibos)
- [Visualizar, Editar e Pesquisar Transações](#visualizar-editar-e-pesquisar-transações)
- [Enviar Recibos](#enviar-recibos)
- [Gráficos de Gastos](#gráficos-de-gastos)
- [Exportar Seus Dados](#exportar-seus-dados)
- [Relatórios](#relatórios)
- [Consulta de NPI de Cirurgião](#consulta-de-npi-de-cirurgião)
- [Atalhos de teclado](#atalhos-de-teclado)
- [Configurações da Conta](#configurações-da-conta)
- [Gerenciar Residências](#gerenciar-residências)
- [Recursos de Administrador](#recursos-de-administrador)
- [FAQ e Solução de Problemas](#faq-e-solução-de-problemas)

---

## Primeiros Passos
<!-- roles: contractor, member, admin -->

O LedgerX foi criado para residências e pequenas equipes que querem uma forma compartilhada e organizada de acompanhar despesas. Seja dividindo custos com colegas, registrando recibos de trabalho ou administrando um orçamento familiar, o LedgerX mantém tudo em um só lugar.

**O que você pode fazer:**

- Registrar despesas com fornecedor, valor, data, categoria e observações
- Escanear recibos com OCR — os campos são preenchidos automaticamente
- Anexar várias fotos de recibos ou PDFs a qualquer transação
- Ver resumos e gráficos de gastos direto no painel
- Exportar dados em CSV ou PDF com as imagens dos recibos incorporadas
- Pertencer a várias residências e acompanhar cada uma separadamente
- Administradores podem gerenciar usuários, residências e categorias

---

## Fazendo Login
<!-- roles: contractor, member, admin -->

1. Abra o aplicativo em **ledger.90ten.life** no navegador.
2. Digite seu **nome de usuário** e **senha**.
3. Clique em **Entrar**.

> **Nota:** O LedgerX usa login por nome de usuário — nenhum e-mail é necessário para entrar. Se ainda não tiver conta, peça ao seu administrador para criar uma.

### Primeira vez aqui? Faça o tour

A tela de login tem um botão **Fazer um tour rápido** que abre um passo a passo de 7 telas — captura de recibos, encaminhamento por e-mail, organização, gráficos e configurações. Na primeira visita ele abre automaticamente, mas você pode reabri-lo a qualquer momento, em inglês ou português.

**Esqueceu sua senha?**

Se você adicionou um e-mail à sua conta (em Configurações), clique em **Esqueceu a senha?** na tela de login e um link de redefinição será enviado por e-mail. Se ainda não definiu um e-mail, peça ao administrador para redefini-la.

---

## Visão Geral do Painel
<!-- roles: member, admin -->

Após entrar, você verá o **Painel** — sua tela inicial.

### Cartões de Resumo

Quatro cartões no topo mostram um panorama rápido dos gastos:

| Cartão | O que mostra |
|---|---|
| **Hoje** | Total gasto hoje |
| **Esta Semana** | Total gasto nos últimos 7 dias |
| **Este Mês** | Total gasto no mês atual |
| **Transações** | Número total de transações registradas |

### Ações Rápidas

O botão **Adicionar Transação** é o cartão verde em destaque no topo — essa é a ação principal do dia a dia. **Exportar Dados** e **Relatórios** ficam logo abaixo como pequenos links de texto, já que você só usa de vez em quando.

| Ação | O que faz |
|---|---|
| **Adicionar Transação** | Abre o formulário para registrar uma nova despesa |
| **Exportar Dados** | Baixa suas transações em CSV ou PDF |
| **Relatórios** | Mostra relatórios de gastos filtrados |

Se você pertence a várias residências, use o **seletor de residência** para alternar entre elas. Tudo — transações, exportações, gráficos — fica restrito à residência selecionada.

### Menu da conta (avatar no canto superior direito)

O cabeçalho mostra apenas dois ícones à direita: o **sino** para Novidades e seu **avatar** — um único menu suspenso que contém **Configurações**, **Ajuda** e **Sair**, com a versão do app no rodapé. Toque fora do menu (ou pressione **Esc**) para fechar.

### Seções Recolhíveis

Cada área principal do Painel — **Caixa de Entrada**, **Resumo**, **Gráficos de gastos** e **Transações** — tem uma pequena seta (▾) ao lado do título. Toque no título da seção para recolher; toque novamente para expandir. Suas escolhas ficam salvas neste dispositivo entre recargas, então você pode ocultar as partes que não usa no dia a dia e manter a página arrumada.

A seção **Caixa de Entrada** só aparece quando há pelo menos um item encaminhado aguardando revisão.

---

## Adicionar uma Transação
<!-- roles: contractor, member, admin -->

1. Toque em **Adicionar Transação** no Painel.
2. Preencha os detalhes:
   - **Residência** — A qual residência pertence esta despesa
   - **Data** — Quando a compra foi feita
   - **Valor** — Custo total
   - **Fornecedor** — Nome da loja, restaurante, etc.
   - **Categoria** — Escolha entre as categorias da sua residência
   - **Observações** — Detalhes adicionais (opcional)
   - **Recibo** — Anexe uma foto ou PDF (opcional)
3. Clique em **Salvar recibo**.

**Vai registrar vários de uma vez?** Marque **"Continuar adicionando recibos depois deste"** acima do botão Salvar. O formulário se reinicia e fica aberto, então você passa por uma pilha de recibos sem reabrir a janela. Pressione **Esc** a qualquer momento para fechar.

**Dica:** Se você já registrou uma compra do mesmo fornecedor antes, a categoria pode ser preenchida automaticamente com base no histórico.

---

## Leitura de Recibos e OCR
<!-- roles: contractor, member, admin -->

O LedgerX pode ler seu recibo e preencher o formulário automaticamente.

### Como funciona

1. Ao adicionar uma transação, anexe uma imagem do recibo (JPG, PNG ou PDF).
2. O aplicativo escaneia o primeiro recibo automaticamente e extrai:
   - Nome do fornecedor
   - Valor total
   - Data
   - Quaisquer anotações manuscritas no recibo
3. Revise os campos preenchidos e ajuste o que a leitura não captou.

A leitura de recibos foi simplificada para esses quatro campos — não
tenta detalhar itens, impostos, gorjeta ou forma de pagamento. A
categoria é preenchida automaticamente com base no fornecedor (veja
**Mapeamento Fornecedor → Categoria**), evitando confirmar palpites do
OCR. Notas fiscais funcionam de forma diferente — enviar uma nota
fiscal continua extraindo o conjunto completo (número, período de
serviço, data de vencimento etc.).

### Dicas para melhores resultados

- **Boa iluminação** faz muita diferença — evite reflexos e sombras.
- **Recibos planos** escaneiam melhor que amassados.
- **Papel térmico desbota** — escaneie ou fotografe logo após a compra.
- A leitura é feita apenas no **primeiro arquivo anexado**. Adicione outros recibos depois.
- **Verificação de data**: se após a leitura o formulário mostrar uma data de mais de 90 dias atrás, um aviso amarelo aparecerá — o OCR às vezes lê o ano errado (ex.: 2023 em vez de 2026). Corrija o ano e salve.

---

## Modelos (Salve uma vez, Reuse sempre)
<!-- roles: contractor, member, admin -->

Para entradas recorrentes (aluguel, utilidades, retainer mensal,
limpeza semanal), salve um modelo uma vez e reutilize em um clique.

### Salvando um modelo

1. Em **Adicionar Transação** ou **Enviar Nota Fiscal**, preencha o
   formulário normalmente.
2. Marque **Salvar como modelo** na parte inferior e dê um nome
   ("Aluguel Mensal", "Internet Comcast" etc.).
3. Toque em **Salvar** — a transação é salva *e* o modelo também.

### Usando um modelo

1. Abra **Adicionar Transação** ou **Enviar Nota Fiscal**.
2. O painel **Usar um modelo salvo** no topo do formulário mostra seus
   modelos como chips (apenas quando você tem ao menos um salvo).
3. Toque em um modelo — todos os campos aplicáveis se preenchem.
   Ajuste o que precisar (data, variação de valor) e salve.

### Notas

- Modelos são **privados da sua conta** — não vazam entre membros da
  residência. Sem confusão sobre qual modelo de aluguel é o correto
  este mês.
- Para notas fiscais, o **número da nota** intencionalmente não é
  armazenado no modelo — cada envio precisa de um número novo.
- Remova um modelo pelo ícone de lixeira ao lado do chip.

---

## Aviso de Possível Duplicata
<!-- roles: contractor, member, admin -->

Se você enviar um recibo com o mesmo fornecedor, total e data (±1 dia)
de outro já registrado nesta residência, um aviso âmbar aparece no
topo do formulário. Lógica equivalente para notas fiscais, comparando
pelo número dentro do imóvel.

O aviso **não bloqueia** — se for mesmo intencional (por exemplo, dois
almoços de mesmo valor no mesmo restaurante em dias diferentes, ou
reemissão de uma nota fiscal com o mesmo número), basta salvar. É um
aviso, não uma barreira.

---

## Mapeamento Fornecedor → Categoria (Catálogo de Fornecedores)
<!-- roles: contractor, member, admin -->

Ao digitar um nome de fornecedor em **Adicionar Transação**, o campo se
completa automaticamente a partir de um catálogo compartilhado. Duas
fontes preenchem esse catálogo:

1. **Entradas aprendidas automaticamente** — cada vez que alguém da sua
   residência salva uma despesa com fornecedor e categoria, o par é
   memoizado para aquela residência. Da próxima vez que alguém digitar o
   mesmo fornecedor, a categoria é preenchida.
2. **Globais curados por admin** — o administrador pode pré-carregar
   fornecedores comuns (Home Depot → Manutenção, Comcast → Utilidades,
   etc.) que valem em todas as residências. Globais cobrem o caso do
   dia 1, antes de uma residência acumular histórico.

A entrada específica da residência sempre vence sobre a global.

**Administradores** gerenciam o catálogo em **Fornecedores** no menu
admin — adicionar mapeamentos, editar categorias, excluir entradas
ruins, ou **promover** uma entrada de residência a global com um clique.
A página tem busca e filtro de escopo (Todos / Global / Residência).

---

## Caixa de Entrada de E-mail (Encaminhar Recibos)
<!-- roles: contractor, member, admin -->

Você pode enviar qualquer recibo ou nota fiscal direto para o LedgerX por e-mail — sem foto, sem etapa de upload. Encaminhe para **receipts@90ten.life** e ele aparece no seu Painel para revisão.

### Configuração inicial: Cadastre seu endereço de envio

Antes que o e-mail encaminhado apareça na sua caixa, você precisa informar ao LedgerX quais endereços você usará para enviar. É isso que vincula a mensagem recebida à sua conta.

1. Abra **Configurações** pelo menu suspenso do avatar no canto superior direito do Painel.
2. Role até **Encaminhamento por E-mail**.
3. Digite o endereço de e-mail a partir do qual você encaminhará (ex.: `voce@gmail.com`), opcionalmente nomeie ("Pessoal", "Trabalho") e clique em **Adicionar endereço**.
4. Repita para outros endereços que você possa usar.

E-mails de endereços não cadastrados são silenciosamente ignorados — apenas os endereços que você adicionou aparecem na sua caixa.

### Encaminhando um recibo ou nota fiscal

1. No seu cliente de e-mail, encontre o recibo ou nota que deseja registrar.
2. Encaminhe para **receipts@90ten.life**. A maioria dos clientes envia os anexos automaticamente. PDFs e imagens são suportados. **Recibos que vêm embutidos no corpo do próprio e-mail** (Uber, confirmações de companhias aéreas, faturas de SaaS e outros remetentes que não anexam PDF) também são extraídos automaticamente — o cartão da caixa de entrada mostrará uma miniatura **EMAIL** que você pode clicar para ver a mensagem original.
3. Em até ~5 minutos, um cartão aparece na seção **Caixa de Entrada**. Membros comuns e contratados veem no Painel; administradores e administradores de domicílio veem na tela inicial do **Admin** (ao lado das Ações Rápidas). Administradores completos também veem um pequeno diagnóstico de **Atividade de entrada** listando os últimos 20 encaminhamentos de todos os usuários — útil para confirmar que o pipeline está saudável mesmo antes da sua própria caixa ter linhas.

### Revisar e Aceitar

Cada item pendente é mostrado como um cartão com:

- O endereço do remetente e o assunto
- Etiquetas pequenas mostrando o que foi extraído automaticamente (fornecedor, valor, data) para você diferenciar os itens rapidamente
- Miniaturas clicáveis dos anexos (imagem ou PDF — abre em tamanho original em uma nova aba; arquivos HEIC de encaminhamentos do iPhone aparecem como uma miniatura genérica que abre o original)
- Um botão pequeno **Revisar ▾** à direita

Toque em **Revisar ▾** e escolha o tipo do item:

| Escolha | O que acontece |
|---|---|
| **Revisar como Recibo** | Abre **Adicionar Transação**, baixa o anexo e roda o OCR — fornecedor, valor e data são preenchidos automaticamente. |
| **Revisar como Nota Fiscal** | Abre **Enviar Nota Fiscal** com o anexo e os campos fornecedor / valor / número da nota / data preenchidos pelo OCR. |

A partir daí o formulário se comporta exatamente como um envio direto — confira os campos, ajuste o que estiver fora e clique em **Salvar**. O anexo é re-enviado para o caminho normal da residência, então fica permanentemente associado à transação ou nota resultante.

Após salvar, uma confirmação rápida aparece na parte inferior da tela informando que o item agora está em **Transações Recentes** (ou **Notas Fiscais**), e o cartão desaparece da **Caixa de Entrada de E-mail**. A contagem de pendentes no topo da seção atualiza imediatamente, então você sempre vê quantos cartões ainda precisam de atenção.

Se não quiser manter algo, toque no **×** no canto superior direito do cartão para descartar. A contagem de pendentes diminui em um na hora. Se mudar de ideia depois, basta encaminhar o mesmo e-mail novamente — itens descartados não bloqueiam o reenvio.

> **Dica sobre PDFs:** o OCR funciona em imagens e PDFs (rasterizamos a primeira página do PDF antes de extrair). Se um PDF não puder ser lido, o formulário ainda abre com o arquivo anexado — basta digitar os valores manualmente.

---

## Visualizar, Editar e Pesquisar Transações
<!-- roles: contractor, member, admin -->

A **Lista de Despesas** mostra todas as transações da residência selecionada, das mais recentes para as mais antigas.

### Pesquisa, ordenação e filtros

Para listas curtas de transações, o botão **Filtrar** fica discreto no canto superior direito da seção, mantendo a página limpa. Toque nele para revelar a barra de pesquisa, o controle de ordenação e os filtros. Se você já registrou mais de 25 transações, a barra de ferramentas aparece automaticamente.

A barra oferece:
- **Pesquisa** — fornecedor, categoria, observações ou nome da residência (em tempo real)
- **Ordenação** — menu sempre visível ao lado da busca: data (mais recente/mais antiga), valor (maior/menor), fornecedor (A→Z), categoria (A→Z). Reordena na hora sem recarregar e funciona em cima dos filtros ativos.
- **Painel de filtros** (atrás do botão de filtro): categoria, residência, período, faixa de valor

### Editar uma transação

1. Clique em qualquer transação da lista.
2. Atualize os campos conforme necessário.
3. Clique em **Salvar**.

> O texto bruto do OCR fica escondido atrás de um pequeno botão **"Ver texto bruto do OCR"** na tela de edição, então você só vê quando realmente precisa.

### Excluir uma transação

1. Clique na transação.
2. Clique em **Excluir** — o botão se transforma em um vermelho **"Toque novamente para confirmar"**.
3. Toque mais uma vez em até 3 segundos para confirmar. Se você não tocar novamente, o botão volta ao normal e nada acontece.

> Exclusões são permanentes — as imagens dos recibos também são removidas.

---

## Enviar Recibos
<!-- roles: contractor, member, admin -->

Você pode anexar recibos ao adicionar ou editar qualquer transação.

- **Formatos aceitos:** JPG, PNG, WebP, **PDF**
- **Vários arquivos:** Anexe quantos recibos precisar — útil para pedidos detalhados, faturas de várias páginas ou recibos corrigidos.
- **Compressão:** As imagens são comprimidas automaticamente antes do envio, então você pode usar fotos do celular direto.
- **Recibos em PDF:** Aparecem como um ícone de documento na grade de miniaturas. Clique para abrir o PDF em uma nova aba.
- **Recibos em imagem:** Clique em qualquer miniatura para abrir a visualização em tamanho completo com controles de zoom (+ / −).
- **Recibo principal:** O primeiro arquivo anexado é o principal. Ele aparece nas exportações e relatórios.

---

## Gráficos de Gastos
<!-- roles: member, admin -->

Seu painel inclui dois gráficos que se atualizam automaticamente à medida que você adiciona transações:

- **Gastos Mensais** — Um gráfico de área mostrando o total gasto em cada um dos últimos 6 meses.
- **Gastos por Categoria** — Um gráfico de pizza mostrando para onde seu dinheiro está indo em todas as categorias.

Os gráficos respondem à **residência selecionada** — alterne residências no topo para ver os dados de cada uma.

---

## Exportar Seus Dados
<!-- roles: member, admin -->

Baixe seus dados de despesas em dois formatos pelo **Exportar Dados** no Painel.

### Exportação em CSV

- Arquivo compatível com planilhas contendo todos os campos das transações.
- Ótimo para Excel, Google Planilhas ou software de contabilidade.

### Exportação em PDF

- Documento formatado com detalhes das transações e imagens dos recibos incorporadas.
- Até 6 imagens de recibo por transação são incorporadas.
- Ideal para imprimir, arquivar ou compartilhar com o contador.

**Para exportar:**
1. Clique em **Exportar Dados** no Painel.
2. Selecione a residência, o intervalo de datas e um filtro opcional de categoria.
3. Escolha CSV ou PDF.
4. O arquivo é baixado automaticamente.

---

## Relatórios
<!-- roles: member, admin -->

Os **Relatórios** permitem analisar gastos com filtros flexíveis:

- **Residência** — Restringe a uma residência
- **Categoria** — Filtra por tipo de despesa
- **Intervalo de Datas** — Define uma data inicial e final personalizadas
- **Enviado por** _(somente administradores)_ — Marque qualquer combinação de pessoas das residências selecionadas. Deixe a lista vazia para incluir todos no escopo, ou clique em **Apenas meus envios** para ver só os seus.
- **Ordenar por** — Reorganize os resultados sem rodar o relatório de novo: por data (mais antigos ou mais recentes primeiro), autor, valor (maior ou menor), fornecedor ou categoria. A ordem escolhida também é usada nas exportações em PDF e CSV.

A tabela de resultados — e as exportações em PDF/CSV — incluem a coluna **Enviado por** para administradores, então fica fácil identificar de quem é cada recibo. Usuários comuns veem apenas os próprios envios, e a coluna Enviado por não aparece para eles.

Os relatórios mostram um detalhamento das transações correspondentes, para que você identifique tendências e mantenha o orçamento sob controle.

---

## Consulta de NPI de Cirurgião
<!-- roles: contractor, member, admin -->

Para residências de dispositivos médicos e da área da saúde, o LedgerX pode consultar o **NPI (National Provider Identifier)** de um cirurgião direto do formulário de despesa e inseri-lo nas observações.

### Como funciona

1. Um administrador ativa a **Consulta de NPI de Cirurgião** para sua residência (Administrador → Gerenciar Residências → Recursos).
2. Ao adicionar ou editar uma despesa nessa residência, um botão **🔍 Consultar NPI** aparece ao lado do campo Observações.
3. Clique nele, pesquise pelo nome (ex.: "Smith" ou "John Smith"), escolha um resultado, e uma linha como `Surgeon: Dr. John Smith, MD, NPI: 1234567890` é adicionada às suas observações.

Os resultados vêm do registro público CMS NPPES. O botão fica oculto em residências que não têm o recurso ativado.

---

## Novidades (Ícone do Sino)
<!-- roles: contractor, member, admin -->

Um **ícone de sino** fica no topo direito de cada página (e na base da
barra lateral admin no desktop). Toque para ver o que foi lançado
recentemente — versão, data e uma breve descrição de cada release.

O sino fica **âmbar com um pequeno ponto vermelho** quando há novidades
não lidas. Abrir o painel limpa o ponto. O estado de leitura é por
navegador/dispositivo, portanto entrar pelo celular após ler no laptop
mostra o ponto brevemente novamente até você tocar no sino lá também.

Usamos isso para mantê-lo informado conforme novos recursos forem
lançados — sem mais atualizações silenciosas.

---

## Atalhos de teclado
<!-- roles: contractor, member, admin -->

A maioria dos modais fecha com **Esc** — Adicionar Transação, Editar Transação, Enviar Nota Fiscal, Configurações, Exportar, Relatórios, o tour de boas-vindas e Novidades, todos escutam essa tecla. O mesmo vale para o menu da conta (avatar no canto superior direito): toque fora ou pressione Esc para fechar.

---

## Configurações da Conta
<!-- roles: contractor, member, admin -->

Abra **Configurações** pelo **menu suspenso do avatar** no cabeçalho superior direito. O avatar está disponível para todas as contas — usuários comuns, contratados, administradores de família e administradores plenos usam o mesmo painel de configurações para gerenciar idioma, senha, e-mail real e remetentes de encaminhamento.

### Adicionar ou Atualizar E-mail

Adicionar um e-mail à sua conta libera a **redefinição de senha por conta própria** — assim você recupera o acesso sem precisar contatar o administrador.

1. Abra Configurações.
2. Digite seu e-mail em **Adicionar E-mail**.
3. Clique em **Adicionar E-mail** para salvar.

### Alterar Senha

1. Abra Configurações.
2. Digite sua nova senha em **Alterar Senha**.
3. Clique em **Alterar Senha** para salvar.

### Encaminhamento por E-mail

A parte inferior de Configurações também contém o gerenciador de **Encaminhamento por E-mail** — cadastre os endereços a partir dos quais você vai encaminhar recibos e notas fiscais, veja o que está cadastrado e remova os que não usa mais. Veja a seção [Caixa de Entrada de E-mail](#caixa-de-entrada-de-e-mail-encaminhar-recibos) para o fluxo completo.

---

## Gerenciar Residências
<!-- roles: member, admin -->

O LedgerX suporta **várias residências** por usuário — útil se você:

- Acompanha despesas pessoais separadas das despesas compartilhadas
- Administra orçamentos de propriedades ou grupos diferentes

Seu administrador pode adicioná-lo a mais residências. Cada residência tem suas próprias transações, categorias e membros.

**Papéis nas residências:**

| Papel | Permissões |
|---|---|
| **Proprietário** | Controle total — gerencia membros, configurações e exclusão |
| **Membro** | Adiciona, vê, edita e exclui transações |

---

## Recursos de Administrador
<!-- roles: admin -->

Contas de administrador veem um **Painel de Administração** no lugar do Painel normal.

O painel admin tem um **cabeçalho escuro de largura total** com o logo LedgerX, Sino (Novidades), Ajuda e Sair — consistente com todos os outros tipos de usuário. Abaixo dele, a barra lateral cuida da navegação e a área principal exibe a visualização ativa.

**Tela inicial:** Ao entrar como administrador, você cai em uma tela de comando central com:
- **Ações Rápidas** — botões Adicionar Transação e Enviar Nota Fiscal
- **Ir para** — atalhos para Sem categoria, Notas Fiscais, Minhas Transações, Análises e Relatórios
- **Configuração** — atalhos para Grupos, Categorias, Fornecedores e Usuários

**Navegação na barra lateral:**
- **Início** — retorna à tela de comando de qualquer visualização
- **Gerenciar** (recolhível) — expande para mostrar Grupos, Categorias, Fornecedores e Usuários
- Sem categoria · Notas Fiscais · Minhas Transações · Análises · Relatórios

### Análises

- Total de gastos e número de transações em todas as residências
- Detalhamento de gastos por categoria com gráficos
- Filtrável por intervalo de datas, residência, categoria **e remetente**
- O filtro de remetente exibe um chip **Somente eu** mais um chip por pessoa que enviou despesas no período — combine qualquer seleção para limitar gráficos, totais, a lista de transações recentes e a exportação CSV/PDF
- Cada linha da lista de transações também mostra o @usuário do remetente, deixando claro quem registrou cada item
- Exporte qualquer visualização em CSV ou PDF

### Gerenciar Residências

- Criar novas residências
- Adicionar ou remover membros
- Ver todas as residências da plataforma

### Gerenciar Usuários

- Criar novas contas de usuário
- Redefinir senhas de qualquer usuário
- Conceder ou revogar privilégios de administrador
- Atribuir usuários a residências
- Veja o **último acesso** de cada usuário ao lado da data de entrada, para identificar rapidamente contas inativas (ou confirmar que um colega já entrou desde que você redefiniu a senha). Contas que nunca acessaram aparecem como "Nunca acessou".

**Criando um usuário:** a lista de residências no diálogo de criação agora começa vazia — marque apenas as propriedades que este usuário deve ver, e ele receberá exatamente esse acesso. (No comportamento anterior, todo novo usuário entrava silenciosamente em todas as propriedades.) Você pode ajustar as propriedades de um usuário depois pelo botão **Residências** na linha dele.

### Gerenciar Categorias

- Criar, editar e excluir categorias
- Limitar categorias a uma residência específica ou torná-las globais
- Cada residência só vê as categorias atribuídas a ela
- **Selecionar Todos / Limpar Todos** no seletor de residências para atribuição em massa rápida
- O seletor agora é rolável com cabeçalho e rodapé fixos, funcionando mesmo com listas longas de residências

### Transações Sem Categoria

- Revise todas as transações sem categoria
- Atribua categorias em lote a partir de uma única tela

### Notas Fiscais de Prestadores
<!-- roles: admin -->

- Visualize todas as notas fiscais enviadas por prestadores e admins de propriedade
- Filtre por status (Pendente / Paga) e propriedade
- Clique em qualquer nota para ver os detalhes completos e documentos anexados
- **Marcar como Paga** para registrar que o pagamento foi efetuado (com data e hora); apenas admins completos
- **Atribuir Categoria** (apenas admins completos) — etiquete qualquer nota fiscal com uma categoria para que apareça no Analytics junto com os recibos. O seletor só mostra as categorias válidas para o grupo da nota (globais + mapeadas explicitamente).

**Notificações por e-mail:** Tanto envios novos de nota fiscal quanto de recibo disparam um e-mail de resumo para todos os admins completos com e-mail real cadastrado. Os admins de propriedade também recebem o e-mail, mas só para envios em propriedades das quais fazem parte — quem cuida da *Casa de Praia* nunca recebe notificação da *Cabana na Montanha*. O próprio remetente nunca recebe e-mail do que ele mesmo enviou. Quando um admin marca uma nota como paga, o remetente recebe um e-mail de confirmação separado.

**Lembretes de inatividade:** Se você ficar **14 dias** sem entrar nem enviar nada, o LedgerX manda um lembrete leve por e-mail (com texto aleatório — nunca a mesma cartinha duas vezes seguidas) e um link de um toque para voltar ao app. Se continuar inativo: um segundo lembrete em 30 dias, depois aproximadamente mensal. Assim que você loga ou registra qualquer coisa, o relógio reinicia e os lembretes param. Vale para admins completos e admins de propriedade.

### Orçamentos
<!-- roles: admin -->

Os prestadores podem enviar **orçamentos** (cotações) para você revisar e discutir antes que qualquer serviço vire nota fiscal. Abra a seção **Orçamentos** pelo menu (ou pelo bloco Orçamentos na home do admin).

- Veja todos os orçamentos enviados pelos prestadores, com um selo vermelho mostrando mensagens não lidas
- Filtre por status (Aberto / Aceito / Recusado) e propriedade; ordene por data
- Clique em um orçamento para abri-lo: os arquivos JPEG/PDF enviados (PDFs abrem em nova aba), a descrição do prestador e a **conversa**
- **Converse** — responda dentro do próprio orçamento; o prestador vê e pode responder
- **Aceite** ou **Recuse** o orçamento (ou **Reabra** um já decidido) — o status fica visível para o prestador
- **Excluir** remove o orçamento junto com seus arquivos e mensagens. Os arquivos ficam guardados até você excluí-los — nada é removido automaticamente.

**Tipo de cobrança:** cada orçamento agora inclui um tipo de cobrança — **Valor total** ou **Somente mão de obra (materiais à parte)**. Isso aparece como um selo em cada cartão de orçamento para que você saiba de relance se os materiais estão incluídos.

**Visibilidade na rede:** qualquer usuário que compartilha uma propriedade com o prestador pode ver os orçamentos dele. Isso inclui admins de propriedade, usuários comuns e outros prestadores na mesma propriedade. Visualizadores da rede veem detalhes completos, anexos e histórico de conversa. Membros da propriedade que não são prestadores — admins de propriedade e usuários comuns — também podem **participar da conversa e enviar mensagens**, junto com quem enviou e os admins completos. Outros prestadores na mesma propriedade continuam somente leitura (podem ver, mas não postar), a menos que sejam o autor ou tenham sido convidados. Somente admins completos podem alterar o status.

**Enviar seu próprio orçamento:** se um subcontratado lhe envia uma cotação diretamente, você mesmo pode registrá-la — toque em **Enviar um orçamento** na tela inicial de administrador, escolha qualquer propriedade e anexe o JPEG ou PDF. Ele aparece na seção Orçamentos junto com os enviados por prestadores, pronto para aceitar, recusar ou discutir.

**Notificações por e-mail:** quando um prestador envia um novo orçamento, todos os admins completos com e-mail real cadastrado são notificados — igual a notas fiscais e recibos. (Orçamentos que você mesmo registra não enviam e-mail aos outros admins.)

**Convidar participantes:** admins podem convidar qualquer usuário — independentemente de ser membro de uma propriedade — para a conversa de um orçamento específico. Abra o detalhe do orçamento, localize a seção **Participantes convidados**, digite o nome de usuário (sem @) e toque em **Convidar**. O usuário convidado vê imediatamente o orçamento no seu painel e pode enviar mensagens na conversa. Apenas admins completos podem convidar; usuários convidados não podem adicionar outros participantes.

### Relatório de Atividade
<!-- roles: admin, household_admin -->

Uma linha do tempo de quem fez o quê entre as pessoas que você acompanha. Abra pela navegação (ou pelo botão **Atividade** na tela inicial do admin).

- **Linha do tempo** — todo envio de recibo, envio de nota fiscal, marcação de pagamento e evento de orçamento (enviado, aceito, recusado) em uma única lista cronológica. Toque em qualquer linha para abrir o recibo, a nota ou o orçamento correspondente, sem sair da tela.
- **Últimos acessos** — uma linha por usuário com a última vez que entrou no app. Útil para identificar prestadores que sumiram.
- **Filtros** — período (padrão: últimos 30 dias), domicílio, pessoa e chips de tipo de evento, todos no topo (incluindo os três tipos de evento de orçamento).

**Quem vê a atividade de quem:**
- Admins completos veem a atividade de todos, em todos os domicílios.
- Admins de propriedade só veem a atividade de prestadores e membros comuns dos domicílios aos quais pertencem. Não veem outros admins, outros admins de propriedade nem a si mesmos.
- Prestadores e usuários comuns não veem o item Atividade no menu.

### Relatório de Orçamentos
<!-- roles: admin, household_admin -->

Um relatório focado no fluxo de orçamentos. Abra pela navegação (ou pelo botão **Relatório de orçamentos** na tela inicial do admin).

- **Resumo** — cards de orçamentos enviados, aceitos, recusados e ainda abertos no período selecionado, além da sua **taxa de aceitação** e do **tempo médio de decisão** (quanto tempo do envio até aceitar/recusar). Um detalhamento por prestador mostra os envios/aceitos/recusados de cada um e sua taxa de aceitação.
- **Abertos e parados** — todos os orçamentos ainda aguardando decisão, dos mais antigos primeiro, com a idade em dias. Qualquer um parado há mais de duas semanas recebe o selo **Parado**, para que nada passe despercebido. (Esta aba sempre mostra todos os orçamentos abertos, independentemente do período.)
- **Filtros** — propriedade e um período (o período se aplica apenas à aba Resumo).

O **alcance** espelha o Relatório de Atividade: admins completos veem todas as propriedades; admins de propriedade veem prestadores e membros das suas próprias propriedades.

---

## Função de Admin de Propriedade
<!-- roles: admin -->

O Admin de Propriedade é uma versão reduzida do admin. Faz tudo que um prestador faz (enviar recibos, enviar notas fiscais) **mais** acompanhamento somente-leitura das propriedades às quais pertence.

**O que um admin de propriedade pode fazer:**
- Enviar recibos (Adicionar Transação) e notas fiscais (Enviar Nota Fiscal)
- Visualizar **Minhas Transações** — lista de todos os recibos que ele mesmo enviou (filtrada para o próprio trabalho)
- Visualizar **Análises** das propriedades em que é membro (abre como modal sobre a tela)
- Visualizar a lista de **Notas Fiscais de Prestadores** (somente leitura — sem botão Marcar como Paga)
- Visualizar **Relatórios**

**O que um admin de propriedade NÃO pode fazer (somente admin completo):**
- Marcar notas fiscais como pagas
- Criar, modificar ou excluir propriedades
- Criar, modificar ou excluir usuários
- Criar ou atribuir categorias
- Editar ou excluir despesas enviadas por outros (as suas próprias continuam editáveis)

Atribua a função em **Gerenciar Usuários → dropdown de função → Admin de Propriedade**.

### Marcar Despesas como Pagas
<!-- roles: admin -->

- Em **Análises → Transações Recentes**, cada linha de despesa exibe um botão de círculo com check (✓)
- Clique nele para alternar o status de pagamento — o botão fica verde e um emblema **Pago** aparece na despesa
- O emblema é visível para o usuário que enviou a despesa, para que ele saiba se o recibo foi pago

---

## Função de Prestador
<!-- roles: contractor -->

Prestadores veem um painel simplificado com três ações:

1. **Adicionar Transação** — enviar um recibo normalmente
2. **Enviar Nota Fiscal** — enviar um PDF ou imagem da sua nota fiscal
3. **Enviar um orçamento** — enviar uma cotação para o administrador revisar e discutir

**Como enviar uma nota fiscal:**
1. Toque em **Enviar Nota Fiscal**
2. Envie o PDF ou JPG da nota fiscal — os campos são preenchidos automaticamente via OCR
3. Revise e corrija os detalhes extraídos (valor, período de serviço, descrição — o nº da nota é opcional)
4. Selecione a propriedade onde o serviço foi realizado
5. Opcionalmente escolha uma **Categoria** — só aparecem categorias disponíveis para a propriedade selecionada. Deixe em branco se não souber; um administrador completo pode atribuir depois.
6. Toque em **Enviar Nota Fiscal** para encaminhar ao seu administrador

**Visualizar uma nota enviada:** toque em qualquer linha em **Minhas Notas Fiscais** para abrir o painel de detalhes. Você verá a nota completa, observações do administrador e todos os anexos enviados — PDFs abrem em nova aba.

**Excluir uma nota enviada:** o painel de detalhes tem um botão vermelho **Excluir nota fiscal** — só quem enviou a nota vê o botão. Use quando enviar o PDF errado ou corrigir valores em um envio novo. Administradores completos também podem excluir qualquer nota a partir da visualização administrativa (ferramenta de limpeza).

**Status das notas fiscais:**
- 🟡 **Pendente** — enviada, aguardando pagamento
- 🟢 **Paga** — pagamento efetuado

> **Dica:** Os recibos de despesas comuns que você envia também recebem um emblema verde **Pago** assim que o administrador os marcar como pagos — assim você sabe o status de cada recibo enviado.

**Notificações por e-mail:** Assim que um admin marcar sua nota como paga, você receberá um e-mail de confirmação (se tiver um endereço de e-mail real cadastrado em Configurações). E sempre que você enviar uma nota fiscal OU um recibo novo, os administradores da propriedade recebem um e-mail automático — nada de seguir mandando mensagem para avisar.

**Fotos do trabalho em andamento (somente prestadores):** Ao enviar um recibo ou nota fiscal, prestadores veem uma seção **Fotos do trabalho em andamento** logo abaixo dos anexos principais. Tire ou envie fotos do serviço em si — antes e depois, materiais, o vazamento que você acabou de consertar, a parede que pintou. As fotos são salvas como JPEGs compactos (≈0,4 MB cada) para não pesar nos dados, e os administradores enxergam tudo em uma galeria separada com rótulo próprio ao revisar o envio. Isso substitui o vai-e-vem de fotos por WhatsApp e mensagem. Usuários comuns e admins de propriedade não veem esta seção — ela aparece apenas em contas de prestador.

### Orçamentos (Cotações)
<!-- roles: contractor -->

Os orçamentos permitem enviar uma cotação ao administrador *antes* de o serviço acontecer — e então conversar sobre ela dentro do LedgerX, em vez de por mensagem ou e-mail.

**Como enviar um orçamento:**
1. Toque em **Enviar um orçamento**
2. Escolha a **propriedade** a que a cotação se refere
3. Dê um **título** curto (ex.: "Orçamento de reparo do telhado") e, opcionalmente, uma descrição
4. Escolha o **tipo de cobrança**: **Valor total** (tudo incluso) ou **Somente mão de obra (materiais à parte)**
5. Anexe o orçamento como **JPEG ou PDF** (pode adicionar mais de um arquivo)
6. Toque em **Enviar orçamento**

**A conversa:** cada orçamento tem seu próprio bate-papo. Abra qualquer orçamento em **Meus orçamentos** para ver os arquivos enviados e uma área de mensagens embaixo. Você e o administrador podem trocar mensagens ali — tirar dúvidas, esclarecer o escopo, combinar um valor. Quando o administrador responde, um pequeno selo vermelho com a contagem de mensagens aparece naquele orçamento para você saber que há algo novo.

**Status dos orçamentos:**
- 🟡 **Aberto** — enviado e em discussão
- 🟢 **Aceito** — o administrador aprovou a cotação
- ⚪ **Recusado** — o administrador recusou

Os arquivos do seu orçamento ficam registrados até que um administrador os remova — não há botão de exclusão de orçamento para o prestador, então nada que você enviar some sozinho.

**Administradores de Imóvel** também veem os botões **Adicionar Transação** e **Enviar Nota Fiscal** no topo do painel administrativo — supervisão e envio lado a lado, sem precisar trocar de conta para registrar o próprio trabalho. Os recibos enviados aparecem em **Minhas Transações** no menu, para revisar o que você mesmo digitou sem abrir Análises.

---

## FAQ e Solução de Problemas
<!-- roles: contractor, member, admin -->

**P: Esqueci minha senha e não consigo entrar.**
R: Se adicionou um e-mail à conta, use **Esqueceu a senha?** na tela de login. Caso contrário, peça ao administrador para redefini-la em Administrador → Gerenciar Usuários.

**P: Quero adicionar um e-mail para redefinir minha própria senha.**
R: Entre, abra **Configurações** e digite seu e-mail em Adicionar E-mail.

**P: Não estou vendo uma residência à qual deveria ter acesso.**
R: Seu administrador precisa adicioná-lo como membro dessa residência.

**P: Minha foto ou PDF de recibo não envia.**
R: Os formatos aceitos são JPG, PNG, WebP e PDF. Arquivos muito grandes podem dar tempo limite — tente uma foto em resolução um pouco menor. PDFs protegidos por senha não podem ser enviados.

**P: O OCR preencheu os dados errados.**
R: Basta corrigir os campos manualmente antes de salvar. O OCR é uma leitura aproximada — iluminação ruim, tinta desbotada ou layouts incomuns podem atrapalhá-lo.

**P: Excluí uma transação sem querer.**
R: As exclusões são permanentes. Não há como desfazer — confirme com cuidado.

**P: Minha exportação está faltando transações.**
R: Confira se selecionou a residência e o intervalo de datas corretos. Transações fora do intervalo não aparecem.

**P: Como me torno administrador?**
R: Um administrador existente precisa conceder os privilégios em Administrador → Gerenciar Usuários.

**P: Posso pertencer a mais de uma residência?**
R: Sim. Um administrador pode adicioná-lo a várias residências. Use o seletor de residência no Painel para alternar entre elas.

---

## Licença

Proprietário. Todos os direitos reservados.
