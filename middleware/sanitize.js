// Strips MongoDB operator injection ({"$ne": ...}, "a.b" keys) from request bodies and route params.
// Query strings are parsed with the "simple" parser (see server.js), so they can never contain objects.
const clean = (value) => {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !k.startsWith('$') && !k.includes('.'))
        .map(([k, v]) => [k, clean(v)])
    );
  }
  return value;
};

module.exports = (req, res, next) => {
  if (req.body && typeof req.body === 'object') req.body = clean(req.body);
  if (req.params) req.params = clean(req.params);
  next();
};
