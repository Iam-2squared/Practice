import { AppError, invariant, executeTrade, validateOrder, normalizeSymbol, QUANTITY_SCALE } from './domain.mjs';
import { passwordText, passwordHash, passwordMatches, hmac, digest, randomToken, orderFingerprint, signQuote, verifyQuote, sessionCookie, readSession, checkMutation, readBody, SESSION_SECONDS } from './security.mjs';
import { createMarket } from './market.mjs';
const dummyRecord = { salt: '0'.repeat(32), hash: '0'.repeat(128) };
const publicTrade = trade => { const { fingerprint, ...safe } = trade; return safe; };
function usernameText(value) {
  const username = String(value ?? '').normalize('NFKC').trim();
  invariant(username.length >= 2 && username.length <= 20 && !/[<>\u0000-\u001f\u007f]/.test(username), 'USERNAME', 'ユーザーネームは2〜20文字で入力してください。');
  return username;
}
export function createApp({ store = null, market, secret, quoteSecret = secret, origin, secure = true, storageName = 'supabase', clock = Date.now, setupIssues = [] }) {
  const accountMarket = () => market;
  const response = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
  async function limited(key, limit, windowMs = 60_000) {
    invariant(await store.rate(hmac(secret, `rate:${key}`), limit, windowMs, clock()), 'RATE_LIMIT', '操作が続いています。少し時間をおいてください。', 429);
  }
  return async function handle(request) {
    try {
      const url = new URL(request.url); const action = url.searchParams.get('action') || 'config';
      invariant(['GET','POST'].includes(request.method), 'METHOD', 'この操作には対応していません。', 405);
      if (request.method === 'GET' && action === 'config') return response({ provider: market.provider, accountsAvailable: !!(store && secret), storage: store ? storageName : 'unconfigured', initialCashMinor: 10_000_000, quantityScale: QUANTITY_SCALE, version: '0.4.0', marketStatus: market.status?.() || 'unknown', publicOrigin: origin || null, setupIssues: store ? [] : setupIssues.filter(x => ['PRACTICE_STORE','SUPABASE_URL','SUPABASE_SECRET_KEY','APP_SECRET','APP_ORIGIN','DATABASE_INITIALIZATION'].includes(x)) });
      invariant(store && secret, 'SETUP_REQUIRED', '口座保存の接続準備中です。管理者がデータベースを設定すると利用できます。', 503);
      const client = secure ? (request.headers.get('x-vercel-forwarded-for') || 'shared') : 'local';
      if (request.method === 'POST') checkMutation(request, origin);
      const token = readSession(request, secure); const sessionHash = token ? digest(token) : null;
      if (request.method === 'POST' && (action === 'register' || action === 'login')) {
        await limited(`auth:${client}`, 10, 15 * 60_000);
        await limited('auth-global', 200, 60_000);
        const body = await readBody(request); const password = passwordText(body.password);
        const lookup = hmac(secret, `account:${password}`); let account;
        if (action === 'register') {
          market.assertReady?.();
          const username = usernameText(body.username ?? `user_${lookup.slice(0,8)}`);
          const credentials = await passwordHash(password); account = await store.register({ ...credentials, lookup }, 'multi', username);
        } else {
          const credential = await store.findCredential(lookup);
          const matches = await passwordMatches(password, credential || dummyRecord);
          invariant(credential && matches, 'LOGIN', 'パスワードを確認してください。', 401);
          account = await store.getAccount(credential.id);
        }
        const newToken = randomToken();
        await store.newSession(digest(newToken), account.id, clock() + SESSION_SECONDS * 1000);
        return response({ account }, 200, { 'Set-Cookie': sessionCookie(newToken, secure) });
      }
      if (request.method === 'POST' && action === 'logout') {
        await readBody(request); if (sessionHash) await store.logout(sessionHash);
        return response({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', secure, true) });
      }
      const account = sessionHash ? await store.sessionAccount(sessionHash, clock()) : null;
      if (request.method === 'GET' && action === 'session') return response({ account });
      invariant(account, 'AUTH', 'パスワードでログインしてください。', 401);
      await limited(`account:${account.id}`, 120);
      if (request.method === 'POST' && action === 'username') {
        const body = await readBody(request);
        const updated = await store.updateUsername(account.id, usernameText(body.username));
        return response({ account: updated });
      }
      if (request.method === 'GET' && action === 'leaderboard') {
        await limited('leaderboard-global', 120);
        const accounts = await store.leaderboardAccounts();
        const rows = [];
        for (const entry of accounts) {
          const selected = accountMarket(entry); const quotes = {}; let totalMinor = entry.state.cashMinor; let complete = true;
          for (let i = 0; i < entry.state.positions.length; i += 5) {
            await Promise.all(entry.state.positions.slice(i,i+5).map(async p => {
              try { quotes[p.symbol] = await selected.quote(p.symbol); } catch { complete = false; }
            }));
          }
          if (complete) for (const p of entry.state.positions) totalMinor += Math.round(quotes[p.symbol].priceMinor * p.quantity / QUANTITY_SCALE);
          rows.push({ username: entry.username, totalMinor: complete ? totalMinor : null, me: entry.id === account.id });
        }
        rows.sort((a,b) => b.totalMinor == null ? (a.totalMinor == null ? a.username.localeCompare(b.username,'ja') : -1) : a.totalMinor == null ? 1 : b.totalMinor-a.totalMinor || a.username.localeCompare(b.username,'ja'));
        return response({ items: rows.map((row,index) => ({ ...row, rank: row.totalMinor == null ? null : index + 1 })) });
      }
      if (request.method === 'POST' && action === 'delete-account') {
        await limited(`delete:${account.id}`, 5, 15 * 60_000);
        const body = await readBody(request);
        invariant(body.confirm === 'DELETE', 'CONFIRM_DELETE', '削除の確認が必要です。');
        const password = passwordText(body.password);
        const credential = await store.findCredential(hmac(secret, `account:${password}`));
        const matches = await passwordMatches(password, credential || dummyRecord);
        invariant(credential?.id === account.id && matches, 'LOGIN', 'パスワードを確認してください。', 401);
        await store.deleteAccount(account.id);
        return response({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', secure, true) });
      }
      const selectedMarket = accountMarket(account); // An old demo account never turns into a live-price account.
      if (request.method === 'GET' && action === 'search') return response({ items: await selectedMarket.search(url.searchParams.get('q') || '', url.searchParams.get('type') || 'all') });
      if (request.method === 'GET' && action === 'quote') {
        const quote = await selectedMarket.quote(normalizeSymbol(url.searchParams.get('symbol')));
        return response({ quote, quoteToken: signQuote(quote, quoteSecret, account.id, clock()) });
      }
      if (request.method === 'GET' && action === 'portfolio') {
        // Limit simultaneous upstream requests. Failed valuations remain unknown, NEVER zero or fabricated.
        const quotes = {}; const errors = [];
        for (let i = 0; i < account.state.positions.length; i += 5) {
          await Promise.all(account.state.positions.slice(i,i+5).map(async p => {
            try { quotes[p.symbol] = await selectedMarket.quote(p.symbol); } catch { errors.push(p.symbol); }
          }));
        }
        const complete = errors.length === 0;
        const holdingsMinor = complete ? account.state.positions.reduce((n,p) => n + Math.round(quotes[p.symbol].priceMinor * p.quantity / QUANTITY_SCALE), 0) : null;
        return response({ account, quotes, valuationComplete: complete, unavailableSymbols: errors,
          holdingsMinor, totalMinor: complete ? account.state.cashMinor + holdingsMinor : null });
      }
      if (request.method === 'GET' && action === 'history') {
        const offset = Number(url.searchParams.get('offset') || 0);
        invariant(Number.isSafeInteger(offset) && offset >= 0 && offset <= 1_000_000, 'OFFSET', '履歴の位置が正しくありません。');
        const result = await store.history(account.id, offset); return response({ ...result, items: result.items.map(publicTrade) });
      }
      if (request.method === 'POST' && action === 'trade') {
        await limited(`trade:${account.id}`, 20);
        const body = await readBody(request); validateOrder(body); const fingerprint = orderFingerprint(body);
        const existing = await store.getTrade(account.id, body.requestId);
        if (existing) {
          invariant(existing.fingerprint === fingerprint, 'IDEMPOTENCY_CONFLICT', '同じ注文番号で別の注文は送信できません。', 409);
          return response({ duplicate: true, trade: publicTrade(existing), account: await store.getAccount(account.id) });
        }
        selectedMarket.assertReady?.();
        const quote = verifyQuote(body.quoteToken, quoteSecret, account.id, clock());
        invariant(['coingecko','frankfurter'].includes(quote.source), 'QUOTE', '価格モードが異なります。');
        for (let attempt = 0; attempt < 4; attempt++) {
          const latest = await store.getAccount(account.id);
          const replay = await store.getTrade(account.id, body.requestId);
          if (replay) {
            invariant(replay.fingerprint === fingerprint, 'IDEMPOTENCY_CONFLICT', '同じ注文番号で別の注文は送信できません。', 409);
            return response({ duplicate: true, trade: publicTrade(replay), account: await store.getAccount(account.id) });
          }
          const next = executeTrade(latest.state, body, quote, clock());
          const committed = await store.commit(account.id, latest.state.version, next.state, next.trade, fingerprint);
          if (committed.conflict) continue;
          return response({ duplicate: committed.duplicate, trade: publicTrade(committed.trade), account: { ...latest, state: committed.state } });
        }
        throw new AppError('CONCURRENT_ORDER', 'ほかの注文が処理中です。同じ注文を再試行してください。', 409);
      }
      throw new AppError('NOT_FOUND', '操作が見つかりません。', 404);
    } catch (error) {
      if (error instanceof AppError) return response({ error: { code: error.code, message: error.message } }, error.status,
        error.status === 429 ? { 'Retry-After': '60' } : {});
      // Never log credentials, cookies, user payloads, or raw upstream errors.
      console.error('practice_unexpected_error');
      return response({ error: { code: 'INTERNAL', message: '処理を完了できませんでした。再試行してください。' } }, 500);
    }
  };
}
