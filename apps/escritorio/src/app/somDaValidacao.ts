import { criarSomDeAviso } from '@guarusolar/web/somDeAviso';

/** Som de "chegou serviço para validar" (quem toca é o AcompanhamentoOperacao; botão no menu). */
const som = criarSomDeAviso('guarusolar.escritorio.somDaValidacao');

export const tocarSomDeChegada = som.tocar;
export const useSomLigado = som.useSomLigado;
export const definirSomLigado = som.definirSomLigado;
