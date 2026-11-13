/*
 * COMO CADA ROTA DA API SE ISOLA DO REPRESENTANTE (vendedor de outro estado: só enxerga o que é
 * dele). Toda rota tem uma linha aqui; rota nova sem linha QUEBRA O BUILD
 * (lib/conferencia-rotas.ts, que também confere se "não alcança" bate com o autorizar da rota).
 *
 * - filtroDoRepresentante: o representante alcança e a rota filtra pelo dono (lib/acesso.ts); o
 *   que não é dele responde 404 (como o técnico: 403 confirmaria que existe). O teste com banco
 *   dos dois vendedores passa por todas estas.
 * - dado próprio: só devolve ou muda dados de quem está logado.
 * - global de propósito: o mesmo para todos, sem dado de cliente nem de orçamento (diga por quê).
 * - não alcança: o autorizar da rota não deixa o representante passar (a conferência calcula).
 *
 * Chave: MÉTODO + caminho, como o Express monta ("GET /api/orcamentos/:id"). Para listar:
 * node dist/lib/conferencia-rotas.js --listar
 */
export type Isolamento = 'filtroDoRepresentante' | 'dado próprio' | 'global de propósito' | 'não alcança';

type Linha = { isolamento: 'não alcança' } | { isolamento: Exclude<Isolamento, 'não alcança'>; porque: string };

export const ISOLAMENTO_DO_REPRESENTANTE: Record<string, Linha> = {
  // saude
  'GET /saude': { isolamento: 'global de propósito', porque: 'saúde da hospedagem: sem login e sem dado de ninguém' },
  // auth
  'POST /api/auth/login': { isolamento: 'dado próprio', porque: 'entrar: devolve só o token e os dados de quem entrou' },
  'GET /api/auth/eu': { isolamento: 'dado próprio', porque: 'os dados de quem está logado' },
  'POST /api/auth/senha': { isolamento: 'dado próprio', porque: 'troca a senha de quem está logado' },
  // clientes
  'GET /api/clientes/': { isolamento: 'filtroDoRepresentante', porque: 'só os clientes dele (representanteId), também na busca; quantidadeOrcamentos conta só os orçamentos dele' },
  'GET /api/clientes/:id': { isolamento: 'filtroDoRepresentante', porque: 'cliente de outro: 404; na ficha, só os orçamentos dele e sem projeto' },
  'POST /api/clientes/': { isolamento: 'filtroDoRepresentante', porque: 'o cliente cadastrado nasce dele; documento repetido de outro: 409 sem o nome' },
  'PUT /api/clientes/:id': { isolamento: 'filtroDoRepresentante', porque: 'cliente de outro: 404; documento repetido de outro: 409 sem o nome' },
  'PATCH /api/clientes/:id/ativo': { isolamento: 'filtroDoRepresentante', porque: 'cliente de outro: 404' },
  // produtos
  'GET /api/produtos/': { isolamento: 'filtroDoRepresentante', porque: 'catálogo comum, mas SEM preço de custo e sem margem/lucro; usadoEmOrcamentos conta só os orçamentos dele' },
  'POST /api/produtos/': { isolamento: 'não alcança' },
  'PUT /api/produtos/:id': { isolamento: 'não alcança' },
  'PATCH /api/produtos/:id/ativo': { isolamento: 'não alcança' },
  // tipos-de-servico
  'GET /api/tipos-de-servico/': { isolamento: 'filtroDoRepresentante', porque: 'lista comum; usadoEmOrcamentos conta só os orçamentos dele' },
  'POST /api/tipos-de-servico/': { isolamento: 'não alcança' },
  'PUT /api/tipos-de-servico/:id': { isolamento: 'não alcança' },
  'POST /api/tipos-de-servico/:id/mover': { isolamento: 'não alcança' },
  // orcamentos
  'GET /api/orcamentos/:id/pdf': { isolamento: 'global de propósito', porque: 'sem login, aberto pelo cliente final: quem isola é o token do link (64 hex), que só sai nas rotas de orçamento filtradas' },
  'GET /api/orcamentos/': { isolamento: 'filtroDoRepresentante', porque: 'lista e pipeline: só os dele (vendedorId), também na busca por palavras' },
  'GET /api/orcamentos/resumo': { isolamento: 'filtroDoRepresentante', porque: 'os quatro cartões contam só os dele' },
  'GET /api/orcamentos/capas': { isolamento: 'global de propósito', porque: 'configuração das capas do PDF por tipo de serviço: sem dado de cliente nem de orçamento' },
  'POST /api/orcamentos/folhas-da-proposta': { isolamento: 'filtroDoRepresentante', porque: 'orçamento ou cliente de outro: 404' },
  'GET /api/orcamentos/preferencias': { isolamento: 'dado próprio', porque: 'o último tipo de serviço de quem pede' },
  'GET /api/orcamentos/:id': { isolamento: 'filtroDoRepresentante', porque: 'orçamento de outro: 404 (o token do PDF só sai daqui para os dele)' },
  'POST /api/orcamentos/': { isolamento: 'filtroDoRepresentante', porque: 'o cliente tem de ser dele (senão "Cliente não encontrado"); o retry do idCriacao só vale para quem criou' },
  'PUT /api/orcamentos/:id': { isolamento: 'filtroDoRepresentante', porque: 'orçamento de outro: 404; trocar para cliente de outro: "Cliente não encontrado"' },
  'POST /api/orcamentos/:id/duplicar': { isolamento: 'filtroDoRepresentante', porque: 'só duplica o dele, para cliente dele; o retry do idCriacao só vale para quem duplicou' },
  'PATCH /api/orcamentos/:id/tipo': { isolamento: 'filtroDoRepresentante', porque: 'orçamento de outro: 404' },
  'PATCH /api/orcamentos/:id/status': { isolamento: 'filtroDoRepresentante', porque: 'orçamento de outro: 404' },
  'POST /api/orcamentos/:id/whatsapp': { isolamento: 'filtroDoRepresentante', porque: 'orçamento de outro: 404 (a mensagem leva o link do PDF)' },
  // agenda
  'GET /api/agenda/conflitos': { isolamento: 'não alcança' },
  'GET /api/agenda/tecnicos': { isolamento: 'não alcança' },
  'GET /api/agenda/': { isolamento: 'não alcança' },
  'GET /api/agenda/pendentes': { isolamento: 'não alcança' },
  'POST /api/agenda/': { isolamento: 'não alcança' },
  'PATCH /api/agenda/:id': { isolamento: 'não alcança' },
  // validacao
  'GET /api/validacao/fila': { isolamento: 'não alcança' },
  'GET /api/validacao/versao': { isolamento: 'não alcança' },
  'GET /api/validacao/:id': { isolamento: 'não alcança' },
  'POST /api/validacao/:id/aprovar': { isolamento: 'não alcança' },
  'POST /api/validacao/:id/devolver': { isolamento: 'não alcança' },
  // tecnico
  'GET /api/tecnico/versao': { isolamento: 'não alcança' },
  'GET /api/tecnico/agenda': { isolamento: 'não alcança' },
  'GET /api/tecnico/servicos/:id': { isolamento: 'não alcança' },
  'POST /api/tecnico/servicos/:id/fotos': { isolamento: 'não alcança' },
  'POST /api/tecnico/servicos/:id/videos/envio': { isolamento: 'não alcança' },
  'POST /api/tecnico/servicos/:id/videos': { isolamento: 'não alcança' },
  'POST /api/tecnico/servicos/:id/materiais': { isolamento: 'não alcança' },
  'POST /api/tecnico/servicos/:id/concluir': { isolamento: 'não alcança' },
  // fotos
  'GET /api/fotos/:id': { isolamento: 'não alcança' },
  // armazenamento
  'GET /api/armazenamento/uso': { isolamento: 'não alcança' },
  // videos
  'GET /api/videos/:id/capa': { isolamento: 'não alcança' },
  'GET /api/videos/:id/link': { isolamento: 'não alcança' },
  // projetos
  'GET /api/projetos/': { isolamento: 'não alcança' },
  'GET /api/projetos/:id': { isolamento: 'não alcança' },
  'PATCH /api/projetos/:id': { isolamento: 'não alcança' },
  'POST /api/projetos/:id/cancelar': { isolamento: 'não alcança' },
  'POST /api/projetos/:id/concluir': { isolamento: 'não alcança' },
  'POST /api/projetos/:id/reabrir': { isolamento: 'não alcança' },
  // visitas
  'GET /api/visitas/aguardando-orcamento': { isolamento: 'não alcança' },
  'GET /api/visitas/do-cliente/:clienteId': { isolamento: 'não alcança' },
  'POST /api/visitas/:id/dispensar': { isolamento: 'não alcança' },
  // usuarios
  'GET /api/usuarios/': { isolamento: 'não alcança' },
  'POST /api/usuarios/': { isolamento: 'não alcança' },
  'PATCH /api/usuarios/:id': { isolamento: 'não alcança' },
  'POST /api/usuarios/:id/nova-senha': { isolamento: 'não alcança' },
};
