// Read-only check of the public deployment. No passwords, cookies, user data or DB keys.
import assert from 'node:assert/strict';
const origin = 'https://practice-ashy-delta.vercel.app';
let last = 'not attempted';
for (let attempt = 1; attempt <= 20; attempt++) {
  try {
    const response = await fetch(`${origin}/api?action=config`, { signal: AbortSignal.timeout(10_000), cache: 'no-store', redirect: 'error' });
    assert.equal(response.status, 200, 'Public configuration is unavailable');
    const c = await response.json();
    assert.equal(c.version, '0.2.1', 'New deployment is not live yet');
    assert.equal(c.accountsAvailable, true, 'Production storage configuration is incomplete');
    assert.equal(c.storage, 'supabase');
    assert.equal(c.lotSize, 100); assert.equal(c.initialCashMinor, 10_000_000);
    assert.equal(c.publicOrigin, origin); assert.deepEqual(c.setupIssues, []);
    console.log(JSON.stringify({ result:'PASS', version:c.version, accountsAvailable:c.accountsAvailable, storage:c.storage,
      provider:c.provider, marketStatus:c.marketStatus, lotSize:c.lotSize, origin, note:'Configuration-only; not a DB transaction or live-price test.' }));
    process.exit(0);
  } catch (error) {
    // Log only assertions controlled by this script, never external response bodies.
    last = error instanceof assert.AssertionError ? error.message.split('\n')[0] : 'Public endpoint request failed';
    console.log(`Attempt ${attempt}/20: ${last}`);
    if (attempt < 20) await new Promise(r => setTimeout(r, 15_000));
  }
}
console.error(`Public deployment smoke FAILED: ${last}`);
process.exit(1);
