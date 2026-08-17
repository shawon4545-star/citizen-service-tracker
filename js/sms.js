/* Client-side BulkSMSBD integration — no backend. The API key lives only in this browser's
   localStorage (kept outside DB.KEYS so a Drive pull/backup restore never touches it), which is a real
   trade-off: anyone with access to this logged-in browser could read it from Settings or the network
   tab. Acceptable for a small, login-gated business tool; not something to expose more broadly.

   Tries https:// first since the app is HTTPS-hosted and browsers block a plain http:// call from an
   HTTPS page outright (mixed content) — if BulkSMSBD doesn't actually support HTTPS, every send here
   will fail with a network error, which is a hard browser restriction, not something this code can
   work around. */

const BulkSms = (() => {
  const CONFIG_KEY = 'cst_sms_config';

  const CODES = {
    202: 'Sent',
    1001: 'Invalid Number',
    1002: 'Sender ID not correct/disabled',
    1003: 'Required field missing',
    1005: 'Internal Error',
    1006: 'Balance Validity Not Available',
    1007: 'Balance Insufficient',
    1011: 'User Id not found',
  };

  function getConfig() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function setConfig(patch) {
    const next = { ...getConfig(), ...patch };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    return next;
  }

  function isConfigured() {
    const c = getConfig();
    return Boolean(c.apiKey && c.senderId);
  }

  function normalizeBdPhone(raw) {
    let digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('880')) return digits;
    if (digits.startsWith('0')) return '880' + digits.slice(1);
    if (digits.length === 10) return '880' + digits;
    return digits;
  }

  async function sendOne(phone, message) {
    const { apiKey, senderId } = getConfig();
    const number = normalizeBdPhone(phone);
    const url = new URL('https://bulksmsbd.net/api/smsapi');
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('type', 'text');
    url.searchParams.set('number', number);
    url.searchParams.set('senderid', senderId);
    url.searchParams.set('message', message);

    try {
      const res = await fetch(url.toString());
      const body = (await res.text()).trim();
      const code = parseInt(body, 10);
      return { ok: code === 202, response: CODES[code] || body || `HTTP ${res.status}`, code: Number.isNaN(code) ? null : code };
    } catch (e) {
      return { ok: false, response: `Blocked or unreachable (${e.message}) — likely mixed-content or CORS restriction`, code: null };
    }
  }

  return { getConfig, setConfig, isConfigured, sendOne };
})();
