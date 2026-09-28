import { z, ZodIssueCode, ZodParsedType } from 'zod';

/*
 * Mensagens padrão do Zod em português, escritas para o usuário final (convenção do CLAUDE.md).
 * Vale para toda a API: basta este arquivo ser importado no início do server.ts.
 * Uma mensagem própria passada na rota (ex.: .min(3, 'Informe o nome completo')) tem prioridade.
 * O nome do campo não entra no texto: o tratador de erros já o devolve em `detalhes[].campo`.
 */

const plural = (n: number | bigint, singular: string, pluralTexto: string) =>
  `${n} ${Number(n) === 1 ? singular : pluralTexto}`;

const dataBR = (valor: number | bigint) => new Date(Number(valor)).toLocaleDateString('pt-BR');

const TIPOS: Partial<Record<string, string>> = {
  [ZodParsedType.string]: 'Deve ser um texto',
  [ZodParsedType.number]: 'Deve ser um número',
  [ZodParsedType.bigint]: 'Deve ser um número',
  [ZodParsedType.boolean]: 'Deve ser verdadeiro ou falso',
  [ZodParsedType.date]: 'Informe uma data válida',
  [ZodParsedType.array]: 'Deve ser uma lista',
  [ZodParsedType.object]: 'Formato inválido',
};

const mapaDeErros: z.ZodErrorMap = (issue) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined || issue.received === ZodParsedType.null) {
        return { message: 'Campo obrigatório' };
      }
      if (issue.expected === ZodParsedType.number && issue.received === ZodParsedType.nan) {
        return { message: 'Informe um número válido' };
      }
      return { message: TIPOS[issue.expected] ?? 'Valor inválido' };

    case ZodIssueCode.invalid_string:
      switch (issue.validation) {
        case 'email':
          return { message: 'Informe um e-mail válido' };
        case 'uuid':
        case 'cuid':
        case 'cuid2':
        case 'ulid':
          return { message: 'Identificador inválido' };
        case 'url':
          return { message: 'Informe um endereço (URL) válido' };
        case 'date':
        case 'datetime':
          return { message: 'Informe uma data válida' };
        case 'time':
          return { message: 'Informe um horário válido' };
        default:
          return { message: 'Formato inválido' };
      }

    case ZodIssueCode.too_small:
      if (issue.type === 'string') {
        if (issue.exact) return { message: `Deve ter exatamente ${plural(issue.minimum, 'caractere', 'caracteres')}` };
        if (Number(issue.minimum) <= 1) return { message: 'Campo obrigatório' };
        return { message: `Deve ter pelo menos ${plural(issue.minimum, 'caractere', 'caracteres')}` };
      }
      if (issue.type === 'array' || issue.type === 'set') {
        if (issue.exact) return { message: `Inclua exatamente ${plural(issue.minimum, 'item', 'itens')}` };
        if (Number(issue.minimum) <= 1) return { message: 'Inclua ao menos um item' };
        return { message: `Inclua pelo menos ${plural(issue.minimum, 'item', 'itens')}` };
      }
      if (issue.type === 'number' || issue.type === 'bigint') {
        if (Number(issue.minimum) === 0) {
          return { message: issue.inclusive ? 'Não pode ser negativo' : 'Deve ser maior que zero' };
        }
        return {
          message: issue.inclusive
            ? `Deve ser no mínimo ${issue.minimum}`
            : `Deve ser maior que ${issue.minimum}`,
        };
      }
      if (issue.type === 'date') {
        return { message: `A data deve ser a partir de ${dataBR(issue.minimum)}` };
      }
      return { message: 'Valor abaixo do permitido' };

    case ZodIssueCode.too_big:
      if (issue.type === 'string') {
        if (issue.exact) return { message: `Deve ter exatamente ${plural(issue.maximum, 'caractere', 'caracteres')}` };
        return { message: `Deve ter no máximo ${plural(issue.maximum, 'caractere', 'caracteres')}` };
      }
      if (issue.type === 'array' || issue.type === 'set') {
        return { message: `Inclua no máximo ${plural(issue.maximum, 'item', 'itens')}` };
      }
      if (issue.type === 'number' || issue.type === 'bigint') {
        return {
          message: issue.inclusive
            ? `Deve ser no máximo ${issue.maximum}`
            : `Deve ser menor que ${issue.maximum}`,
        };
      }
      if (issue.type === 'date') {
        return { message: `A data deve ser até ${dataBR(issue.maximum)}` };
      }
      return { message: 'Valor acima do permitido' };

    case ZodIssueCode.invalid_enum_value:
      return { message: 'Opção inválida' };

    case ZodIssueCode.invalid_date:
      return { message: 'Informe uma data válida' };

    case ZodIssueCode.not_multiple_of:
      return { message: `Deve ser múltiplo de ${issue.multipleOf}` };

    case ZodIssueCode.not_finite:
      return { message: 'Informe um número válido' };

    case ZodIssueCode.unrecognized_keys:
      return { message: `Campo não permitido: ${issue.keys.join(', ')}` };

    case ZodIssueCode.invalid_union: {
      // Ex.: e-mail opcional (.email().or(z.literal(''))): mostra o motivo da primeira opção,
      // que já passou por este mesmo mapa.
      const primeira = issue.unionErrors[0]?.issues[0];
      return { message: primeira?.message ?? 'Valor inválido' };
    }

    case ZodIssueCode.invalid_literal:
    case ZodIssueCode.invalid_union_discriminator:
    case ZodIssueCode.invalid_arguments:
    case ZodIssueCode.invalid_return_type:
    case ZodIssueCode.invalid_intersection_types:
    case ZodIssueCode.custom:
      return { message: 'Valor inválido' };

    default:
      // Código novo de uma versão futura do Zod: nunca devolver o texto padrão em inglês.
      return { message: 'Valor inválido' };
  }
};

z.setErrorMap(mapaDeErros);
