import { useSyncExternalStore } from 'react';

/*
 * Som curto de aviso, com botão de silenciar guardado POR NAVEGADOR (localStorage). Usado no
 * escritório (chegou serviço para validar) e no app do técnico (o gestor validou ou devolveu o
 * serviço que ele espera no local). Cada app tem a sua chave: silenciar um não silencia o outro.
 *
 * O som vem embutido aqui (WAV de 0,45 s, duas notas curtas, 5 KB), sem arquivo externo. O
 * navegador só deixa tocar som depois que a pessoa interagiu com a página: até lá, e em qualquer
 * outra falha, a reprodução é ignorada em silêncio e fica o aviso visual.
 *
 * Sem localStorage (janela anônima com armazenamento bloqueado), a escolha vale só enquanto a
 * página estiver aberta. Padrão: ligado.
 */
const SOM = 'data:audio/wav;base64,UklGRoUTAABXQVZFZm10IBAAAAABAAEAESsAABErAAABAAgAZGF0YWETAACAgIGCgoGAf318e3x+goWHiIeDf3p3dXZ6gIaLjo2Jgnt0cG9ze4SMkpSQiX50bGlsc3+LlJmYkYV4bGVka3eFk52fmo5+b2NeYW19j52ko5mIdWRaWWJyhpmmqaKTf2xdV1toe4+gqKecinZkWVhhcYWYpaiilIBtXlhbaHqOnqemnIt3ZVpZYXCElqOoopSCbmBZXGd5jZ2mppyMeGdcWWFwg5Wip6KVg3BhWlxneIucpaWcjHpoXVphb4GUoaailYRxYltcZ3eKmqSlnY17al5bYW6AkqClopaFcmNcXWd3iZmjpJ2OfGtfW2Fuf5GepKGWhnRlXV1mdoiYoqSdj31sYFxhbX6QnaShl4Z1Zl1eZnWHl6GjnY9+bWFdYW19jpyjoZeHdmdeXmZ0hpWgo52Qf29iXmFsfI2boqCXiHdoX19mdISUn6KdkIBwY15hbHuMmqGgl4l4aWBfZnODk56hnZGBcWVfYmx7i5mgoJiKeWthYGZygpKdoZyRgnJmYGJreoqXn5+YinpsYmBmcoGRnKCckoNzZ2Fia3mJlp6fmIt7bWNhZnGBkJufnJKEdGhhYmt4iJWdnpiLfG5kYWZxgI6an5yShHVpYmNreIeUnZ6YjH1vZWJmcH+NmZ6ck4V2amNjaneGk5ydmI1+cGZiZnB+jJidm5OGd2tkZGp2hZKbnZiNf3FnY2ZwfYuXnJuTh3hsZWRqdoSRmpyYjoByaGRmb3yKlpybk4d5bWVkanWDkJmcmI6Bc2lkZ298iZWbm5SIem5mZWp1go+Ym5iOgXRqZWdve4mUmpqUiHtvZ2VqdIGOl5uYj4J1a2Znb3qIk5qalIl8cGhmanSBjZeamI+DdmxmZ256h5KZmpSJfXFpZmpzgIyWmpePg3dsZ2hueYaRmJmUin1yaWdqc3+LlZmXkIR4bWhobnmFkJeZlIp+cmpnanN/i5SZl5CFeG5oaG54hI+XmJSLf3NraGpyfoqTmJeQhXlvaWhueISPlpiUi4B0bGhrcn2JkpeXkIZ6cGppbneDjpWXlIyAdWxpa3J9iJKXlpCGe3FqaW53go2Ul5SMgXZtaWtyfIeRlpaQh3xxa2pudoGMlJeUjIJ3bmprcXuHkJaWkYd8cmxqbnaBi5OWlIyCd29qa3F7ho+VlZGIfXNsam52gIuSlpSNg3hva2txeoWPlJWRiH50bWtudYCKkpWTjYN5cGtscXqEjpSVkYl+dG5rbnV/iZGVk42EenFsbHF6hI2TlJGJf3VubG51foiQlJONhHpybGxxeYOMk5SRiYB2b2xudX6IkJSTjYV7cm1tcXmDjJKUkYqAd29sbnR9h4+Tk46FfHNubXF4gouRk5GKgXdwbW50fYaOk5KOhnx0bm1xeIGKkZORioF4cW1udHyGjpKSjoZ9dG9tcXiBipCTkIqCeXFub3R8hY2Sko6GfXVvbnF3gImQkpCLgnlybm90fISMkZKOh352cG5xd4CIj5KQi4N6c29vdHuEjJGRjod+dnBucXd/iI6RkIuDenNvb3N7g4uQkY6Hf3dxb3F3f4eOkZCLg3t0cG9zeoOLkJGOiH93cW9xdn6HjZGQi4R8dHBwc3qCio+RjoiAeHJwcXd/h42OjYmEf3p1cXBze4eSmZeNfm9naXOAi4+MhoB/goaGgHVrZ2+BlaOjlHxnXGFziJaYjn90dX+Mkox7Z11jeZarrpx9X1FYcY6hoZB5amp7kJyXgWVUWXKVsbajf1xLU2+QpaWTeWhneI6cmYRoVlhwkq62pIJfTVJsjaOmlXtpZ3aMm5mGa1hYbo+staaFYk5SaoqippZ+amd0ipqZiG5aWGyMqbSniGVQUWiIoKaYgGxnc4iYmYlwXFlqiaazqIpoUlFmhZ6lmYJtZ3GGl5mLc15ZaYaksqmNa1NRZIKcpZqEb2dwhJWZjXVgWmeEobCpj25VUWOAmqSchnFob4KTmY54YlpmgZ6vqpFxWFJhfpiknYhzaG6AkpmPemRbZX+braqTc1pSYHuWo52KdGltfpCYkHxnXGR8mauqlXZcU195lKKejHZqbXyOl5F+aV1kepaqqpd5XlRed5Khn414a2x6jJaSgGtfY3iUqKqZe2BVXXWPoJ+PemxseYuWkoJtYGN2kaaqmn5jVlxzjZ+fkHxta3eJlZOEb2FjdY+kqZuAZVdccYudn5J9bmt2h5OThXFjY3OMoqmcg2dYW2+JnJ+Tf29rdYWSk4dzZGNxiqConYVqWVtth5qflIFwa3SEkZOIdWZjcIiep56HbFtbbIWZn5WDcmtzgpCTiXdnY2+FnKafiW5cW2qDl5+WhHNscoGPk4p5aWRug5qln4txXltpiJickHxqZG2Ak5yWhHBlaHmNmpmLdmdlcoaXm5F+bGRsfpKbloVxZWh3i5majHhpZXGElZuSgG1la32QmpeHc2dodomYmo16amZwgpSbk4FvZmt7jpqXiHVoZ3SIl5qPfGtmb4GSmpSDcGZqeoyZl4p3aWdzhpWZkH5tZm5/kZmUhHJnaniLmJiLeGpncoSUmZF/bmdtfY+ZlYZ0aGl3iZaYjHpraHGDk5mRgXBobHyOmJWHdWlpdoeVmI18bWhwgZGYkoJxaGx6jJeWiXdqaXSGlJeOfW5ob3+QmJOEc2lseYqWlop5a2lzhJOXj39vaW9+jpeThXRqa3iJlZaLem1pcoOSl5CAcWlufY2WlIZ2a2t3h5SWjHxuanKBkJaRgnJqbnuLlZSId2xrdoaTlo19b2pxgI+WkYN0a216ipWUiXlta3WEkpWOf3BqcH6OlZKEdWtteYiUlIp6bmt0g5CVj4Bya3B9jJWShnZsbXiHk5SLfG9rc4GPlY+Bc2tvfIuUkod4bW13hpKUjH1wbHKAjpSQg3Rsb3uJk5KIeW5tdoSRlI1+cWxyf42UkIR1bW56iJKTiXpvbXWDj5SNgHJscX6Mk5GFd25ueYeRk4p8cG10go6TjoF0bXF8ipORhnhubniGkJOLfXFtc4CNk46CdW1we4mSkYd5b253hJCSi35ybXN/jJKPg3ZucHqIkZGIe3BudoOPkox/c25yfouSj4R3b3B5h5CRiXxxbnWCjZKNgXRucn2KkY+FeHBweIWPkYp9cm90gYySjYJ1b3F8iZGQhnpwb3iEj5GKfnNvdICLkY6Ddm9xe4eQkId7cXB3g46Ri390b3N+ipGOhHhwcXqGj5CIfHJwdoKNkYyAdXBzfYmQjoV5cXF5hY6QiX1zcHWBjJCMgXZwc3yIj46GenFxeISOkIl+dHB1gIuQjIJ3cHJ8h4+PhntycXiDjZCKf3VwdH+Kj42DeHFye4aOj4d8c3F3goyPi4B2cXR+iY+NhHlycnqFjY+IfXRxdoGLj4uBd3F0fYiOjYV6cnJ5hI2PiX50cXaAio+Lgndyc3yHjo2Ge3NyeIOMjol/dXF1f4mOjIN4cnN7ho2Ohnx0cniCi46KgHZydX6IjoyEeXNze4WNjod9dHJ3gYqOioF3cnV9h42MhHpzc3qEjI2IfnVyd4CKjoqCeHN0fYeNjIV7dHN5g4uNiH92c3Z/iY2LgnlzdHyGjIyGfHRzeYKLjYmAd3N2f4iNi4N6dHR7hYyMhn11c3iBio2JgHhzdn6HjYuEenR0eoSLjId+dnN4gImNioF4c3V9hoyLhXt1dHqDi4yIf3d0d4CIjIqCeXR1fIWMi4V8dXR5goqMiH93dHd/h4yKg3p0dXyFi4yGfXZ0eYGJjIiAeHR3foeMioN7dXV7hIqMhn52dHiBiIyJgXl0dn2Gi4qEfHV1eoOKi4d/d3R4gIiMiYJ5dXZ9hYuLhXx2dXqCiYuHf3h1eH+Hi4mCenV2fISKi4V9dnV5gYmLiIB4dXd+houKg3t2dnyEiouGfnd1eYGIi4iBeXV3foaKioR8dnZ7g4mLhn94dXmAh4uIgXp2d32FioqEfHd2e4KJiod/eHV4f4eKiYJ7dnd9hIqKhX13dnqBiIqHgHl2eH+GiomDe3Z3fISJioV+eHZ6gYiKh4F6dnh+hYqJg3x3d3yDiYqGfnh2eYCHioiBenZ4fYWJiYR9d3d7goiKhn95dnmAhoqIgnt3d32EiYmEfXh3e4KIioaAeXZ5f4aJiIJ7d3d8g4mJhX54d3qBh4mHgHp3eH6FiYiDfHd3fIOIiYV+eXd6gIeJh4F6d3h+hImIg314d3yCiImFf3l3eoCGiYeCe3d4fYSIiIR9eHd7goeJhoB6d3l/hYmHgnx4eH2DiIiEfnl3e4GHiYaAend5f4WIiIN8eHh8g4iIhX55d3qAhomGgXt4eX6EiIiDfXh4fIKHiIV/enh6gIaIh4F7eHl+hIiIg315eHyCh4iFgHp4en+FiIeCfHh5fYOHiIR+eXh7gYaIhoB7eHp/hYiHgnx4eX2Dh4iEfnp4e4CGiIaBe3h6foSIh4N9eXl8goeIhX96eHuAhYiGgXx4eX6Eh4eDfXl5fIKGiIV/enh6f4WIhoJ8eXl9g4eHg356eXyBhoiFgHt5en+Eh4aCfXl5fYOHh4R+enl7gYWHhYB7eXp/hIeGgn15eX2ChoeEf3p5e4CFh4aBfHl6foOHh4N9enl8goaHhH97eXuAhYeGgXx5en6Dh4eDfnp5fIGGh4WAe3l7f4SHhoJ9eXp9goaHg356eXyBhYeFgHx5e3+Eh4aCfXp6fYKGh4R/e3l8gIWHhYF8eXp+g4aGgn56en2ChoeEf3t5e4CEh4WBfHp6foOGhoN+enp8gYWGhIB7ent/hIaFgX16en6ChoaDfnt6fIGFhoSAfHp7f4OGhYJ9enp9goWGg397enyAhIaFgXx6e3+DhoaCfnp6fYKFhoR/e3p8gISGhYF9ent+g4aGg357en2BhYaEgHx6fH+EhoWBfXp7foKFhoN+e3p9gYWGhIB8ent/g4aFgn17e36ChYaDf3t6fICEhoSAfHp7f4OGhYJ+e3t9goWGg398enyAhIaEgX16e36DhYWCfnt7fYGFhoSAfHp8gIOFhYF9e3t+goWFg397e32BhIWEgHx7fH+DhYWBfXt7foKFhYN/fHt9gISFhIB9e3x/g4WFgn57e36BhYWDf3x7fICEhYSBfXt8f4KFhYJ+e3t9gYSFg4B8e3yAg4WEgX17e36ChYWCf3x7fYGEhYOAfHt8f4OFhIF+e3t+goSFg398e32AhIWEgH17fH+DhYSCfnt7foGEhYN/fHt9gIOFhIF9e3x/goWEgn58e36BhIWDgHx7fYCDhYSBfXt8f4KEhIJ/fHt9gYSFg4B9e3yAg4WEgX58fH6ChISCf3x7fYCDhYOAfXt8f4OEhIF+fHx+gYSEgn98fH2Ag4WDgH18fH+ChISCfnx8foGEhIN/fXx9gIOEg4F+fHx/goSEgn98fH6BhISDgH18fYCDhISBfnx8foKEhIJ/fHx9gYOEg4B9fH1/goSEgX58fH6BhISCf318fYCDhIOAfXx9f4KEhIF+fHx+gYSEgn99fH2Ag4SDgX58fX+ChISCf3x8foGDhIOAfXx9gIOEg4F+fHx/goSEgn99fH6Bg4SDgH18fX+ChIOBfnx8foGDhIJ/fXx+gIOEg4B+fH1/goSDgX58fH6Bg4SCf318fYCDhIOAfnx9f4KEg4F/fXx+gYOEgoB9fH2AgoSDgX58fX+Cg4OCf318foGDhIKAfXx9gIKEg4F+fX1/gYODgn99fH6Ag4SDgH58fX+Cg4OBf319foGDg4J/fXx+gIKEg4B+fX1/goODgX99fX6Bg4OCgH19foCCg4OBfn19f4GDg4F/fX1+gYODgoB+fX2AgoODgX59fX+Bg4OCf319foCDg4KAfn19f4KDg4F/fX1/gYODgn99fX6AgoOCgH59fX+Cg4OBf319foGDg4KAfn1+gIKDg4F+fX1/gYODgX99fX6Bg4OCgH59foCCg4OBfn19f4GDg4F/fX1+gIKDgoB+fX6AgoODgX99fX+Bg4OCf359foCCg4KAfn1+f4KDg4F/fX1/gYODgoB+fX6AgoOCgH59fX+Bg4OBf319foGCg4KAfn1+gIKDgoF/fX1/gYODgX9+fX6AgoOCgH59foCCg4KBf319f4GDg4F/fn1+gIKDgoB+fX5/gYOCgX99fX+BgoOCgH59foCCg4KAfn1+f4GDg4F/fn1/gYKDgoB+fX6AgoOCgX99fn+BgoOBf359foCCg4KAfn1+gIKDgoF/fn5/gYKDgX9+fX6AgoOCgH59foCBg4KBf35+f4GCg4GAfn1+gIKDgoB+fX5/gYKCgX9+fn+BgoKCgH59foCCgoKAf35+gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';

export type SomDeAviso = {
  /** Toca o som, se estiver ligado. Nunca lança erro. */
  tocar: () => void;
  useSomLigado: () => boolean;
  definirSomLigado: (ligado: boolean) => void;
};

export function criarSomDeAviso(chave: string): SomDeAviso {
  const ouvintes = new Set<() => void>();
  let naMemoria: boolean | null = null;

  const ler = (): boolean => {
    try {
      const guardado = localStorage.getItem(chave);
      if (guardado !== null) return guardado !== 'desligado';
    } catch {
      // sem localStorage: vale o que foi escolhido nesta página
    }
    return naMemoria ?? true;
  };

  const acompanhar = (avisar: () => void) => {
    ouvintes.add(avisar);
    // outra aba do mesmo app mudou o botão
    const deOutraAba = (e: StorageEvent) => e.key === chave && avisar();
    window.addEventListener('storage', deOutraAba);
    return () => {
      ouvintes.delete(avisar);
      window.removeEventListener('storage', deOutraAba);
    };
  };

  return {
    tocar() {
      if (!ler()) return;
      try {
        const audio = new Audio(SOM);
        audio.volume = 0.6;
        void audio.play().catch(() => undefined);
      } catch {
        // navegador sem áudio: fica o aviso visual
      }
    },
    useSomLigado: () => useSyncExternalStore(acompanhar, ler),
    definirSomLigado(ligado) {
      naMemoria = ligado;
      try {
        localStorage.setItem(chave, ligado ? 'ligado' : 'desligado');
      } catch {
        // fica só na memória
      }
      for (const avisar of ouvintes) avisar();
    },
  };
}
