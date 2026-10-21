/*
 * Dados dos clipes e o preparo de cada um pela API (o que acontece ANTES de gravar).
 * Tudo fictício: nomes comuns, endereços de Guarulhos conferidos no ViaCEP (o ViaCEP é
 * respondido aqui mesmo durante a gravação, então nada sai para a internet), itens do catálogo
 * de exemplo do seed e as equipes com a composição real (Equipe A: Willian e Washington;
 * B: Gilmar e Vitor; C: André).
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Usuários do seed de desenvolvimento (npm run db:seed). A senha pode vir de VIDEO_SENHA_SEED. */
export const SEED = {
  senha: process.env.VIDEO_SENHA_SEED ?? 'guarusolar123',
  admin: 'admin@guarusolar.com.br',
  comercial: 'comercial@guarusolar.com.br',
  gestor: 'gestor@guarusolar.com.br',
  tecnicoDeTeste: 'tecnico.a@guarusolar.com.br',
};

/** Técnicos com os nomes reais e a equipe padrão de cada um (contas só do ambiente local). */
export const TECNICOS = [
  { nome: 'Willian', email: 'willian@video-tutorial.local', equipeId: 'Equipe A' },
  { nome: 'Washington', email: 'washington@video-tutorial.local', equipeId: 'Equipe A' },
  { nome: 'Gilmar', email: 'gilmar@video-tutorial.local', equipeId: 'Equipe B' },
  { nome: 'Vitor', email: 'vitor@video-tutorial.local', equipeId: 'Equipe B' },
  { nome: 'André', email: 'andre@video-tutorial.local', equipeId: 'Equipe C' },
];

/** O ViaCEP de mentira: os mesmos dados que o ViaCEP de verdade devolve para estes CEPs. */
export const CEPS = {
  '07040000': { logradouro: 'Rua Cônego Valadão', bairro: 'Gopoúva' },
  '07140000': { logradouro: 'Rua Pedro de Toledo', bairro: 'Jardim Santa Lídia' },
  '07093000': { logradouro: 'Rua Soldado Hereny da Costa', bairro: 'Vila Silveira' },
  '07024000': { logradouro: 'Rua General Osório', bairro: 'Centro' },
  '07111000': { logradouro: 'Avenida Paulo Faccini', bairro: 'Macedo' },
  '07175000': { logradouro: 'Avenida Armando Bei', bairro: 'Vila Nova Bonsucesso' },
};

const endereco = (cep, numero) => ({ cep, numero, ...CEPS[cep], cidade: 'Guarulhos', uf: 'SP' });

/** Um cliente por clipe. O do clipe 1 é cadastrado na frente da câmera. */
export const CLIENTES = {
  clipe1: { nome: 'Ricardo Almeida Santos', whatsapp: '11987452310', ...endereco('07040000', '482') },
  clipe2: { nome: 'Fernanda Ribeiro Costa', whatsapp: '11991236587', email: 'fernanda.ribeiro@exemplo.com.br', ...endereco('07140000', '215') },
  clipe3: { nome: 'Carlos Eduardo Pereira', whatsapp: '11984561203', ...endereco('07093000', '77') },
  clipe4: { nome: 'Juliana Martins Rocha', whatsapp: '11976543218', ...endereco('07024000', '1150') },
  clipe5: { nome: 'Roberto Carvalho Lima', whatsapp: '11993217845', ...endereco('07111000', '1830') },
  clipe6: { nome: 'Patrícia Gomes Ferreira', whatsapp: '11982347516', ...endereco('07175000', '640') },
};

/** Itens do catálogo de exemplo (seed), procurados pelo começo do nome. */
export const KIT_SOLAR = [
  { nome: 'Painel solar 550 W', quantidade: 10 },
  { nome: 'Inversor string 5 kW', quantidade: 1 },
  { nome: 'Estrutura telhado cerâmico', quantidade: 3 },
  { nome: 'Cabo solar 6 mm', quantidade: 40 },
  { nome: 'String box CC', quantidade: 1 },
  { nome: 'Instalação e homologação', quantidade: 1 },
];
export const TIPO_SOLAR = 'Instalação de sistema fotovoltaico';
export const PRAZO = '30 dias após a aprovação';

// ---------------------------------------------------------------------------------- datas

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });
export const hoje = () => fmt.format(new Date());
export const somarDias = (dia, n) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const diaDaSemana = (dia) => new Date(`${dia}T12:00:00Z`).getUTCDay(); // 0 = domingo
/** "22/10", como a agenda escreve */
export const diaMes = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
/** O próximo dia útil da agenda (segunda a sábado) depois de `dia`. */
export const proximoDiaDeAgenda = (dia) => {
  let d = somarDias(dia, 1);
  while (diaDaSemana(d) === 0) d = somarDias(d, 1);
  return d;
};
/** Segunda-feira da semana do dia (a agenda mostra de segunda a sábado). */
export const segundaDaSemana = (dia) => somarDias(dia, -((diaDaSemana(dia) + 6) % 7));

// ---------------------------------------------------------------------------------- API

export class Api {
  constructor(origem) {
    this.origem = origem;
    this.tokens = {};
  }

  async pedir(token, metodo, caminho, corpo) {
    const resposta = await fetch(this.origem + caminho, {
      method: metodo,
      headers: { ...(corpo instanceof FormData ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: corpo instanceof FormData ? corpo : corpo ? JSON.stringify(corpo) : undefined,
    });
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) throw new Error(`${metodo} ${caminho} respondeu ${resposta.status}: ${dados?.erro ?? JSON.stringify(dados)}`);
    return dados;
  }

  async entrar(email, senha = SEED.senha) {
    const { token } = await this.pedir(null, 'POST', '/api/auth/login', { email, senha });
    this.tokens[email] = token;
    return token;
  }

  como(email) {
    const token = this.tokens[email];
    if (!token) throw new Error(`Sem login de ${email}`);
    return {
      get: (c) => this.pedir(token, 'GET', c),
      post: (c, b) => this.pedir(token, 'POST', c, b),
      put: (c, b) => this.pedir(token, 'PUT', c, b),
      patch: (c, b) => this.pedir(token, 'PATCH', c, b),
      token,
    };
  }
}

// ---------------------------------------------------------------------------------- preparo

/**
 * Prepara o ambiente uma vez: entra com os usuários do seed, cria os técnicos reais (ou gera
 * senha nova para eles) e tira o técnico de teste do seed da Equipe A, desativando-o, para a
 * equipe aparecer só com Willian e Washington.
 * Devolve as senhas dos técnicos (geradas agora, só na memória).
 */
export async function prepararBase(api, log) {
  await api.entrar(SEED.admin);
  await api.entrar(SEED.comercial);
  await api.entrar(SEED.gestor);
  const admin = api.como(SEED.admin);
  const { usuarios } = await admin.get('/api/usuarios');

  const senhas = {};
  for (const t of TECNICOS) {
    let existente = usuarios.find((u) => u.email === t.email);
    let temporaria;
    if (!existente) {
      const criado = await admin.post('/api/usuarios', { nome: t.nome, email: t.email, papel: 'TECNICO', equipeId: t.equipeId });
      existente = criado.usuario;
      temporaria = criado.senhaTemporaria;
      log(`técnico criado: ${t.nome} (${t.equipeId})`);
    } else {
      if (!existente.ativo || existente.equipeId !== t.equipeId) await admin.patch(`/api/usuarios/${existente.id}`, { ativo: true, equipeId: t.equipeId });
      temporaria = (await admin.post(`/api/usuarios/${existente.id}/nova-senha`)).senhaTemporaria;
    }
    // troca a temporária por uma senha só desta execução (o app pediria a troca no 1º acesso)
    const token = await api.entrar(t.email, temporaria);
    const nova = `Video-${randomBytes(9).toString('base64url')}-9`;
    await api.pedir(token, 'POST', '/api/auth/senha', { senhaAtual: temporaria, novaSenha: nova });
    await api.entrar(t.email, nova);
    senhas[t.email] = nova;
  }

  const deTeste = usuarios.find((u) => u.email === SEED.tecnicoDeTeste);
  if (deTeste?.ativo) {
    await admin.patch(`/api/usuarios/${deTeste.id}`, { ativo: false });
    log(`técnico de teste do seed (${SEED.tecnicoDeTeste}) desativado: a Equipe A fica só com Willian e Washington`);
  }
  return senhas;
}

/** Recusa gravar de novo por cima dos clientes de uma gravação anterior (a tela ficaria com repetidos). */
export async function conferirBancoLimpo(api) {
  const comercial = api.como(SEED.comercial);
  const repetidos = [];
  for (const c of Object.values(CLIENTES)) {
    const achados = await comercial.get(`/api/clientes?q=${encodeURIComponent(c.nome)}`);
    if (achados.some((a) => a.nome === c.nome)) repetidos.push(c.nome);
  }
  return repetidos;
}

async function catalogo(api) {
  const produtos = await api.como(SEED.comercial).get('/api/produtos');
  return KIT_SOLAR.map((k) => {
    const p = produtos.find((x) => x.ativo && x.nome.startsWith(k.nome));
    if (!p) throw new Error(`Item "${k.nome}" não está no catálogo. Rode o seed de desenvolvimento (npm run db:seed).`);
    return { produtoId: p.id, quantidade: k.quantidade };
  });
}

async function tipoSolar(api) {
  const tipos = await api.como(SEED.comercial).get('/api/tipos-de-servico');
  const t = tipos.find((x) => x.nome === TIPO_SOLAR && x.ativo);
  if (!t) throw new Error(`Tipo de serviço "${TIPO_SOLAR}" não encontrado.`);
  return t.id;
}

async function clienteComOrcamento(api, chave, { status } = {}) {
  const comercial = api.como(SEED.comercial);
  const cliente = await comercial.post('/api/clientes', { tipoPessoa: 'FISICA', ...CLIENTES[chave] });
  const orcamento = await comercial.post('/api/orcamentos', {
    clienteId: cliente.id,
    tipoDeServicoId: await tipoSolar(api),
    validade: somarDias(hoje(), 30),
    condicaoPagamento: 'A_VISTA',
    descontoAVistaPct: 5,
    prazoExecucao: PRAZO,
    descricaoServico: 'Sistema fotovoltaico de 5,5 kWp · Residencial',
    itens: await catalogo(api),
    idCriacao: randomUUID(),
  });
  if (status === 'ENVIADO' || status === 'APROVADO') await comercial.patch(`/api/orcamentos/${orcamento.id}/status`, { status: 'ENVIADO' });
  if (status === 'APROVADO') await comercial.patch(`/api/orcamentos/${orcamento.id}/status`, { status: 'APROVADO' });
  return { cliente, orcamento };
}

/** Instalação agendada (orçamento aprovado -> projeto -> agenda), com a equipe padrão. */
async function instalacaoAgendada(api, chave, equipeId, dia) {
  const { cliente, orcamento } = await clienteComOrcamento(api, chave, { status: 'APROVADO' });
  const gestor = api.como(SEED.gestor);
  const projeto = (await gestor.get('/api/agenda/pendentes')).find((p) => p.orcamento.codigo === orcamento.codigo);
  const tecnicos = (await gestor.get('/api/agenda/tecnicos')).filter((t) => t.equipeId === equipeId).map((t) => t.id);
  const servico = await gestor.post('/api/agenda', { projetoId: projeto.id, equipeId, tipo: 'INSTALACAO', dataInicio: dia, dataFim: dia, tecnicos });
  return { cliente, orcamento, projeto, servico };
}

export const PREPAROS = {
  clipe1: async () => ({}),
  clipe2: async (api) => clienteComOrcamento(api, 'clipe2'),
  clipe3: async (api) => clienteComOrcamento(api, 'clipe3', { status: 'ENVIADO' }),
  clipe4: async (api) => ({ cliente: await api.como(SEED.comercial).post('/api/clientes', { tipoPessoa: 'FISICA', ...CLIENTES.clipe4 }) }),

  /** Instalação de hoje da Equipe B, com as fotos e o envio feitos pelo Gilmar (pela API). */
  clipe5: async (api, { gerarFotos }) => {
    const { servico } = await instalacaoAgendada(api, 'clipe5', 'Equipe B', hoje());
    const gilmar = api.como(TECNICOS[2].email);
    const detalhe = await gilmar.get(`/api/tecnico/servicos/${servico.id}`);
    const fotos = await gerarFotos(detalhe.checklist.map((i) => i.rotulo));
    let minuto = 0;
    for (const [i, item] of detalhe.checklist.entries()) {
      const corpo = new FormData();
      corpo.append('arquivo', new Blob([await readFile(fotos[i])], { type: 'image/jpeg' }), path.basename(fotos[i]));
      corpo.append('chave', item.chave);
      corpo.append('idLocal', randomUUID());
      // um pouco antes de agora, uma foto a cada 4 minutos, no endereço do cliente
      corpo.append('capturadaEm', new Date(Date.now() - (60 - (minuto += 4)) * 60_000).toISOString());
      corpo.append('latitude', String(-23.4419 + i * 0.00002));
      corpo.append('longitude', String(-46.5096 - i * 0.00002));
      await gilmar.post(`/api/tecnico/servicos/${servico.id}/fotos`, corpo);
    }
    await gilmar.post(`/api/tecnico/servicos/${servico.id}/concluir`, {
      observacoesTecnico: 'Instalação concluída sem intercorrências. Inversor gerando, cliente orientado sobre o aplicativo de monitoramento.',
      sistemaTestado: true,
    });
    return { servico };
  },

  /** Instalação de hoje da Equipe A (Willian e Washington): o Willian abre no celular. */
  clipe6: async (api, { gerarFotos }) => {
    const agendada = await instalacaoAgendada(api, 'clipe6', 'Equipe A', hoje());
    const detalhe = await api.como(TECNICOS[0].email).get(`/api/tecnico/servicos/${agendada.servico.id}`);
    const rotulos = detalhe.checklist.filter((i) => i.obrigatoria).map((i) => i.rotulo);
    return { ...agendada, rotulos, fotos: await gerarFotos(rotulos) };
  },
};
