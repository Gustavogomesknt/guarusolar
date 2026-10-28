/*
 * CONTEÚDO FIXO DA PROPOSTA EM PDF — edite aqui textos, números e dados da empresa.
 *
 * Vale para todas as propostas. O que muda por orçamento (cliente, itens, valores, condição de
 * pagamento, observações, vendedor) vem do banco. Depois de editar: `npm run build` confere se
 * nada quebrou, e a mudança entra na próxima publicação.
 *
 * O PRAZO DE EXECUÇÃO e a GARANTIA não ficam mais aqui: são texto de cada orçamento, com as
 * sugestões de prazo e o texto padrão da garantia em
 * packages/compartilhado/src/textosDaProposta.ts.
 * Texto entre colchetes, como [BANCO PARCEIRO], aparece assim no PDF: é pendência a preencher.
 * Para tirar uma linha opcional, deixe o texto vazio ('').
 */

export type IconePilar = 'sol' | 'escudo' | 'raio' | 'fone';

export const EMPRESA = {
  nome: 'Guarusolar',
  razaoSocial: 'MARCIO ROBERTO MENDES ENERGIA SOLAR',
  cnpj: '31.276.254/0001-60',
  endereco: 'Est. do Moinho Velho, 340 — Jardim Angélica, Guarulhos/SP · CEP 07260-430',
  telefone: '(11) 4030-4671',
  email: 'guarusolar@hotmail.com',
  instagram: '@guarusolar',
  site: 'guarusolar.com',
  slogan: 'ENERGIA SOLAR AO SEU ALCANCE',
  /**
   * Logo (PNG ou JPG) para o cabeçalho, caminho a partir de apps/api/ (ex.: 'assets/logo.png').
   * Vazio: aparece o ícone de sol provisório.
   */
  logo: '',
};

/** Página 1: textos que não dependem do orçamento. */
export const PAGINA_1 = {
  /** rodapé da tabela de itens */
  notaDosItens: 'Todos os equipamentos e serviços seguem rigorosamente as normas ABNT NBR.',
  /**
   * Abaixo da condição de pagamento escolhida no orçamento. "Sem juros" SÓ quando o vendedor
   * absorveu a taxa nesta proposta, parcelando (27/10/2026); em branco, a nota não sai.
   */
  notaDoPagamento: {
    padrao: 'Parcelamos em até 18x no cartão, com taxa da operadora. À vista no Pix ou transferência, com desconto.',
    taxaAbsorvida: 'Parcelamento sem juros nesta proposta. À vista no Pix ou transferência, com desconto.',
  },
  /** o texto vem do orçamento (prazoExecucao); semPrazo só em proposta enviada antes de o campo existir */
  prazo: { titulo: 'PRAZO DE EXECUÇÃO', semPrazo: 'A combinar' },
  /** o texto vem do orçamento (garantia); sem ele, GARANTIA_PADRAO (compartilhado/textosDaProposta.ts) */
  garantia: { titulo: 'GARANTIA DO SERVIÇO' },
  suporte: { titulo: 'SUPORTE', texto: 'Pós-venda dedicado em todo o Brasil' },
};

/** Página 2: institucional, igual em todas as propostas. */
export const INSTITUCIONAL = {
  titulo: 'Por que a Guarusolar',
  missao:
    'Conectamos pessoas e empresas às melhores soluções em energia solar e mobilidade elétrica, gerando liberdade, economia e um futuro sustentável.',

  destaque: {
    prefixo: '+ DE',
    numero: '1000',
    titulo: 'carregadores instalados',
    texto: 'Levando energia, tecnologia e confiança para todo o Brasil.',
  },

  /** Nomes em caixas. Quando houver logos autorizados, entram no lugar dos nomes. */
  homologacoes: {
    titulo: 'SOMOS HOMOLOGADOS POR',
    marcas: ['BYD', 'WEG', 'GEELY', 'VOLVO', 'JEEP'],
    nota: 'E especializados em BMW.',
  },

  /** Ícones disponíveis: 'sol', 'escudo', 'raio', 'fone'. Até 4 pilares (duas colunas). */
  pilares: <{ icone: IconePilar; titulo: string; texto: string }[]>[
    { icone: 'sol', titulo: 'Energia limpa', texto: 'Soluções que reduzem a conta de luz e a emissão de carbono.' },
    { icone: 'escudo', titulo: 'Instalações seguras', texto: 'Conformidade com as normas e padrões técnicos do setor.' },
    { icone: 'raio', titulo: 'Tecnologia de ponta', texto: 'Equipamentos modernos e confiáveis, de marcas homologadas.' },
    { icone: 'fone', titulo: 'Suporte especializado', texto: 'Atendimento ágil e pós-venda dedicado depois da instalação.' },
  ],

  comoFunciona: {
    titulo: 'COMO FUNCIONA',
    etapas: [
      { titulo: 'Proposta', texto: 'Você recebe este documento com tudo detalhado.' },
      { titulo: 'Aprovação', texto: 'Escolha a forma de pagamento e confirme.' },
      { titulo: 'Agendamento', texto: 'Marcamos a data com a equipe técnica.' },
      { titulo: 'Instalação', texto: 'Execução, testes e registro fotográfico do serviço.' },
    ],
  },

  contato: {
    titulo: 'Dúvidas sobre esta proposta?',
    /** QR code que abre o WhatsApp do vendedor (só quando ele tem telefone cadastrado). */
    qrCodeWhatsApp: true,
  },
};


// ---------------------------------------------------------------------------------------------
// MODELO NOVO (três páginas A4, formato enviado pelo cliente), em construção:
// lib/pdf-proposta-nova.ts. Só sai com PROPOSTA_MODELO=nova ou no `npm run pdf:exemplo`.
// ---------------------------------------------------------------------------------------------

/**
 * Arquivos de arte, caminho a partir de apps/api/ (pasta assets/proposta/, ver o LEIA-ME de lá).
 * Arquivo que ainda não existe: o PDF desenha um retângulo cinza no lugar, com o nome esperado.
 */
/**
 * CAPA (página 1): uma imagem por TIPO DE SERVIÇO, com o nome do tipo sem acento, em
 * minúsculas e com hífens: capas/instalacao-de-carregador-veicular.jpg. Tipo sem capa própria
 * usa a `padrao` e o gerador avisa o vendedor (lib/capaDaProposta.ts).
 */
export const CAPAS_DA_PROPOSTA = {
  pasta: 'assets/proposta/capas',
  /** hoje a Guarusolar só vende carregador */
  padrao: 'instalacao-de-carregador-veicular',
  /** a linha impressa na capa padrão, citada no aviso do gerador */
  textoDaCapaPadrao: 'Instalação de Carregador Veicular',
};

export const ARTES_DA_PROPOSTA_NOVA = {
  /** fundo de página inteira (A4 em retrato, 2480 x 3508 px = 300 dpi); a capa está acima */
  fundoPagina3: 'assets/proposta/pagina-3.jpg',
  /**
   * foto no pé de cada cartão do escopo, na LARGURA INTEIRA do cartão e na altura que sobra
   * abaixo dos itens (recortada, nunca esticada). Retrato alto, uns 800 x 1600 px: os arquivos
   * de 23/10/2026 (~225 px) saem a 80-95 dpi. Arquivo maior com o MESMO nome melhora sozinho
   */
  fotoDocumentacao: 'assets/proposta/foto-documentacao.jpg',
  fotoBombeiros: 'assets/proposta/foto-bombeiros.jpg',
  fotoInfraestrutura: 'assets/proposta/foto-infraestrutura.jpg',
  /**
   * logos das montadoras (página 3), na ordem da faixa. Todas na mesma caixa de 480 x 220 px com
   * fundo transparente (a normalização está no arquivo): saem todas do mesmo tamanho
   */
  logosDasMontadoras: [
    'assets/proposta/logo-byd.png',
    'assets/proposta/logo-weg.png',
    'assets/proposta/logo-geely.png',
    'assets/proposta/logo-volvo.png',
    'assets/proposta/logo-jeep.png',
    'assets/proposta/logo-bmw.png',
  ],
};

/**
 * Rodapé "Página X de N" em TODAS as páginas (27/10/2026: as artes das páginas 1 e 3 não trazem
 * mais o número impresso), com o total real de páginas. Mesma linha de base em todas (y ~832),
 * que nas artes cai na faixa navy do pé (na página 3, à direita, ela começa em y ~820).
 * `corSobreAArte` vale na capa e na última página (as artes); sem o arquivo da arte, `cor`.
 */
export const RODAPE_DA_PROPOSTA_NOVA = {
  texto: 'Página {pagina} de {total}',
  tamanho: 8,
  cor: '#5A6675',
  corSobreAArte: '#FFFFFF',
  alinhamento: 'right' as 'left' | 'center' | 'right',
  espacamento: 0.3,
  distanciaDaBase: 10,
};

/**
 * Página 3 do modelo novo: campos POR CIMA da arte (assets/proposta/pagina-3.jpg, 1055 x 1491
 * px, A4 exato: 1 px da arte = 0,5643 pt). Posições em PONTOS do PDF (1/72 de polegada), a
 * partir do canto de cima à esquerda da folha (A4 = 595,28 x 841,89); px da arte x 0,5643 = pt.
 * Medidas em 27/10/2026 na arte nova, sem os valores. Os valores vêm gravados no orçamento
 * (condições da proposta).
 */
export const PAGINA_3_NOVA = {
  /** tamanho máximo do valor grande (diminui até caber na largura do campo, mínimo 11) */
  tamanhoDoValor: 17,
  /** sobre os cartões escuros da arte */
  cores: { valor: '#FFFFFF', detalhe: '#CBDBF0' },
  /**
   * Os três cartões de valor (arte de 27/10/2026): a régua laranja fica logo abaixo do título
   * (y 650 a 652) e o espaço livre é o de BAIXO dela, até o fim do cartão (y 699). Ali vão o valor
   * e, embaixo dele, as linhas de apoio. `y` é a LINHA DE BASE do valor, a mesma nos três; as
   * linhas de apoio descem `entreLinhas`. `x` = início da régua de cada cartão.
   */
  cartoes: {
    investimento: { x: 38, y: 669.5, largura: 157 },
    aVista: { x: 229, y: 669.5, largura: 151 },
    cartao: { x: 418, y: 669.5, largura: 148 },
  },
  /** do valor (17 pt) para a 1ª linha de apoio; de uma linha de apoio (9 pt) para a próxima */
  entreLinhas: { doValor: 13.5, doApoio: 11.5 },
  /**
   * Legendas embaixo do valor (a arte antiga as trazia impressas; a nova, não), a 9 pt, nunca
   * menos. À vista: o desconto GRAVADO (propostaAVistaPct); desconto zero = sem legenda. O cartão
   * não tem legenda fixa: o valor é "12 × R$ 916,36" numa linha (o pior caso, "18 × R$ 12.345,67",
   * cabe a 17 pt: 146 de 148 pt) e embaixo vão a última parcela (se diferente) e o total, com
   * ", sem juros" no fim quando a taxa é absorvida. Quatro linhas não cabem embaixo da régua.
   */
  legendas: {
    investimento: 'Condição comercial apresentada',
    aVista: '{percentual} de desconto',
    tamanho: 9,
  },
  campos: {
    /** faixa "PRONTO PARA APROVAR?": consultora + telefone da empresa, abaixo do título, até a diagonal laranja (x ~ 400) */
    contato: { x: 104, y: 734, largura: 285, altura: 14 },
  },
  /**
   * faixa das logos das montadoras (ARTES_DA_PROPOSTA_NOVA.logosDasMontadoras): SÓ SEM A ARTE
   * (a arte de 25/10/2026 já traz as logos). Espalhadas por igual entre x e x + largura, no y dado.
   * larguraMm de cada logo: até 25 mm (a 24 mm a WEG, a de menor resolução, passa de 300 dpi)
   */
  montadoras: { x: 36, y: 618, largura: 523, larguraMm: 24 },
  /**
   * SELOS da faixa da arte: o prazo (prazoExecucao) abaixo de "Prazo de execução:" e a garantia
   * (garantia) abaixo de "Garantia do serviço:", cada um até a barra que separa do próximo. Só a
   * duração, em negrito laranja, de tamanhoMaximo para baixo até caber; NUNCA abaixo de
   * tamanhoMinimo nem cortado: a API recusa salvar o que não cabe (cabeNoSelo,
   * pdf-proposta-nova.ts). Sem prazo: PAGINA_1.prazo.semPrazo; sem garantia: GARANTIA_PADRAO
   */
  selos: {
    prazo: { x: 73, y: 516, largura: 95, altura: 25 },
    garantia: { x: 235, y: 516, largura: 85, altura: 25 },
  },
  estiloDosSelos: { tamanhoMaximo: 11, tamanhoMinimo: 9, cor: '#F7941D' },
};

/** Página 2 do modelo novo: textos fixos. */
export const PAGINA_2_NOVA = {
  // o rótulo acima do nome de quem montou o orçamento é o "Cargo na proposta" do usuário
  // (tela Usuários; padrão "Consultor"), em caixa alta
  titulo: { azul: 'ESCOPO', laranja: 'DO SERVIÇO' },
  /** títulos dos cartões em linhas; `laranja` = linhas (ou trecho final) em laranja */
  cartoes: {
    DOCUMENTACAO: { linhas: ['DOCUMENTAÇÃO', 'DE ENGENHARIA'], laranja: 'DE ENGENHARIA' },
    BOMBEIROS: { linhas: ['ADEQUAÇÃO', 'CORPO DE BOMBEIROS', '• IT 41'], laranja: '' },
    MATERIAL: { linhas: ['INFRAESTRUTURA', 'DA INSTALAÇÃO'], laranja: 'INSTALAÇÃO' },
  },
  contempla: {
    faixa: { azul: 'ESCOPO DO SERVIÇO', laranja: 'CONTEMPLA' },
    /** fixo, igual em toda proposta; duas linhas cada */
    etapas: <{ icone: 'prancheta' | 'caixa' | 'ferramenta' | 'teste' | 'suporte'; linhas: [string, string] }[]>[
      { icone: 'prancheta', linhas: ['Levantamento', 'técnico'] },
      { icone: 'caixa', linhas: ['Fornecimento', 'de materiais'] },
      { icone: 'ferramenta', linhas: ['Execução da', 'infraestrutura'] },
      { icone: 'teste', linhas: ['Instalação, testes', 'e comissionamento'] },
      { icone: 'suporte', linhas: ['Entrega técnica', 'com suporte'] },
    ],
    /**
     * LINHA DE CONDIÇÕES, abaixo do bloco: a qualificação que saiu dos selos de prazo e garantia
     * (25/10/2026; os selos têm só a duração). Igual em toda proposta e neutra quanto ao tipo de
     * serviço. PROVISÓRIA: aguarda a Guarusolar; troque o texto aqui (a altura é medida, cabe
     * em mais de uma linha). Vazia = a linha some.
     */
    condicoes: 'Prazo contado da aprovação da proposta. Garantia a partir da conclusão do serviço.',
    /**
     * Acrescentada à linha de condições quando o cartão da página 3 tem a taxa REPASSADA (soma
     * mais que o investimento; 27/10/2026). Taxa absorvida: nada a explicar. As duas frases juntas
     * cabem numa linha a 8 pt (497 de 523 pt): a altura do bloco não muda com a taxa.
     */
    taxaRepassada: { credito: 'No cartão, o valor parcelado inclui a taxa da operadora.', debito: 'No débito, o valor inclui a taxa da operadora.' },
  },
};
