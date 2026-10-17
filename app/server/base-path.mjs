export function publicBasePath(config = process.env) {
  const path = config.PUBLIC_URL ? new URL(config.PUBLIC_URL).pathname.replace(/\/+$/, '') : '';
  if (!/^(?:\/[A-Za-z0-9_-]+)*$/.test(path)) throw new Error('PUBLIC_URL zawiera nieobsługiwaną ścieżkę.');
  return path;
}
