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
  /** abaixo da condição de pagamento escolhida no orçamento */
  // "sem juros": desde 25/10/2026 a taxa do cartão é da Guarusolar (REPASSAR_TAXA_DO_CARTAO)
  notaDoPagamento: 'Parcelamos em até 18x no cartão, sem juros. À vista no Pix ou transferência, com desconto.',
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

/** Tamanho da foto dos cartões (3:4, retrato). Menor só se o cartão não tiver altura para ela. */
export const FOTO_DO_CARTAO = {
  /** 40 mm: com os arquivos de ~225 px, uns 145 dpi; acima disso a foto borra no PDF */
  larguraMm: 40,
  proporcao: 3 / 4,
};

export const ARTES_DA_PROPOSTA_NOVA = {
  /** fundo de página inteira (A4 em retrato, 2480 x 3508 px = 300 dpi); a capa está acima */
  fundoPagina3: 'assets/proposta/pagina-3.jpg',
  /**
   * foto no pé de cada cartão do escopo: RETRATO 3:4, as três no mesmo tamanho (FOTO_DO_CARTAO,
   * abaixo). Os arquivos de 23/10/2026 têm uns 225 px de largura: não passe de 40 mm
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
 * Rodapé "Página X de N" das páginas 2 em diante (a capa não tem). Copie o estilo da numeração
 * da arte da capa quando ela chegar: tamanho, cor, alinhamento, espaçamento entre letras e a
 * distância da base da folha. `corSobreAArte` vale na última página, que é a arte da página 3.
 */
export const RODAPE_DA_PROPOSTA_NOVA = {
  texto: 'Página {pagina} de {total}',
  tamanho: 8,
  cor: '#5A6675',
  corSobreAArte: '#5A6675',
  alinhamento: 'right' as 'left' | 'center' | 'right',
  espacamento: 0.3,
  distanciaDaBase: 16,
};

/**
 * Página 3 do modelo novo: SETE campos POR CIMA da arte (assets/proposta/pagina-3.jpg, 1055 x
 * 1491 px, A4 exato: 1 px da arte = 0,5643 pt). Posições em PONTOS do PDF (1/72 de polegada), a
 * partir do canto de cima à esquerda da folha (A4 = 595,28 x 841,89); px da arte x 0,5643 = pt.
 * Medidas em 25/10/2026 na arte sem os valores embutidos. Cada campo é uma caixa: o texto não
 * passa da largura (diminui até caber) e a altura dela fica livre da régua laranja e do texto
 * fixo da arte. Os valores vêm gravados no orçamento (condições da proposta).
 */
export const PAGINA_3_NOVA = {
  /** tamanho máximo do valor grande (diminui até caber na largura do campo, mínimo 11) */
  tamanhoDoValor: 17,
  /** sobre os cartões escuros da arte */
  cores: { valor: '#FFFFFF', detalhe: '#CBDBF0' },
  campos: {
    /** cartão da esquerda: entre o título e a régua laranja (y 676,5) */
    investimento: { x: 35, y: 638, largura: 158, altura: 30 },
    /** cartão do meio: idem (régua em y 676,5) */
    aVista: { x: 225, y: 638, largura: 150, altura: 30 },
    /** cartão da direita (sem régua): parcelas em duas linhas e, embaixo, a última diferente */
    cartaoParcelas: { x: 409, y: 634, largura: 152, altura: 56 },
    /** cartão da direita, embaixo (o quadro escuro acaba em y 705, o cartão em 709) */
    cartaoTotal: { x: 409, y: 692, largura: 152, altura: 11 },
    /** faixa "PRONTO PARA APROVAR?": abaixo do título, até a diagonal laranja (x ~ 400) */
    contato: { x: 104, y: 741, largura: 285, altura: 19 },
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
  },
};
