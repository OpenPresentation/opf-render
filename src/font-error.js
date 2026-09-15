export class OPFFontError extends Error {
  constructor(code, message, details = {}) {
    super(message); this.name = 'OPFFontError'; this.code = code; this.details = details;
  }
}
