/*
 * Garante, em tempo de compilação, que os enums de @guarusolar/compartilhado batem com os do
 * schema do Prisma. Se alguém mudar um enum no schema e esquecer do pacote (ou o contrário),
 * o `npm run build` falha aqui apontando qual enum divergiu.
 */
import type * as Banco from '@prisma/client';
import type * as Compartilhado from '@guarusolar/compartilhado';

type Igual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Confere<_Nome extends string, T extends true> = T;

export type ConferenciaEnums = [
  Confere<'Papel', Igual<Banco.Papel, Compartilhado.Papel>>,
  Confere<'TipoPessoa', Igual<Banco.TipoPessoa, Compartilhado.TipoPessoa>>,
  Confere<'CategoriaProduto', Igual<Banco.CategoriaProduto, Compartilhado.CategoriaProduto>>,
  Confere<'Unidade', Igual<Banco.Unidade, Compartilhado.Unidade>>,
  Confere<'StatusOrcamento', Igual<Banco.StatusOrcamento, Compartilhado.StatusOrcamento>>,
  Confere<'TipoDesconto', Igual<Banco.TipoDesconto, Compartilhado.TipoDesconto>>,
  Confere<'CondicaoPagamento', Igual<Banco.CondicaoPagamento, Compartilhado.CondicaoPagamento>>,
  Confere<'StatusProjeto', Igual<Banco.StatusProjeto, Compartilhado.StatusProjeto>>,
  Confere<'TipoServico', Igual<Banco.TipoServico, Compartilhado.TipoServico>>,
  Confere<'StatusAgendamento', Igual<Banco.StatusAgendamento, Compartilhado.StatusAgendamento>>,
  Confere<'RevisaoFoto', Igual<Banco.RevisaoFoto, Compartilhado.RevisaoFoto>>,
  Confere<'TipoEventoProjeto', Igual<Banco.TipoEventoProjeto, Compartilhado.TipoEventoProjeto>>,
];
