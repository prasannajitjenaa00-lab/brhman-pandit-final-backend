// Minimal logger so application code never calls console.* directly (lint-enforced).
/* eslint-disable no-console */
const stamp = () => new Date().toISOString();

module.exports = {
  info: (...a) => console.log(stamp(), 'INFO', ...a),
  warn: (...a) => console.warn(stamp(), 'WARN', ...a),
  error: (...a) => console.error(stamp(), 'ERROR', ...a),
};
