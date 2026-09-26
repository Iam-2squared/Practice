import { randomUUID } from 'node:crypto';
import { normalizeSupabaseUrl } from './config.mjs';
import { initialState, AppError, invariant } from './domain.mjs';
/** Local/test adapter; explicitly forbidden by configuration on Vercel. */
export class MemoryStore {
  constructor(data = null) {
    this.data = data || { accounts: {}, sessions: {}, buckets: {} }; this.tail = Promise.resolve();
  }
  async transaction(callback) {
    const task = this.tail.then(async () => {
      const before = structuredClone(this.data);
      try { const value = await callback(); await this.persist(); return structuredClone(value); }
      catch (error) { this.data = before; throw error; }
    });
    this.tail = task.catch(() => {}); return task;
  }
  async persist() {}
  async register(credential, market, username) {
    return this.transaction(() => {
      invariant(!Object.values(this.data.accounts).some(a => a.lookup === credential.lookup), 'PASSWORD_UNAVAILABLE', 'このパスワードは使えません。別のものを作成してください。', 409);
      invariant(!Object.values(this.data.accounts).some(a => String(a.username||'').toLowerCase() === username.toLowerCase()), 'USERNAME_UNAVAILABLE', 'このユーザーネームは使われています。', 409);
      const account = { id: randomUUID(), ...credential, username, market, state: initialState(), createdAt: Date.now(), trades: [] };
      this.data.accounts[account.id] = account; return { id: account.id, username: account.username, market: account.market, state: account.state, createdAt: account.createdAt };
    });
  }
  async findCredential(lookup) { await this.tail; return structuredClone(Object.values(this.data.accounts).find(a => a.lookup === lookup) || null); }
  async getAccount(id) { await this.tail; const a = this.data.accounts[id]; return a ? { id: a.id, username: a.username || `user_${a.id.slice(0,8)}`, market: a.market, state: structuredClone(a.state), createdAt: a.createdAt } : null; }
  async updateUsername(id, username) {
    return this.transaction(() => {
      invariant(!Object.values(this.data.accounts).some(a => a.id !== id && String(a.username||'').toLowerCase() === username.toLowerCase()), 'USERNAME_UNAVAILABLE', 'このユーザーネームは使われています。', 409);
      invariant(this.data.accounts[id], 'AUTH', 'ログインしてください。', 401);
      this.data.accounts[id].username = username; const a=this.data.accounts[id]; return { id:a.id, username:a.username || `user_${a.id.slice(0,8)}`, market:a.market, state:structuredClone(a.state), createdAt:a.createdAt };
    });
  }
  async leaderboardAccounts() { await this.tail; return Object.values(this.data.accounts).map(a => ({ id:a.id, username:a.username, market:a.market, state:structuredClone(a.state) })); }
  async newSession(hash, accountId, expiresAt) {
    return this.transaction(() => {
      const now = Date.now(); for (const [key, value] of Object.entries(this.data.sessions)) if (value.expiresAt < now) delete this.data.sessions[key];
      this.data.sessions[hash] = { accountId, expiresAt }; return true;
    });
  }
  async sessionAccount(hash, now) { await this.tail; const s = this.data.sessions[hash]; return s && s.expiresAt > now ? this.getAccount(s.accountId) : null; }
  async logout(hash) { return this.transaction(() => { delete this.data.sessions[hash]; return true; }); }
  async deleteAccount(accountId) {
    return this.transaction(() => {
      for (const [key, session] of Object.entries(this.data.sessions)) if (session.accountId === accountId) delete this.data.sessions[key];
      delete this.data.accounts[accountId]; return true;
    });
  }
  async getTrade(accountId, requestId) { await this.tail; return structuredClone(this.data.accounts[accountId]?.trades.find(t => t.requestId === requestId) || null); }
  async history(accountId, offset = 0, limit = 50) {
    await this.tail; const all = [...(this.data.accounts[accountId]?.trades || [])].reverse();
    return { items: structuredClone(all.slice(offset, offset + limit)), hasMore: all.length > offset + limit };
  }
  async commit(accountId, expectedVersion, state, trade, fingerprint) {
    return this.transaction(() => {
      const a = this.data.accounts[accountId]; invariant(a, 'AUTH', 'ログインしてください。', 401);
      const prior = a.trades.find(t => t.requestId === trade.requestId);
      if (prior) { invariant(prior.fingerprint === fingerprint, 'IDEMPOTENCY_CONFLICT', '同じ注文番号で別の注文は送信できません。', 409); return { duplicate: true, state: a.state, trade: prior }; }
      if (a.state.version !== expectedVersion) return { conflict: true };
      a.state = state; const saved = { ...trade, fingerprint }; a.trades.push(saved); return { state, trade: saved, duplicate: false };
    });
  }
  async rate(key, limit, windowMs, now) {
    return this.transaction(() => {
      const bucket = Math.floor(now / windowMs); const b = this.data.buckets[key];
      if (!b || b.bucket !== bucket) this.data.buckets[key] = { bucket, count: 1, expires: now + windowMs };
      else b.count += 1;
      for (const [k, v] of Object.entries(this.data.buckets)) if (v.expires < now) delete this.data.buckets[k];
      return this.data.buckets[key].count <= limit;
    });
  }
}
/** Supabase REST is called ONLY from the server with a non-public secret/service-role key. */
export class SupabaseStore {
  constructor(url, key, fetcher = fetch) {
    url = normalizeSupabaseUrl(url);
    invariant(url, 'CONFIG', 'データベースの接続設定を確認してください。', 503);
    this.url = `${url}/rest/v1`; this.key = key; this.fetcher = fetcher;
  }
  async request(path, method = 'GET', body, prefer = 'return=representation') {
    let r;
    try { r = await this.fetcher(`${this.url}/${path}`, { method, headers: { apikey: this.key, ...(this.key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${this.key}` }), 'Content-Type': 'application/json', Prefer: prefer }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(8000) }); }
    catch { throw new AppError('DB_UNAVAILABLE', '口座に接続できません。再試行しても同じ注文は重複しません。', 503); }
    const text = await r.text(); let data;
    try { data = text ? JSON.parse(text) : null; } catch { throw new AppError('DB_UNAVAILABLE', '口座の応答を確認できません。', 503); }
    if (!r.ok) {
      if (data?.code === '23505' && /username/i.test(String(data?.message || data?.details || ''))) throw new AppError('USERNAME_UNAVAILABLE', 'このユーザーネームは使われています。', 409);
      if (data?.code === '23505') throw new AppError('PASSWORD_UNAVAILABLE', 'このパスワードは使えません。別のものを作成してください。', 409);
      throw new AppError('DB_UNAVAILABLE', '口座に接続できません。接続設定をご確認ください。', 503);
    }
    return data;
  }
  account(row) { return row ? { id: row.id, username: row.username, state: row.state, market: row.market, createdAt: Date.parse(row.created_at) } : null; }
  async register(credential, market, username) {
    const rows = await this.request('practice_accounts', 'POST', { lookup: credential.lookup, salt: credential.salt, password_hash: credential.hash, username, market, state: initialState() });
    return this.account(rows[0]);
  }
  async findCredential(lookup) {
    const [r] = await this.request(`practice_accounts?lookup=eq.${encodeURIComponent(lookup)}&select=id,salt,password_hash&limit=1`);
    return r ? { id: r.id, salt: r.salt, hash: r.password_hash } : null;
  }
  async getAccount(id) { const [r] = await this.request(`practice_accounts?id=eq.${encodeURIComponent(id)}&select=id,username,state,market,created_at&limit=1`); return this.account(r); }
  async updateUsername(id, username) {
    const rows = await this.request(`practice_accounts?id=eq.${encodeURIComponent(id)}`, 'PATCH', { username });
    return this.account(rows[0]);
  }
  async leaderboardAccounts() {
    const rows = await this.request('practice_accounts?select=id,username,market,state&order=created_at.asc');
    return rows.map(r => ({ id:r.id, username:r.username, market:r.market, state:r.state }));
  }
  async newSession(hash, accountId, expiresAt) {
    await this.request('practice_sessions', 'POST', { token_hash: hash, account_id: accountId, expires_at: new Date(expiresAt).toISOString() });
    // Expired sessions are inert; cleanup is best-effort and never causes login to fail.
    await this.request(`practice_sessions?expires_at=lt.${encodeURIComponent(new Date().toISOString())}`, 'DELETE', undefined, 'return=minimal').catch(() => {});
  }
  async sessionAccount(hash, now) {
    const [r] = await this.request(`practice_sessions?token_hash=eq.${hash}&expires_at=gt.${encodeURIComponent(new Date(now).toISOString())}&select=account_id&limit=1`);
    return r ? this.getAccount(r.account_id) : null;
  }
  async logout(hash) { await this.request(`practice_sessions?token_hash=eq.${hash}`, 'DELETE', undefined, 'return=minimal'); }
  async deleteAccount(accountId) {
    // Foreign keys atomically cascade to ALL sessions and trades; there are no reusable JWTs.
    await this.request(`practice_accounts?id=eq.${encodeURIComponent(accountId)}`, 'DELETE', undefined, 'return=minimal');
  }
  async getTrade(accountId, requestId) {
    const [r] = await this.request(`practice_trades?account_id=eq.${encodeURIComponent(accountId)}&request_id=eq.${encodeURIComponent(requestId)}&select=trade,fingerprint&limit=1`);
    return r ? { ...r.trade, fingerprint: r.fingerprint } : null;
  }
  async history(accountId, offset = 0, limit = 50) {
    const rows = await this.request(`practice_trades?account_id=eq.${encodeURIComponent(accountId)}&select=trade&order=sequence.desc&offset=${offset}&limit=${limit + 1}`);
    return { items: rows.slice(0,limit).map(r => r.trade), hasMore: rows.length > limit };
  }
  async commit(accountId, expectedVersion, state, trade, fingerprint) {
    const result = await this.request('rpc/practice_commit_trade', 'POST', { p_account_id: accountId, p_expected_version: expectedVersion, p_state: state, p_trade: trade, p_fingerprint: fingerprint });
    invariant(!result.idempotencyConflict, 'IDEMPOTENCY_CONFLICT', '同じ注文番号で別の注文は送信できません。', 409);
    return result;
  }
  async rate(key, limit, windowMs, now) {
    return this.request('rpc/practice_rate_limit', 'POST', { p_key: key, p_limit: limit, p_window_ms: windowMs, p_now_ms: now });
  }
}
