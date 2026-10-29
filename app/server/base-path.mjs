import { message, source, LocalizedError } from '../i18n/server.mjs';
export function publicBasePath(config = process.env) {
  const path = config.PUBLIC_URL ? new URL(config.PUBLIC_URL).pathname.replace(/\/+$/, '') : '';
  if (!/^(?:\/[A-Za-z0-9_-]+)*$/.test(path)) throw new LocalizedError(message("errors.public_url_contains_an_unsupported_path"));
  return path;
}
