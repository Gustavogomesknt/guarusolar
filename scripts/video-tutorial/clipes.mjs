/*
 * O roteiro de cada clipe: o que o cursor faz, passo a passo. Cada e.legenda() mostra o
 * PRÓXIMO texto do array do clipe em legendas.mjs.
 */
import { CLIENTES, SEED, TECNICOS, TIPO_SOLAR, diaMes, hoje, proximoDiaDeAgenda, segundaDaSemana } from './dados.mjs';

const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const html = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** O dia da grade em que o clipe agenda; se cair na semana seguinte, a agenda avança uma semana. */
async function irParaASemanaDo(e, dia) {
  if (segundaDaSemana(dia) !== segundaDaSemana(hoje())) await e.clicar(e.app.getByRole('button', { name: 'Próxima semana' }));
}

export const CLIPES = [
  {
    id: 'clipe1',
    arquivo: '1-cadastrar-cliente-e-montar-orcamento.mp4',
    titulo: 'Cadastrar cliente e montar um orçamento',
    formato: 'computador',
    app: 'escritorio',
    usuario: SEED.comercial,
    inicio: '/orcamentos',
    async roteiro(e) {
      const { app } = e;
      const c = CLIENTES.clipe1;
      await app.getByRole('heading', { name: 'Orçamentos' }).first().waitFor();

      await e.legenda();
      await e.clicar(app.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Novo orçamento' }));
      await app.getByRole('heading', { name: 'Novo orçamento' }).waitFor();

      await e.legenda();
      await e.escolher(app.locator('#tipo-de-servico'), { label: TIPO_SOLAR });

      await e.legenda();
      await e.clicar(app.getByRole('button', { name: 'Cadastrar novo cliente' }).first());
      const ficha = app.getByRole('dialog');

      await e.legenda();
      await e.digitar(ficha.locator('#nc-nome'), c.nome);
      await e.digitar(ficha.locator('#nc-whatsapp'), c.whatsapp);

      await e.legenda();
      await e.digitar(ficha.locator('#nc-cep'), c.cep);
      await e.esperarAte(async () => (await ficha.locator('#nc-logradouro').inputValue()) === c.logradouro, { descricao: 'o CEP preencher a rua' });

      await e.legenda();
      await e.digitar(ficha.locator('#nc-numero'), c.numero);
      await e.clicar(ficha.getByRole('button', { name: 'Salvar e usar no orçamento' }));
      await app.getByText('Cliente selecionado').waitFor();

      const busca = app.getByRole('combobox', { name: 'Adicionar item do catálogo' });
      const adicionar = async (termo, nome) => {
        await e.digitar(busca, termo, { pausa: 400 });
        const opcao = app.getByRole('option', { name: new RegExp(escapar(nome)) });
        await opcao.waitFor();
        await e.pausa(600);
        await e.clicar(opcao);
      };
      await e.legenda();
      await adicionar('painel 550', 'Painel solar 550 W');

      await e.legenda();
      await e.digitar(app.locator('input[id$="-quantidade"]').first(), '10', { limpar: true });

      await e.legenda();
      await adicionar('inversor 5', 'Inversor string 5 kW');
      await adicionar('estrutura cer', 'Estrutura telhado cerâmico');
      await adicionar('instalação', 'Instalação e homologação');

      await e.legenda();
      await e.clicar(app.getByRole('group', { name: 'Sugestões de prazo' }).getByRole('button').first());

      await e.legenda();
      await e.clicar(app.getByRole('button', { name: 'Salvar rascunho' }));
      await app.getByText(/Orçamento GS-\d{4}-\d+ salvo/).waitFor();
      await e.apontar(app.getByText(/GS-\d{4}-\d+ · Rascunho/));
    },
  },

  {
    id: 'clipe2',
    arquivo: '2-gerar-proposta-e-enviar-whatsapp.mp4',
    titulo: 'Gerar a proposta e enviar pelo WhatsApp',
    formato: 'computador',
    app: 'escritorio',
    usuario: SEED.comercial,
    inicio: '/orcamentos',
    async roteiro(e, { orcamento }) {
      const { app } = e;
      const nome = CLIENTES.clipe2.nome;
      const linha = app.getByRole('row').filter({ hasText: orcamento.codigo });
      await linha.waitFor();

      await e.legenda();
      await e.clicar(linha.getByText(nome).first());
      await app.getByText(`${orcamento.codigo} · Rascunho`).waitFor();

      await e.legenda();
      await e.apontar(app.getByRole('heading', { name: 'Valor total do orçamento' }), { y: 2.2 });
      await e.pausa();

      await e.legenda();
      const pdf = await e.capturarAba(() => e.clicar(app.getByRole('button', { name: 'Gerar PDF' }), { pausa: 0 }));
      // a proposta aparece por cima, e "rola" devagar até as condições
      await e.painel(`
        <div style="width:900px;height:720px;overflow:hidden;border-radius:10px;box-shadow:0 18px 60px rgba(0,0,0,.35);background:#fff">
          <iframe src="${html(pdf)}#toolbar=0&navpanes=0&view=FitH" style="width:900px;height:1460px;border:0;display:block;transition:transform 4.5s ease-in-out" id="pdf"></iframe>
        </div>`);
      await e.pausa(2500);

      await e.legenda();
      await e.pagina.evaluate(() => (document.getElementById('pdf').style.transform = 'translateY(-560px)'));
      await e.pausa(5000);
      await e.painel(null);
      await e.pausa(800);

      await e.legenda();
      const whatsapp = await e.capturarAba(() => e.clicar(app.getByRole('button', { name: 'Enviar via WhatsApp' }), { pausa: 0 }));
      // o link do PDF aparece como "link da proposta": aqui ele é um endereço local, com o token
      const texto = html(new URL(whatsapp).searchParams.get('text') ?? '').replace(
        /https?:\/\/\S+/g,
        '<span style="color:#1257A6;text-decoration:underline">link da proposta (PDF)</span>',
      );
      await e.painel(`
        <div style="width:620px;border-radius:16px;overflow:hidden;background:#EFEAE2;box-shadow:0 18px 60px rgba(0,0,0,.35);font-family:'Segoe UI',Arial,sans-serif">
          <div style="background:#1f2c34;color:#fff;padding:14px 20px;font-size:17px;font-weight:600">${html(nome)}<div style="font-size:13px;font-weight:400;opacity:.75">Mensagem pronta para enviar</div></div>
          <div style="padding:22px">
            <div style="background:#DCF3E4;border-radius:12px;padding:14px 16px;font-size:15px;line-height:1.45;color:#10243D;white-space:pre-wrap;max-height:430px;overflow:hidden">${texto}</div>
          </div>
        </div>`);
      await e.pausa(1200);

      await e.legenda();
      await e.pausa(3500);
      await e.painel(null);

      await e.legenda();
      await app.getByText(`${orcamento.codigo} · Enviado`).waitFor();
      await e.apontar(app.getByText(`${orcamento.codigo} · Enviado`));
      await e.pausa();

      await e.legenda();
      await e.clicar(app.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Orçamentos' }));
      const status = app.getByRole('row').filter({ hasText: orcamento.codigo }).getByRole('button', { name: /^Status: Enviado/ });
      await status.waitFor();
      await e.apontar(status);
      await e.pausa();

      await e.legenda();
      await e.apontar(app.getByRole('button', { name: `Enviar ${orcamento.codigo} via WhatsApp` }));
      await e.pausa(2500);
    },
  },

  {
    id: 'clipe3',
    arquivo: '3-aprovar-orcamento-e-agendar-equipe.mp4',
    titulo: 'Aprovar um orçamento e agendar a equipe',
    formato: 'computador',
    app: 'escritorio',
    usuario: SEED.gestor,
    inicio: '/orcamentos',
    async roteiro(e, { orcamento }) {
      const { app } = e;
      const nome = CLIENTES.clipe3.nome;
      const linha = app.getByRole('row').filter({ hasText: orcamento.codigo });
      await linha.waitFor();

      await e.legenda();
      await e.digitar(app.getByPlaceholder('Buscar cliente ou código'), nome.split(' ')[0]);

      await e.legenda();
      await e.clicar(linha.getByRole('button', { name: /^Status: / }));

      await e.legenda();
      await e.clicar(app.getByRole('menuitem', { name: 'Aprovado' }));

      await e.legenda();
      await e.apontar(app.getByRole('dialog').getByText(/vira um projeto/));
      await e.pausa(800);
      await e.clicar(app.getByRole('button', { name: 'Aprovar e criar projeto' }));
      await app.getByText(`${orcamento.codigo} agora está aprovado`).waitFor();

      await e.legenda();
      await e.clicar(app.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Agenda' }));
      await app.getByRole('heading', { name: 'Agenda das equipes' }).waitFor();

      await e.legenda();
      const cartao = app.getByRole('button', { name: new RegExp(escapar(nome)) }).and(app.locator('[aria-pressed]'));
      await e.clicar(cartao);

      await e.legenda();
      const dia = proximoDiaDeAgenda(hoje());
      await irParaASemanaDo(e, dia);
      await e.clicar(app.getByRole('button', { name: new RegExp(`com a Equipe B em .*${diaMes(dia)}`) }));
      const janela = app.getByRole('dialog');
      await janela.getByRole('heading', { name: 'Agendar serviço' }).waitFor();

      await e.legenda();
      await e.digitar(janela.locator('#ag-dias'), '2', { limpar: true });

      await e.legenda();
      await e.apontar(janela.getByText('Quem vai'));
      await e.pausa(600);
      await e.apontar(janela.getByText('Gilmar', { exact: true }));
      await e.pausa();

      await e.legenda();
      await e.clicar(janela.getByRole('button', { name: /^Agendar/ }));
      await janela.waitFor({ state: 'hidden' });

      await e.legenda();
      const bloco = app.getByRole('button', { name: new RegExp(`^Instalação: ${escapar(nome)}`) });
      await e.apontar(bloco);
      await e.pausa();

      await e.legenda();
      await e.clicar(bloco, { pausa: 3000 });
      await e.pagina.keyboard.press('Escape');
      await e.pausa(800);
    },
  },

  {
    id: 'clipe4',
    arquivo: '4-agendar-visita-tecnica-sem-orcamento.mp4',
    titulo: 'Agendar uma visita técnica sem orçamento',
    formato: 'computador',
    app: 'escritorio',
    usuario: SEED.gestor,
    inicio: '/agenda',
    async roteiro(e) {
      const { app } = e;
      const nome = CLIENTES.clipe4.nome;
      await app.getByRole('heading', { name: 'Agenda das equipes' }).waitFor();

      await e.legenda();
      await e.clicar(app.getByRole('button', { name: 'Agendar visita técnica' }));
      const janela = app.getByRole('dialog');

      await e.legenda();
      await e.digitar(janela.getByRole('combobox', { name: 'Cliente' }), nome.split(' ')[0], { pausa: 400 });
      const opcao = janela.getByRole('option', { name: new RegExp(escapar(nome)) });
      await opcao.waitFor();
      await e.pausa(600);
      await e.clicar(opcao);

      await e.legenda();
      await e.apontar(janela.getByText(CLIENTES.clipe4.logradouro, { exact: false }));
      await e.pausa();

      await e.legenda();
      await e.escolher(janela.locator('#ag-equipe'), 'Equipe C');

      await e.legenda();
      const dia = proximoDiaDeAgenda(hoje());
      await e.apontar(janela.locator('#ag-dia'));
      await janela.locator('#ag-dia').fill(dia);
      await e.pausa();

      await e.legenda();
      await e.apontar(janela.getByText('André', { exact: true }));
      await e.pausa();

      await e.legenda();
      await e.clicar(janela.getByRole('button', { name: /^Agendar/ }));
      await janela.waitFor({ state: 'hidden' });
      await irParaASemanaDo(e, dia);

      await e.legenda();
      const bloco = app.getByRole('button', { name: new RegExp(`^Visita técnica avulsa: ${escapar(nome)}`) });
      await e.apontar(bloco);
      await e.pausa();

      await e.legenda();
      await e.clicar(bloco, { pausa: 2500 });

      await e.legenda();
      await e.clicar(app.getByRole('dialog').getByRole('link', { name: 'ficha do cliente' }));
      const visitas = app.locator('#titulo-visitas-do-cliente');
      await e.apontar(visitas);
      await e.pausa(2000);

      await e.legenda();
      await e.apontar(app.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: /Visitas a orçar/ }));
      await e.pausa(2500);
    },
  },

  {
    id: 'clipe5',
    arquivo: '5-validar-fotos-do-tecnico.mp4',
    titulo: 'Validar as fotos que o técnico enviou',
    formato: 'computador',
    app: 'escritorio',
    usuario: SEED.gestor,
    inicio: '/agenda',
    async roteiro(e) {
      const { app } = e;
      const nome = CLIENTES.clipe5.nome;
      await app.getByRole('heading', { name: 'Agenda das equipes' }).waitFor();

      await e.legenda();
      const menu = app.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: /Validação/ });
      await e.apontar(menu, { x: 0.85 });
      await e.pausa(900);
      await e.clicar(menu);

      await e.legenda();
      const titulo = app.getByRole('heading', { name: nome });
      await titulo.waitFor();
      await e.apontar(titulo);
      await e.pausa();

      await e.legenda();
      await e.apontar(app.getByText('Quem foi'));
      await e.pausa(900);
      await e.apontar(app.getByText('Teste do sistema'));
      await e.pausa();

      const cartoes = app.getByRole('button', { name: /^Ampliar: / });
      await e.legenda();
      await e.clicar(cartoes.first());
      const ampliada = app.getByRole('dialog');

      await e.legenda();
      for (let i = 0; i < 3; i++) {
        await e.clicar(ampliada.getByRole('button', { name: /^OK: / }), { pausa: 700 });
        await e.clicar(ampliada.getByRole('button', { name: 'Próxima foto' }), { pausa: 900 });
      }
      await e.pagina.keyboard.press('Escape');
      await ampliada.waitFor({ state: 'hidden' });
      await e.pausa(600);

      // a quinta foto: marcar para refazer, escrever o motivo e desistir
      const refazer = app.getByRole('button', { name: /^Refazer: / }).nth(4);
      const rotulo = (await refazer.getAttribute('aria-label')).replace(/^Refazer: /, '');
      await e.legenda();
      await e.clicar(refazer);

      await e.legenda();
      await e.digitar(app.getByPlaceholder(/foto do aterramento está desfocada/), 'Foto desfocada, refazer mais de perto.');
      await e.apontar(app.getByRole('button', { name: /^Devolver ao técnico/ }));
      await e.pausa();

      await e.legenda();
      await e.clicar(app.getByRole('button', { name: `OK: ${rotulo}` }));

      await e.legenda();
      await e.clicar(app.getByRole('button', { name: /^Validar instalação/ }));

      await e.legenda();
      await e.apontar(app.getByRole('dialog').getByText(/fica/));
      await e.pausa(800);
      await e.clicar(app.getByRole('dialog').getByRole('button', { name: 'Validar', exact: true }));
      await app.getByText(/validada\./).first().waitFor();
      await e.pausa(1500);
    },
  },

  {
    id: 'clipe6',
    arquivo: '6-tecnico-no-campo-celular.mp4',
    titulo: 'O técnico no campo: abrir o serviço, tirar as fotos e enviar',
    formato: 'celular',
    app: 'campo',
    usuario: TECNICOS[0].email, // Willian, Equipe A
    inicio: '/agenda',
    async roteiro(e, { projeto, rotulos, fotos }) {
      const { app } = e;
      const nome = CLIENTES.clipe6.nome;
      const cartao = app.locator('a[href*="/servico/"]').filter({ hasText: nome }).filter({ hasText: projeto.codigo });
      await cartao.waitFor();

      await e.legenda();
      await e.apontar(app.getByRole('heading', { name: /^Hoje/ }).first());
      await e.pausa();

      await e.legenda();
      await e.clicar(cartao);
      await app.getByText('Concluir serviço').waitFor();

      await e.legenda();
      await e.clicar(app.getByRole('button', { name: 'Permitir localização' }));

      await e.legenda();
      for (const [i, rotulo] of rotulos.entries()) {
        const bloco = app.getByRole('button', { name: new RegExp(`^${escapar(rotulo)}:`) });
        const [seletor] = await Promise.all([e.pagina.waitForEvent('filechooser'), e.clicar(bloco, { pausa: 0 })]);
        await seletor.setFiles(fotos[i]);
        await e.pausa(1100);
      }

      await e.legenda();
      await e.apontar(app.getByRole('progressbar', { name: 'Fotos obrigatórias enviadas' }));
      await app.getByText(`${rotulos.length} de ${rotulos.length}`).waitFor({ timeout: 60_000 });
      await e.pausa();

      await e.legenda();
      await e.digitar(app.locator('textarea'), 'Inversor gerando. Cliente orientado.');

      await e.legenda();
      await e.clicar(app.getByText(/^Sistema testado/));

      await e.legenda();
      const enviar = app.getByRole('button', { name: 'Enviar para validação' });
      await enviar.and(app.locator('[aria-disabled="false"]')).waitFor();
      await e.clicar(enviar);

      await e.legenda();
      await app.getByText('Enviado para validação', { exact: true }).waitFor();
      await e.apontar(app.getByText('Aguardando o gestor…'));
      await e.pausa(2000);
    },
  },
];
