# LedgerX

Um rastreador de despesas seguro e compartilhado para residências e equipes. Registre gastos, escaneie recibos, gere relatórios e mantenha todos na mesma página — tudo em uma interface limpa.

---

## Sumário

- [Primeiros Passos](#primeiros-passos)
- [Fazendo Login](#fazendo-login)
- [Visão Geral do Painel](#visão-geral-do-painel)
- [Adicionar uma Transação](#adicionar-uma-transação)
- [Leitura de Recibos e OCR](#leitura-de-recibos-e-ocr)
- [Visualizar, Editar e Pesquisar Transações](#visualizar-editar-e-pesquisar-transações)
- [Enviar Recibos](#enviar-recibos)
- [Gráficos de Gastos](#gráficos-de-gastos)
- [Exportar Seus Dados](#exportar-seus-dados)
- [Relatórios](#relatórios)
- [Consulta de NPI de Cirurgião](#consulta-de-npi-de-cirurgião)
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

1. Abra o aplicativo em **ledger.phillyshah.com** no navegador.
2. Digite seu **nome de usuário** e **senha**.
3. Clique em **Entrar**.

> **Nota:** O LedgerX usa login por nome de usuário — nenhum e-mail é necessário para entrar. Se ainda não tiver conta, peça ao seu administrador para criar uma.

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

| Botão | O que faz |
|---|---|
| **Adicionar Transação** | Abre o formulário para registrar uma nova despesa |
| **Exportar Dados** | Baixa suas transações em CSV ou PDF |
| **Relatórios** | Mostra relatórios de gastos filtrados |

Se você pertence a várias residências, use o **seletor de residência** para alternar entre elas. Tudo — transações, exportações, gráficos — fica restrito à residência selecionada.

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
3. Clique em **Salvar**.

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
   - Categoria
   - Impostos, gorjeta, forma de pagamento e resumo dos itens (quando visíveis)
3. Revise os campos preenchidos e ajuste o que a leitura não captou.

### Dicas para melhores resultados

- **Boa iluminação** faz muita diferença — evite reflexos e sombras.
- **Recibos planos** escaneiam melhor que amassados.
- **Papel térmico desbota** — escaneie ou fotografe logo após a compra.
- A leitura é feita apenas no **primeiro arquivo anexado**. Adicione outros recibos depois.

---

## Visualizar, Editar e Pesquisar Transações
<!-- roles: contractor, member, admin -->

A **Lista de Despesas** mostra todas as transações da residência selecionada, das mais recentes para as mais antigas.

### Pesquisa

Digite na **barra de pesquisa** para filtrar por fornecedor, categoria, observações ou nome da residência em tempo real.

### Filtros e Ordenação

Use os controles de filtro para restringir por:
- **Categoria** — Mostra apenas um tipo de despesa
- **Ordenação** — Alterna entre mais recente, mais antiga, maior valor, menor valor

### Editar uma transação

1. Clique em qualquer transação da lista.
2. Atualize os campos conforme necessário.
3. Clique em **Salvar**.

### Excluir uma transação

1. Clique na transação.
2. Clique em **Excluir** e confirme.

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

## Configurações da Conta
<!-- roles: contractor, member, admin -->

Acesse **Configurações** pelo menu do Painel.

### Adicionar ou Atualizar E-mail

Adicionar um e-mail à sua conta libera a **redefinição de senha por conta própria** — assim você recupera o acesso sem precisar contatar o administrador.

1. Abra Configurações.
2. Digite seu e-mail em **Adicionar E-mail**.
3. Clique em **Adicionar E-mail** para salvar.

### Alterar Senha

1. Abra Configurações.
2. Digite sua nova senha em **Alterar Senha**.
3. Clique em **Alterar Senha** para salvar.

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

### Análises

- Total de gastos e número de transações em todas as residências
- Detalhamento de gastos por categoria com gráficos
- Filtrável por intervalo de datas e residência
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

---

## Função de Admin de Propriedade
<!-- roles: admin -->

O Admin de Propriedade é uma versão reduzida do admin. Faz tudo que um prestador faz (enviar recibos, enviar notas fiscais) **mais** acompanhamento somente-leitura das propriedades às quais pertence.

**O que um admin de propriedade pode fazer:**
- Enviar recibos (Adicionar Transação) e notas fiscais (Enviar Nota Fiscal)
- Visualizar **Análises** das propriedades em que é membro
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

Prestadores veem um painel simplificado com duas ações:

1. **Adicionar Transação** — enviar um recibo normalmente
2. **Enviar Nota Fiscal** — enviar um PDF ou imagem da sua nota fiscal

**Como enviar uma nota fiscal:**
1. Toque em **Enviar Nota Fiscal**
2. Envie o PDF ou JPG da nota fiscal — os campos são preenchidos automaticamente via OCR
3. Revise e corrija os detalhes extraídos (valor, período de serviço, descrição — o nº da nota é opcional)
4. Selecione a propriedade onde o serviço foi realizado
5. Toque em **Enviar Nota Fiscal** para encaminhar ao seu administrador

**Status das notas fiscais:**
- 🟡 **Pendente** — enviada, aguardando pagamento
- 🟢 **Paga** — pagamento efetuado

> **Dica:** Os recibos de despesas comuns que você envia também recebem um emblema verde **Pago** assim que o administrador os marcar como pagos — assim você sabe o status de cada recibo enviado.

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
