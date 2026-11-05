// Regras do RA (registro do aluno). O RA é sempre texto: preserva zeros à esquerda.
//
// - Novos RAs (cadastro de aluno, troca de RA, primeiro acesso de quem ainda não
//   existe) precisam ter exatamente 13 dígitos.
// - RAs antigos já gravados podem ter outro formato. Eles continuam valendo para
//   login, entrada na turma e conclusão do cadastro, e nunca são alterados
//   automaticamente.

export const FORMATO_RA = /^\d{13}$/;
const TAMANHO_MAXIMO_RA_EXISTENTE = 64;

// Para gravar um RA novo: somente texto com exatamente 13 dígitos (espaços nas pontas
// são removidos). Números não são aceitos, pois perderiam zeros à esquerda.
export function normalizarRa(ra) {
  if (typeof ra !== "string") return null;
  const valor = ra.trim();
  return FORMATO_RA.test(valor) ? valor : null;
}

// Para procurar um aluno já cadastrado: aceita qualquer RA em texto, não vazio e de
// tamanho razoável, inclusive os antigos que não têm 13 dígitos.
export function normalizarRaExistente(ra) {
  if (typeof ra !== "string") return null;
  const valor = ra.trim();
  if (!valor || valor.length > TAMANHO_MAXIMO_RA_EXISTENTE) return null;
  if (/[\u0000-\u001f]/.test(valor)) return null;
  return valor;
}
