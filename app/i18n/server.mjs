import { catalogs, translate } from './core.mjs';
export const message = (key, args = []) => ({ key, args });
export const source = (key, args = []) => translate('pl', key, args);
export class LocalizedError extends Error {
  constructor(value) {
    super(typeof value === 'string' ? value : source(value.key, value.args));
    if (value && typeof value === 'object') this.messageDescriptor = value;
  }
}
const fixedErrors = new Map(Object.entries(catalogs.pl).filter(([, value]) => !/\{\d+\}/.test(value)).map(([key, value]) => [value, key]));
export function localizedResponse(body) {
  if (!body || typeof body.error !== 'string' || body.errorMessage) return body;
  const key = fixedErrors.get(body.error);
  return key ? { ...body, errorMessage: message(key) } : body;
}
