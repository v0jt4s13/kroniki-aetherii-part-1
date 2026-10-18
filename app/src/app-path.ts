// The production server sets <base> from PUBLIC_URL, including any path prefix.
export const appPath = (path: string) => new URL(path.replace(/^\//, ''), document.baseURI).href;
