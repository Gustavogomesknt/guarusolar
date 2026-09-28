import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { TipoPessoa } from '@guarusolar/compartilhado';
import { api, ErroApi } from '@/lib/api';
import type { Cliente } from '@/lib/tipos';
import { mascararCep, mascararDocumento, mascararTelefone, somenteDigitos } from '@/lib/formatar';
import { buscarCep } from '@/lib/viacep';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Campo, ariaDoCampo } from '@/components/Campo';

const esquema = z
  .object({
    tipoPessoa: z.enum(['FISICA', 'JURIDICA']),
    nome: z.string().trim().min(3, 'Informe o nome completo'),
    documento: z.string(),
    whatsapp: z.string().refine((v) => somenteDigitos(v).length >= 10, 'Informe o WhatsApp com DDD'),
    email: z.string().trim().email('Informe um e-mail válido').or(z.literal('')),
    cep: z.string().refine((v) => somenteDigitos(v).length === 8, 'Informe o CEP com 8 dígitos'),
    logradouro: z.string(),
    numero: z.string().trim().min(1, 'Informe o número'),
    complemento: z.string(),
    bairro: z.string(),
    cidade: z.string(),
    uf: z.string().trim().refine((v) => v === '' || /^[A-Za-z]{2}$/.test(v), 'Use a sigla com 2 letras'),
  })
  .superRefine((dados, ctx) => {
    const digitos = somenteDigitos(dados.documento).length;
    const esperado = dados.tipoPessoa === 'FISICA' ? 11 : 14;
    if (digitos !== esperado) {
      ctx.addIssue({
        code: 'custom',
        path: ['documento'],
        message: dados.tipoPessoa === 'FISICA' ? 'O CPF tem 11 dígitos' : 'O CNPJ tem 14 dígitos',
      });
    }
  });

type DadosCliente = z.infer<typeof esquema>;

const VAZIO: DadosCliente = {
  tipoPessoa: 'FISICA',
  nome: '',
  documento: '',
  whatsapp: '',
  email: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
};

/** Para a API: só dígitos em documento/WhatsApp/CEP e sem campos vazios. */
function paraApi(dados: DadosCliente) {
  const opcional = (v: string) => (v.trim() ? v.trim() : undefined);
  return {
    tipoPessoa: dados.tipoPessoa,
    nome: dados.nome.trim(),
    documento: somenteDigitos(dados.documento),
    whatsapp: somenteDigitos(dados.whatsapp),
    email: opcional(dados.email),
    cep: somenteDigitos(dados.cep),
    logradouro: opcional(dados.logradouro),
    numero: opcional(dados.numero),
    complemento: opcional(dados.complemento),
    bairro: opcional(dados.bairro),
    cidade: opcional(dados.cidade),
    uf: opcional(dados.uf)?.toUpperCase(),
  };
}

/** Preenche nome ou documento com o que o vendedor já tinha digitado na busca. */
function preencherComBusca(busca: string): Partial<DadosCliente> {
  const texto = busca.trim();
  const digitos = somenteDigitos(texto);
  if (!texto) return {};
  if (digitos.length >= 3 && digitos.length === texto.replace(/[\s.\-/()]/g, '').length) {
    return digitos.length > 11
      ? { tipoPessoa: 'JURIDICA', documento: mascararDocumento(digitos) }
      : { documento: mascararDocumento(digitos) };
  }
  return { nome: texto };
}

const CLASSE_CAMPO = 'h-11 rounded-[10px] text-sm';
const CLASSE_PREENCHIDO_PELO_CEP = 'bg-[#F8FAFD]';

export function DialogNovoCliente({
  aberto,
  onAbertoChange,
  buscaAtual,
  onSalvo,
}: {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  buscaAtual: string;
  onSalvo: (cliente: Cliente) => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    setError,
    setFocus,
    watch,
    formState: { errors },
  } = useForm<DadosCliente>({ resolver: zodResolver(esquema), defaultValues: VAZIO });

  const [cepStatus, setCepStatus] = useState<'ocioso' | 'buscando' | 'falhou'>('ocioso');
  const buscaCep = useRef<AbortController | null>(null);
  const tipoPessoa = watch('tipoPessoa');

  // Ao abrir, começa limpo (com o que foi digitado na busca, se houver).
  useEffect(() => {
    if (!aberto) return;
    reset({ ...VAZIO, ...preencherComBusca(buscaAtual) });
    setCepStatus('ocioso');
    // buscaAtual fica de fora das dependências de propósito: só importa no momento de abrir
  }, [aberto, reset]);

  async function completarEndereco(cep: string) {
    if (somenteDigitos(cep).length !== 8) return;
    buscaCep.current?.abort();
    const controle = new AbortController();
    buscaCep.current = controle;
    setCepStatus('buscando');
    try {
      const endereco = await buscarCep(cep, controle.signal);
      if (!endereco) {
        setCepStatus('falhou');
        return;
      }
      const opcoes = { shouldValidate: true, shouldDirty: true };
      setValue('logradouro', endereco.logradouro, opcoes);
      setValue('bairro', endereco.bairro, opcoes);
      setValue('cidade', endereco.cidade, opcoes);
      setValue('uf', endereco.uf, opcoes);
      setCepStatus('ocioso');
      setFocus('numero');
    } catch {
      // busca cancelada por outra mais nova
    }
  }

  const salvar = useMutation({
    mutationFn: (dados: DadosCliente) => api.post<Cliente>('/api/clientes', paraApi(dados)),
    meta: { erroTratadoNoFormulario: true },
    onSuccess: (cliente) => {
      toast.success(`${cliente.nome} cadastrado e selecionado no orçamento`);
      onSalvo(cliente);
      onAbertoChange(false);
    },
    onError: (erro) => {
      if (!(erro instanceof ErroApi)) {
        setError('root', { message: 'Não foi possível salvar o cliente. Tente novamente.' });
        return;
      }
      if (erro.status === 409) {
        setError('documento', { message: erro.message }, { shouldFocus: true });
        return;
      }
      const campos = Object.keys(VAZIO) as (keyof DadosCliente)[];
      const doFormulario = erro.detalhes.filter((d) => campos.includes(d.campo as keyof DadosCliente));
      doFormulario.forEach((d, i) =>
        setError(d.campo as keyof DadosCliente, { message: d.mensagem }, { shouldFocus: i === 0 }),
      );
      if (doFormulario.length === 0) setError('root', { message: erro.message });
    },
  });

  const enviar = handleSubmit((dados) => salvar.mutate(dados));

  const TIPOS: { valor: TipoPessoa; rotulo: string }[] = [
    { valor: 'FISICA', rotulo: 'Pessoa física' },
    { valor: 'JURIDICA', rotulo: 'Pessoa jurídica' },
  ];

  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] gap-0 overflow-y-auto rounded-[18px] p-0 sm:max-w-[680px]">
        <form onSubmit={enviar} noValidate>
          <DialogHeader className="gap-1 px-7 pt-6 pb-4 pr-20 text-left">
            <DialogTitle className="font-titulo text-2xl font-bold">Novo cliente</DialogTitle>
            <DialogDescription>
              Cadastro rápido. Ao salvar, o cliente já entra selecionado no orçamento.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 px-7 pb-6">
            <Controller
              control={control}
              name="tipoPessoa"
              render={({ field }) => (
                <div role="group" aria-label="Tipo de cliente" className="flex gap-1 self-start rounded-xl bg-[#E7EBF2] p-1">
                  {TIPOS.map(({ valor, rotulo }) => (
                    <button
                      key={valor}
                      type="button"
                      aria-pressed={field.value === valor}
                      onClick={() => {
                        field.onChange(valor);
                        setValue('documento', '');
                      }}
                      className={cn(
                        'h-10 rounded-[9px] px-4 text-sm font-medium text-foreground/80 transition-colors',
                        field.value === valor && 'bg-card font-semibold text-foreground shadow-sm',
                      )}
                    >
                      {rotulo}
                    </button>
                  ))}
                </div>
              )}
            />

            <div className="grid grid-cols-6 gap-3.5">
              <Campo id="nc-nome" rotulo="Nome completo" obrigatorio erro={errors.nome?.message} className="col-span-6">
                <Input
                  {...ariaDoCampo('nc-nome', errors.nome?.message)}
                  {...register('nome')}
                  placeholder={tipoPessoa === 'FISICA' ? 'Ex.: Marina Albuquerque' : 'Razão social'}
                  className={CLASSE_CAMPO}
                />
              </Campo>

              <Campo
                id="nc-documento"
                rotulo={tipoPessoa === 'FISICA' ? 'CPF' : 'CNPJ'}
                obrigatorio
                erro={errors.documento?.message}
                className="col-span-6 sm:col-span-3"
              >
                <Controller
                  control={control}
                  name="documento"
                  render={({ field }) => (
                    <Input
                      {...ariaDoCampo('nc-documento', errors.documento?.message)}
                      ref={field.ref}
                      name={field.name}
                      value={field.value}
                      onBlur={field.onBlur}
                      onChange={(e) =>
                        field.onChange(
                          mascararDocumento(
                            somenteDigitos(e.target.value).slice(0, tipoPessoa === 'FISICA' ? 11 : 14),
                          ),
                        )
                      }
                      inputMode="numeric"
                      placeholder={tipoPessoa === 'FISICA' ? '000.000.000-00' : '00.000.000/0000-00'}
                      className={cn(CLASSE_CAMPO, 'font-mono')}
                    />
                  )}
                />
              </Campo>

              <Campo id="nc-whatsapp" rotulo="WhatsApp" obrigatorio erro={errors.whatsapp?.message} className="col-span-6 sm:col-span-3">
                <Controller
                  control={control}
                  name="whatsapp"
                  render={({ field }) => (
                    <Input
                      {...ariaDoCampo('nc-whatsapp', errors.whatsapp?.message)}
                      ref={field.ref}
                      name={field.name}
                      value={field.value}
                      onBlur={field.onBlur}
                      onChange={(e) => field.onChange(mascararTelefone(e.target.value))}
                      type="tel"
                      inputMode="tel"
                      placeholder="(11) 90000-0000"
                      className={cn(CLASSE_CAMPO, 'font-mono')}
                    />
                  )}
                />
              </Campo>

              <Campo id="nc-email" rotulo="E-mail" erro={errors.email?.message} className="col-span-6">
                <Input
                  {...ariaDoCampo('nc-email', errors.email?.message)}
                  {...register('email')}
                  type="email"
                  placeholder="nome@email.com"
                  className={CLASSE_CAMPO}
                />
              </Campo>

              <div className="col-span-6 flex items-center gap-3 pt-1.5">
                <span className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                  Endereço da instalação
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <Campo
                id="nc-cep"
                rotulo="CEP"
                obrigatorio
                erro={errors.cep?.message}
                ajuda={
                  cepStatus === 'falhou' ? (
                    <span role="status">CEP não encontrado. Preencha o endereço abaixo.</span>
                  ) : undefined
                }
                className="col-span-6 sm:col-span-2"
              >
                <div className="flex gap-1.5">
                  <Controller
                    control={control}
                    name="cep"
                    render={({ field }) => (
                      <Input
                        {...ariaDoCampo('nc-cep', errors.cep?.message)}
                        ref={field.ref}
                        name={field.name}
                        value={field.value}
                        onBlur={field.onBlur}
                        onChange={(e) => {
                          const cep = mascararCep(e.target.value);
                          field.onChange(cep);
                          if (cepStatus === 'falhou') setCepStatus('ocioso');
                          if (somenteDigitos(cep).length === 8) void completarEndereco(cep);
                        }}
                        inputMode="numeric"
                        placeholder="00000-000"
                        className={cn(CLASSE_CAMPO, 'min-w-0 flex-1 font-mono')}
                      />
                    )}
                  />
                  <Button
                    type="button"
                    size="icon"
                    aria-label="Buscar endereço pelo CEP"
                    onClick={() => void completarEndereco(watch('cep'))}
                    disabled={cepStatus === 'buscando'}
                    className="size-11 shrink-0 rounded-[10px]"
                  >
                    {cepStatus === 'buscando' ? <Loader2 className="animate-spin" /> : <Search />}
                  </Button>
                </div>
              </Campo>

              <Campo id="nc-logradouro" rotulo="Rua" className="col-span-6 sm:col-span-4">
                <Input
                  id="nc-logradouro"
                  {...register('logradouro')}
                  placeholder="Preenchido pelo CEP"
                  className={cn(CLASSE_CAMPO, CLASSE_PREENCHIDO_PELO_CEP)}
                />
              </Campo>

              <Campo id="nc-numero" rotulo="Número" obrigatorio erro={errors.numero?.message} className="col-span-2 sm:col-span-1">
                <Input
                  {...ariaDoCampo('nc-numero', errors.numero?.message)}
                  {...register('numero')}
                  className={CLASSE_CAMPO}
                />
              </Campo>

              <Campo id="nc-complemento" rotulo="Complemento" className="col-span-4 sm:col-span-2">
                <Input id="nc-complemento" {...register('complemento')} placeholder="Apto, bloco…" className={CLASSE_CAMPO} />
              </Campo>

              <Campo id="nc-bairro" rotulo="Bairro" className="col-span-6 sm:col-span-3">
                <Input
                  id="nc-bairro"
                  {...register('bairro')}
                  placeholder="Preenchido pelo CEP"
                  className={cn(CLASSE_CAMPO, CLASSE_PREENCHIDO_PELO_CEP)}
                />
              </Campo>

              <Campo id="nc-cidade" rotulo="Cidade" className="col-span-4 sm:col-span-5">
                <Input
                  id="nc-cidade"
                  {...register('cidade')}
                  placeholder="Preenchido pelo CEP"
                  className={cn(CLASSE_CAMPO, CLASSE_PREENCHIDO_PELO_CEP)}
                />
              </Campo>

              <Campo id="nc-uf" rotulo="UF" erro={errors.uf?.message} className="col-span-2 sm:col-span-1">
                <Input
                  {...ariaDoCampo('nc-uf', errors.uf?.message)}
                  {...register('uf')}
                  maxLength={2}
                  placeholder="SP"
                  className={cn(CLASSE_CAMPO, CLASSE_PREENCHIDO_PELO_CEP, 'uppercase')}
                />
              </Campo>
            </div>

            {errors.root && (
              <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {errors.root.message}
              </p>
            )}
          </div>

          <DialogFooter className="flex-row items-center justify-between gap-3 border-t px-7 py-4 sm:justify-between">
            <span className="text-[13px] text-muted-foreground">* Campos obrigatórios</span>
            <div className="flex gap-2.5">
              <Button type="button" variant="outline" className="h-11 rounded-[10px] px-4" onClick={() => onAbertoChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="h-11 rounded-[10px] px-5 font-semibold" disabled={salvar.isPending}>
                {salvar.isPending && <Loader2 className="animate-spin" aria-hidden />}
                Salvar e usar no orçamento
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
