// Builds appium-mcp's REMOTE_SERVER_URL_ALLOW_REGEX from the configured
// remote_server_url. The model passes remoteServerUrl as a tool argument, so
// without this any https host could receive the device-cloud credentials
// from the capabilities file.

export const DENY_ALL = '^(?!)$';
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, (c) => `\\${c}`);
}

export function allowRegexFor(configured, warn = console.error) {
  const value = (configured || '').trim();
  if (!value || value.startsWith('${')) return DENY_ALL;
  let url;
  try {
    url = new URL(value);
  } catch {
    warn('[soma] remote_server_url is not a valid URL; remote sessions are disabled.');
    return DENY_ALL;
  }
  const secure = url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.has(url.hostname));
  if (!secure || url.username || url.password || url.search || url.hash) {
    warn('[soma] remote_server_url must be https:// (http:// only for localhost) with no credentials, query or fragment; remote sessions are disabled.');
    return DENY_ALL;
  }
  // Accept the setting exactly as the skills pass it, plus the trimmed form
  // with or without one trailing slash. Nothing else on that host matches.
  const base = value.replace(/\/+$/, '');
  const accepted = [...new Set([configured, base, `${base}/`])];
  return `^(?:${accepted.map(escapeRegex).join('|')})$`;
}
