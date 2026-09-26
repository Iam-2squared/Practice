import { createHmac, randomBytes, scrypt as nativeScrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { AppError, invariant } from './domain.mjs';
const scrypt = promisify(nativeScrypt);
export const SESSION_SECONDS = 30 * 24 * 60 * 60;
export function hmac(secret, value) { return createHmac('sha256', secret).update(value).digest('hex'); }
export function digest(value) { return createHash('sha256').update(value).digest('hex'); }
export function passwordText(value) {
  invariant(typeof value === 'string', 'PASSWORD', 'パスワードを入力してください。');
  const password = value.normalize('NFKC');
  invariant(password.length >= 6 && password.length <= 128 && !/[\u0000-\u001f\u007f]/.test(password),
    'PASSWORD', 'パスワードは6〜128文字にしてください。');
  return password;
}
export async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  const key = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  return { salt, hash: key.toString('hex') };
}
export async function passwordMatches(password, record) {
  const { hash } = await passwordHash(password, record.salt);
  const left = Buffer.from(hash, 'hex'); const right = Buffer.from(record.hash, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}
export function randomToken() { return randomBytes(32).toString('base64url'); }
export function orderFingerprint(order) {
  return digest(JSON.stringify([order.symbol, order.side, order.quantity, order.quoteToken]));
}
export function signQuote(quote, secret, accountId, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ ...quote, accountId, expiresAt: now + 60_000 })).toString('base64url');
  return `${payload}.${hmac(secret, `quote:${payload}`)}`;
}
export function verifyQuote(token, secret, accountId, now = Date.now()) {
  invariant(typeof token === 'string' && token.length < 4096, 'QUOTE_TOKEN', '株価を更新してから注文してください。');
  const [payload, signature, extra] = token.split('.');
  invariant(payload && /^[a-f0-9]{64}$/.test(signature || '') && !extra, 'QUOTE_TOKEN', '株価の確認情報が正しくありません。');
  const expected = hmac(secret, `quote:${payload}`);
  invariant(timingSafeEqual(Buffer.from(signature), Buffer.from(expected)), 'QUOTE_TOKEN', '株価の確認情報が正しくありません。');
  let quote;
  try { quote = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { throw new AppError('QUOTE_TOKEN', '株価を再取得してください。'); }
  invariant(quote.accountId === accountId, 'QUOTE_TOKEN', 'この口座の株価情報ではありません。');
  invariant(Number.isFinite(quote.expiresAt) && quote.expiresAt > now, 'QUOTE_EXPIRED', '株価の確認期限が切れました。更新してから注文してください。', 409);
  return quote;
}
export function sessionCookie(token, secure, clear = false) {
  return `${secure ? '__Host-' : ''}practice_session=${clear ? '' : token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_SECONDS}${secure ? '; Secure' : ''}`;
}
export function readSession(request, secure) {
  const name = `${secure ? '__Host-' : ''}practice_session=`;
  const value = (request.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(name))?.slice(name.length);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
export function checkMutation(request, origin) {
  invariant(request.headers.get('origin') === origin, 'ORIGIN', '別のサイトからの操作は許可されていません。', 403);
  invariant(request.headers.get('content-type')?.split(';')[0] === 'application/json' && request.headers.get('x-practice-request') === '1',
    'CONTENT_TYPE', 'リクエスト形式が正しくありません。', 415);
}
export async function readBody(request) {
  invariant(Number(request.headers.get('content-length') || 0) <= 4096, 'BODY_SIZE', 'リクエストが大きすぎます。', 413);
  const reader = request.body?.getReader(); let size = 0; const chunks = [];
  if (reader) { while (true) { const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength; if (size > 4096) { await reader.cancel(); throw new AppError('BODY_SIZE', 'リクエストが大きすぎます。', 413); } chunks.push(Buffer.from(value));
  } }
  try { const body = JSON.parse(Buffer.concat(chunks).toString()); invariant(body && typeof body === 'object' && !Array.isArray(body), 'JSON', '入力形式が正しくありません。'); return body; }
  catch (error) { if (error instanceof AppError) throw error; throw new AppError('JSON', '入力形式が正しくありません。'); }
}
