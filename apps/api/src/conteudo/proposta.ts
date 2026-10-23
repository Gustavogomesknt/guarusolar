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
  notaDoPagamento: 'Parcelamos em até 18x no cartão, com taxa da operadora. À vista no Pix ou transferência, com desconto.',
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
  /** foto no pé de cada cartão do escopo (preenche a área e é cortada nas sobras) */
  fotoDocumentacao: 'assets/proposta/foto-documentacao.jpg',
  fotoBombeiros: 'assets/proposta/foto-bombeiros.jpg',
  fotoInfraestrutura: 'assets/proposta/foto-infraestrutura.jpg',
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
