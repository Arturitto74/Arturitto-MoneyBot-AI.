// Cloudflare Pages Function: generate a tracking link on demand, never expose credentials.
const API_URL = 'https://api2.webepartners.pl/Wydawca/CreateTrackingUrl';
const ALLOWED_SHOP = /(^|\.)diablochairs\.com$/i;
const ALLOWED_TRACKERS = new Set(['webep1.com','www.webep1.com','webepartners.pl','www.webepartners.pl']);
function basicAuth(login, key) {
  const bytes = new TextEncoder().encode(`${login}:${key}`);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return 'Basic ' + btoa(binary);
}
function failure(message, status=502) {
  return new Response(`MoneyBot: ${message}`, {status, headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
export async function onRequestGet({request,env}) {
  if (!env.WEBEPARTNERS_API_LOGIN || !env.WEBEPARTNERS_API_KEY) return failure('Brak konfiguracji API WebePartners.',503);
  const incoming = new URL(request.url).searchParams.get('url');
  if (!incoming || incoming.length > 2000) return failure('Nieprawidłowy adres produktu.',400);
  let product;
  try { product = new URL(incoming); } catch { return failure('Nieprawidłowy adres produktu.',400); }
  if (product.protocol !== 'https:' || !ALLOWED_SHOP.test(product.hostname) || product.username || product.password) return failure('Niedozwolony adres sklepu.',400);
  const endpoint = new URL(API_URL);
  endpoint.searchParams.set('url',product.href);
  try {
    const result = await fetch(endpoint.href, {headers:{Authorization:basicAuth(env.WEBEPARTNERS_API_LOGIN,env.WEBEPARTNERS_API_KEY),Accept:'text/plain'},redirect:'manual'});
    if (!result.ok) return failure(`WebePartners zwrócił HTTP ${result.status}.`);
    let raw = (await result.text()).trim();
    // Some REST implementations serialize a text response as a JSON string.
    if (raw.startsWith('"')) {try {raw = JSON.parse(raw)} catch {}}
    if (typeof raw !== 'string') return failure('API zwróciło nieoczekiwany format.');
    let tracking;
    try {tracking = new URL(raw)} catch {return failure('API nie zwróciło poprawnego adresu linku afiliacyjnego.')}
    if (tracking.protocol !== 'https:' || !ALLOWED_TRACKERS.has(tracking.hostname)) return failure('Nieznana domena linku afiliacyjnego — wymagana weryfikacja.');
    return new Response(null,{status:302,headers:{Location:tracking.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  } catch {return failure('Nie udało się połączyć z API WebePartners.')}
}
