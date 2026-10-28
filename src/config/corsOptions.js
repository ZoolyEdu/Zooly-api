const metodosPermitidos = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const headersPermitidos = ['Authorization', 'Content-Type'];

function origensConfiguradas() {
  const valor = process.env.CORS_ORIGINS ?? '';
  const origens = valor.split(',').map(origem => origem.trim()).filter(Boolean);

  return new Set(origens.filter(origem => {
    if (origem === '*') return false;
    try {
      const url = new URL(origem);
      return ['http:', 'https:'].includes(url.protocol) &&
        !url.username && !url.password &&
        url.origin === origem;
    } catch {
      return false;
    }
  }));
}

export default {
  origin(origem, callback) {
    if (!origem) return callback(null, false);
    return callback(null, origensConfiguradas().has(origem));
  },
  methods: metodosPermitidos,
  allowedHeaders: headersPermitidos,
  optionsSuccessStatus: 204,
  maxAge: 600
};
