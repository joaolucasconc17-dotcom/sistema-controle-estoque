/**
 * Flag do modo demonstracao, isolada num modulo minusculo de proposito.
 *
 * O resto do codigo de demo (dados + roteador falso) e carregado por
 * `import()` dinamico so quando esta flag e verdadeira. Assim, no build
 * normal — com a flag desligada — o Vite consegue eliminar aquele codigo
 * do bundle em vez de carregar ~58KB de dados ficticios que nunca serao
 * usados em producao.
 */
export const IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
