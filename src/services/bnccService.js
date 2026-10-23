const API_BASE = 'https://api.bncc.dev/v1';
const TIMEOUT_MS = 5000;
const MAX_RESULTS_PER_STAGE = 10;
const codigoPermitido = /^(?:EI0[1-3]|EF0[1-5])[A-Z]{2}\d{2}$/;
let fetchExterno = (...args) => globalThis.fetch(...args);
let timeoutMs = TIMEOUT_MS;

export function configurarFetchBncc(fetchImpl, timeout = TIMEOUT_MS) {
  fetchExterno = fetchImpl ?? ((...args) => globalThis.fetch(...args));
  timeoutMs = timeout;
}

export class BnccServiceError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'BnccServiceError';
    this.status = status;
  }
}

async function requisitar(path) {
  let response;
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    response = await fetchExterno(`${API_BASE}${path}`, {
      headers: { Accept: 'application/json' },
      signal
    });
  } catch (error) {
    throw erroDeRequisicao(error, signal);
  }

  if (!response || typeof response.ok !== 'boolean' || !Number.isInteger(response.status)) {
    throw new BnccServiceError('A API da BNCC retornou uma resposta HTTP inválida.', 502);
  }
  if (response.status === 404) throw new BnccServiceError('Item da BNCC não encontrado.', 404);
  if (!response.ok) throw new BnccServiceError('A API da BNCC está indisponível.', 502);

  let body;
  try {
    body = await response.json();
  } catch (error) {
    if (signal.aborted || error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new BnccServiceError('A consulta à BNCC excedeu o tempo limite.', 504);
    }
    throw new BnccServiceError('A API da BNCC retornou uma resposta inválida.', 502);
  }
  if (signal.aborted) throw new BnccServiceError('A consulta à BNCC excedeu o tempo limite.', 504);
  return body;
}

function erroDeRequisicao(error, signal) {
  if (signal.aborted || error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return new BnccServiceError('A consulta à BNCC excedeu o tempo limite.', 504);
  }
  return new BnccServiceError('Não foi possível consultar a API da BNCC.', 502);
}

function objeto(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

function validarAprendizagem(item) {
  return objeto(item)
    && typeof item.codigo === 'string' && item.codigo.trim().length > 0
    && ['EI', 'EF', 'EM'].includes(item.etapa)
    && typeof item.texto === 'string' && item.texto.trim().length > 0
    && objeto(item.vigencia)
    && objeto(item.fonte);
}

function validarBusca(body, etapaEsperada) {
  if (!objeto(body)
    || !Number.isInteger(body.total) || body.total < 0
    || !Number.isInteger(body.pagina) || body.pagina < 1
    || !Number.isInteger(body.limite) || body.limite < 1
    || !Array.isArray(body.itens)
    || !body.itens.every(item => validarAprendizagem(item)
      && item.etapa === etapaEsperada
      && item.codigo.startsWith(etapaEsperada))) {
    throw new BnccServiceError('A API da BNCC retornou uma estrutura de busca inválida.', 502);
  }
  return body.itens;
}

export async function buscarAprendizagens(tema, limite = MAX_RESULTS_PER_STAGE) {
  const resultado = await Promise.all(['EI', 'EF'].map(async etapa => {
    const params = new URLSearchParams({ q: tema, etapa, limite: String(limite), pagina: '1' });
    const body = await requisitar(`/busca?${params}`);
    return validarBusca(body, etapa);
  }));
  const itens = resultado.flat();
  return {
    itens: itens.filter(item => item?.etapa === 'EI' || (item?.etapa === 'EF' && /^EF0[1-5]/.test(item.codigo ?? '')))
  };
}

export async function obterAprendizagem(codigo) {
  if (!codigoPermitido.test(codigo)) {
    throw new BnccServiceError('Código inválido ou fora do escopo consultado.', 400);
  }
  const item = await requisitar(`/aprendizagens/${encodeURIComponent(codigo)}`);
  if (!validarAprendizagem(item) || item.codigo !== codigo || !['EI', 'EF'].includes(item.etapa)) {
    throw new BnccServiceError('A API da BNCC retornou uma estrutura de aprendizagem inválida.', 502);
  }
  if (item.etapa === 'EF' && !/^EF0[1-5]/.test(item.codigo)) {
    throw new BnccServiceError('Código fora do escopo consultado.', 404);
  }
  return item;
}
