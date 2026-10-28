// MoneyBot v1.2.1: existing affiliate links in the XML are used directly.
// Direct shop URLs can still be converted using the official API.
const API_URL = 'https://api2.webepartners.pl/Wydawca/CreateTrackingUrl';
const ALLOWED_SHOP = /(^|\.)diablochairs\.com$/i;
const TRACKER_HOSTS = new Set(['webep1.com', 'www.webep1.com']);
function fail(message, status=400) {
  return new Response(`MoneyBot: ${message}`, {status, headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
function allowedShop(url) {
  return url.protocol === 'https:' && ALLOWED_SHOP.test(url.hostname) && !url.username && !url.password;
}
function decodeRedirect(encoded) {
  try {
    if (!encoded || encoded.length > 3000 || !/^[A-Za-z0-9_-]+={0,2}$/.test(encoded)) return null;
    const padded = encoded.replace(/-/g,'+').replace(/_/g,'/');
    const decoded = atob(padded + '='.repeat((4 - padded.length % 4) % 4));
    return new URL(decoded);
  } catch { return null; }
}
function basicAuth(login,key) {
  const bytes = new TextEncoder().encode(`${login}:${key}`);
  let s=''; for (const b of bytes) s+=String.fromCharCode(b);
  return 'Basic '+btoa(s);
}
export async function onRequestGet({request,env}) {
  const incoming = new URL(request.url).searchParams.get('url');
  if (!incoming || incoming.length > 4000) return fail('Nieprawidłowy adres produktu.');
  let target;
  try { target = new URL(incoming); } catch { return fail('Nieprawidłowy adres produktu.'); }
  if (target.protocol !== 'https:' || target.username || target.password) return fail('Niedozwolony adres.');

  // The XML already contains WebePartners tracking URLs. Do not wrap them in another tracking link.
  if (TRACKER_HOSTS.has(target.hostname)) {
    if (!/^\/c\/\d+\/[A-Za-z0-9]+\/?$/.test(target.pathname)) return fail('Nieznana ścieżka linku partnerskiego.');
    const destination = decodeRedirect(target.searchParams.get('r'));
    if (!destination || !allowedShop(destination)) return fail('Niezweryfikowany adres docelowy linku.');
    return new Response(null, {status:302,headers:{Location:target.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  }

  if (!allowedShop(target)) return fail('Niedozwolony adres sklepu.');
  if (!env.WEBEPARTNERS_API_LOGIN || !env.WEBEPARTNERS_API_KEY) return fail('Brak konfiguracji API WebePartners.',503);
  const endpoint = new URL(API_URL);
  endpoint.searchParams.set('url',target.href);
  try {
    const response = await fetch(endpoint.href,{headers:{Authorization:basicAuth(env.WEBEPARTNERS_API_LOGIN,env.WEBEPARTNERS_API_KEY),Accept:'text/plain'},redirect:'manual'});
    if (!response.ok) return fail(`WebePartners zwrócił HTTP ${response.status}.`,502);
    let raw = (await response.text()).trim();
    if (raw.startsWith('"')) {try {raw=JSON.parse(raw);}catch {}}
    let link; try {link=new URL(raw);} catch {return fail('API nie zwróciło poprawnego linku.',502);}
    if (link.protocol !== 'https:' || !TRACKER_HOSTS.has(link.hostname)) return fail('Niezweryfikowana domena linku.',502);
    return new Response(null,{status:302,headers:{Location:link.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  } catch {return fail('Nie udało się połączyć z API WebePartners.',502);}
}
