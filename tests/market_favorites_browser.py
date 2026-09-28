"""Real HTTP/Cookie UI integration against localhost fixtures. Never production."""
import json, re, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
BASE='http://localhost:3000'
OUT=Path('test-results'); OUT.mkdir(exist_ok=True)
KEY='practice.market-favorites.v1'
CRYPTO=['BTC','ETH','SOL','XRP','BNB','ADA','DOGE','AVAX','LINK','LTC']
FX=['USDJPY','EURJPY','GBPJPY','AUDJPY','CADJPY','CHFJPY','NZDJPY']
def markets(page,kind):
    page.locator('[data-tab=market]').click()
    if page.locator('[data-market='+kind+']').get_attribute('aria-pressed')!='true':
        page.locator('[data-market='+kind+']').click()
    expect(page.locator('.favorite-toggle')).to_have_count(10 if kind=='crypto' else 7)
def symbols(page):
    return page.locator('#search-results .stock-row').evaluate_all('(els)=>els.map(e=>e.dataset.symbol)')
def star(page,symbol):
    return page.locator('[data-favorite-symbol='+symbol+']')
def first(page,symbol):
    expect(page.locator('#search-results .stock-row').first).to_have_attribute('data-symbol',symbol)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    errors=[]; reports=[]
    for language in ['ja','en']:
        ctx=browser.new_context(viewport={'width':390,'height':844},locale='ja-JP' if language=='ja' else 'en-US')
        response=ctx.request.post(BASE+'/api/index?action=register',headers={'Origin':BASE,'X-Practice-Request':'1','X-Practice-Language':language},data={'username':'fav_'+uuid.uuid4().hex[:8],'password':'fixture-favorites-'+uuid.uuid4().hex})
        assert response.status==200,response.text()
        original=response.json()['account']; cookies=ctx.cookies()
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE+'/'+language+'/app.html',wait_until='networkidle');markets(page,'crypto')
        assert symbols(page)==CRYPTO
        calls=[];page.on('request',lambda r:calls.append(r.url) if re.search(r'action=(quote|trade|price-history)(?:&|$)',r.url) else None)
        star(page,'LTC').click();first(page,'LTC');expect(star(page,'LTC')).to_have_attribute('aria-pressed','true');expect(page.locator('#dialog')).not_to_be_visible()
        star(page,'BNB').click();first(page,'BNB');assert symbols(page)[:2]==['BNB','LTC']
        star(page,'BNB').focus();page.keyboard.press('Space');first(page,'LTC');expect(star(page,'BNB')).to_be_focused()
        page.locator('#search').fill('ETH');expect(page.locator('.stock-row')).to_have_count(1);first(page,'ETH')
        page.locator('#search').fill('');expect(page.locator('.favorite-toggle')).to_have_count(10);first(page,'LTC')
        page.locator('[data-action=refresh]').click();expect(page.locator('.favorite-toggle')).to_have_count(10);first(page,'LTC')
        markets(page,'fx');assert symbols(page)==FX;star(page,'NZDJPY').click();first(page,'NZDJPY')
        for width in [320,390,768,1280]:
            page.set_viewport_size({'width':width,'height':844})
            for kind in ['crypto','fx']:
                markets(page,kind)
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(language,width,kind)
                assert page.locator('button button').count()==0
                for button in page.locator('.favorite-toggle').all():
                    box=button.bounding_box();assert box['width']>=44 and box['height']>=44,box
                if width in [320,390]:page.screenshot(path=str(OUT/f'favorites-{language}-{kind}-{width}.png'),full_page=True)
                if language=='en':assert not re.search('[\u3040-\u30ff\u4e00-\u9fff]',page.locator('#main').inner_text())
        assert calls==[],calls
        current=ctx.request.get(BASE+'/api/index?action=session').json()['account'];assert current['state']==original['state']
        page.reload(wait_until='networkidle');markets(page,'crypto');first(page,'LTC');markets(page,'fx');first(page,'NZDJPY')
        other='en' if language=='ja' else 'ja';page.locator('#practice-language').select_option(other);expect(page).to_have_url(re.compile('/'+other+'/app.html'));markets(page,'crypto');first(page,'LTC');markets(page,'fx');first(page,'NZDJPY')
        tab=ctx.new_page();tab.goto(BASE+'/'+other+'/app.html',wait_until='networkidle');markets(tab,'crypto');star(tab,'ADA').click();markets(page,'crypto');first(page,'ADA');star(tab,'ADA').click();first(page,'LTC')
        tab.evaluate('(key)=>localStorage.removeItem(key)',KEY);first(page,'BTC');tab.close()
        # Corrupt storage is ignored instead of preventing application startup.
        page.evaluate('(key)=>localStorage.setItem(key,"{broken")',KEY);page.reload(wait_until='networkidle');markets(page,'crypto');assert symbols(page)==CRYPTO
        # Storage refusal still permits stars and reports that they are temporary.
        blocked=browser.new_context(viewport={'width':320,'height':844});blocked.add_cookies(cookies)
        blocked.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw Error('blocked')}})")
        bp=blocked.new_page();bp.on('pageerror',lambda e:errors.append(str(e)));bp.goto(BASE+'/'+language+'/app.html',wait_until='networkidle');markets(bp,'crypto');star(bp,'DOGE').click();first(bp,'DOGE');expect(bp.locator('.favorites-hint')).to_contain_text('閉じるまで' if language=='ja' else 'until this page is closed')
        expect(bp.locator('#dialog')).not_to_be_visible();blocked.close()
        # New instruments open real detail routes, translated comments and execute
        # a virtual round-trip using the original signed-price/order controls.
        page.goto(BASE+'/'+language+'/app.html',wait_until='networkidle')
        for kind,symbol,name in [('crypto','BNB','BNB'),('fx','CADJPY','カナダドル / 円' if language=='ja' else 'Canadian Dollar / JPY')]:
            for side in ['buy','sell']:
                markets(page,kind);page.locator('.stock-row[data-symbol='+symbol+']').click()
                expect(page.locator('.chart-plot')).to_be_visible(timeout=15000)
                if language=='en':assert not re.search('[\u3040-\u30ff\u4e00-\u9fff]',page.locator('#dialog').inner_text())
                if side=='sell':page.locator('[data-side=sell]').click()
                page.locator('#quantity').fill('0.001' if kind=='crypto' else '1');page.locator('#order-next').click();page.locator('#submit-order').click();expect(page.locator('#dialog')).not_to_be_visible(timeout=15000)
        final=ctx.request.get(BASE+'/api/index?action=session').json()['account'];assert final['state']['positions']==[];assert final['state']['cashMinor']<=original['state']['cashMinor']
        assert len(ctx.request.get(BASE+'/api/index?action=history').json()['items'])==4
        reports.append({'language':language,'crypto':10,'fx':7,'starToggleAndStableOrder':'PASS','searchAndMarketIsolation':'PASS','keyboardAndFocus':'PASS','reloadAndLanguagePersistence':'PASS','crossTabAndClear':'PASS','blockedAndCorruptStorage':'PASS','starNetworkCalls':0,'newAssetRoundTrips':2,'viewports':[320,390,768,1280]})
        ctx.close()
    assert not errors,errors
    report={'result':'PASS','environment':'isolated localhost HTTP fixtures; no production accounts or live provider calls','journeys':reports,'uncaughtErrors':errors}
    (OUT/'market-favorites-result.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
    browser.close()
