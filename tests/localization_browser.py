"""Bilingual real-HTTP journeys against isolated local price fixtures only."""
import json, re, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
OUT=Path('test-results'); OUT.mkdir(exist_ok=True)
BASE='http://localhost:3000'
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    for country,locale,expected in [('JP','en-US','ja'),('US','ja-JP','en'),('GB','ja-JP','en'),('XX','ja-JP','ja'),('XX','fr-FR','en')]:
        ctx=browser.new_context(locale=locale,extra_http_headers={'x-test-country':country})
        page=ctx.new_page(); page.goto(BASE+'/',wait_until='networkidle')
        expect(page).to_have_url(re.compile('/'+expected+'/index.html'))
        expect(page.locator('html')).to_have_attribute('lang',expected)
        ctx.close()
    ctx=browser.new_context(locale='en-US',extra_http_headers={'x-test-country':'US'})
    page=ctx.new_page();page.goto(BASE+'/',wait_until='networkidle')
    page.locator('#practice-language').select_option('ja');expect(page).to_have_url(re.compile('/ja/index.html'))
    page.goto(BASE+'/',wait_until='networkidle');expect(page).to_have_url(re.compile('/ja/index.html'))
    page.locator('#practice-language').select_option('en');expect(page).to_have_url(re.compile('/en/index.html'))
    ctx.set_extra_http_headers({'x-test-country':'JP'});page.goto(BASE+'/',wait_until='networkidle');expect(page).to_have_url(re.compile('/en/index.html'))
    ctx.close()
    ctx=browser.new_context(locale='ja-JP',extra_http_headers={'x-test-country':'XX'})
    page=ctx.new_page();page.route('**/api/index?action=locale',lambda route:route.abort())
    page.goto(BASE+'/',wait_until='networkidle');expect(page).to_have_url(re.compile('/ja/index.html'))
    ctx.close()
    ctx=browser.new_context(locale='en-US',extra_http_headers={'x-test-country':'JP'})
    ctx.add_init_script("Object.defineProperty(Storage.prototype,'getItem',{value(){throw Error('storage blocked')}});Object.defineProperty(Storage.prototype,'setItem',{value(){throw Error('storage blocked')}});")
    page=ctx.new_page();page.goto(BASE+'/en/index.html',wait_until='networkidle')
    page.locator('#practice-language').select_option('ja');expect(page).to_have_url(re.compile('/ja/index.html'))
    page.locator('a.landing-primary').first.click();expect(page).to_have_url(re.compile('/ja/app.html'))
    ctx.close()
    ctx=browser.new_context(locale='en-US',viewport={'width':390,'height':844},extra_http_headers={'x-test-country':'US'})
    ctx.add_init_script("Object.defineProperty(navigator,'share',{value:async(data)=>{window.__shared=data;}});")
    page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE+'/app.html',wait_until='networkidle')
    expect(page).to_have_url(re.compile('/en/app.html'))
    assert page.locator('.bottom-nav button').all_text_contents()==['Portfolio','Markets','Challenges','Rankings','Account']
    page.get_by_role('button',name='Create a practice account',exact=False).click()
    name='売却'+uuid.uuid4().hex[:6];password='en-fixture-'+uuid.uuid4().hex
    page.locator('[name=username]').fill(name);page.locator('#password').fill(password);page.locator('[name=confirmation]').fill(password);page.locator('[name=saved]').check();page.locator('#auth-form [type=submit]').click()
    expect(page.locator('#dialog')).not_to_be_visible(timeout=15000)
    def call(action,body=None):
        return page.evaluate("""async({action,body})=>{const r=await fetch('/api/index?action='+action,{method:body===null?'GET':'POST',headers:{'Content-Type':'application/json','X-Practice-Request':'1','X-Practice-Language':'en'},...(body===null?{}:{body:JSON.stringify(body)})});return {status:r.status,...await r.json()};}""",{'action':action,'body':body})
    def open_market(kind,symbol):
        page.locator('[data-tab=market]').click();page.locator('[data-market='+kind+']').click();page.locator('[data-symbol='+symbol+']').click();expect(page.locator('#quantity')).to_be_visible();expect(page.locator('.chart-plot')).to_be_visible(timeout=15000)
    def trade(kind,symbol,quantity,side='buy'):
        open_market(kind,symbol)
        if side=='sell':page.locator('[data-side=sell]').click()
        page.locator('#quantity').fill(quantity)
        assert not re.search('[\u3040-\u30ff\u4e00-\u9fff]',page.locator('#dialog').inner_text())
        page.locator('#order-next').click();expect(page.locator('#dialog')).to_contain_text('No real money')
        page.locator('#submit-order').click();expect(page.locator('#dialog')).not_to_be_visible(timeout=15000)
    # English names are searchable without changing the stored asset identifiers.
    page.locator('[data-tab=market]').click();page.locator('[data-market=fx]').click();page.locator('#search').fill('Dollar');expect(page.locator('#search-results .stock-row')).to_have_count(2)
    open_market('fx','USDJPY');page.locator('#quantity').fill('2')
    page.evaluate("const s=document.querySelector('#practice-language');s.value='ja';s.dispatchEvent(new Event('change',{bubbles:true}));")
    assert '/en/app.html' in page.url;expect(page.locator('#quantity')).to_have_value('2');page.locator('[data-action=close]').click()
    for _ in range(3):trade('fx','USDJPY','1')
    for _ in range(3):trade('crypto','BTC','0.001')
    trade('crypto','BTC','0.001','sell')
    page.locator('[data-tab=challenges]').click();expect(page.locator('#main .mission-row.complete')).to_have_count(5)
    expect(page.locator('#main .achievement-tile')).to_have_count(6);expect(page.locator('#main')).to_contain_text('Beginner missions')
    assert not re.search('[\u3040-\u30ff\u4e00-\u9fff]',page.locator('#main').inner_text())
    page.locator('[data-tab=history]').click();page.locator('#main [data-action=profile]').click();expect(page.locator('#badge-form')).to_be_visible()
    page.locator('[name=badges][value=crypto3]').check();page.locator('[name=badges][value=fx3]').check();page.locator('#badge-form [type=submit]').click();expect(page.locator('#dialog')).not_to_be_visible()
    page.locator('[data-tab=ranking]').click();expect(page.locator('#main .rank-row.me .achievement-chip')).to_have_count(2)
    expect(page.locator('#main .rank-row.me')).to_contain_text(name);expect(page.locator('#main .rank-row.me')).to_contain_text('Sales 1')
    page.locator('[data-rank-mode=total]').click();expect(page.locator('#main .rank-row.me')).to_contain_text('JPY')
    before=call('session')['account'];history_before=call('history')['items']
    page.locator('#practice-language').select_option('ja');expect(page).to_have_url(re.compile('/ja/app.html'))
    expect(page.locator('.bottom-nav [data-tab=challenges]')).to_have_text('チャレンジ')
    after=call('session')['account'];assert before['id']==after['id'] and before['state']==after['state'];assert call('history')['items']==history_before
    page.locator('#practice-language').select_option('en');expect(page).to_have_url(re.compile('/en/app.html'))
    expect(page.locator('.balance')).to_contain_text('JPY');page.locator('[data-action=share-result]').click()
    shared=page.evaluate('window.__shared');assert 'virtual' in shared['text'].lower() and 'JPY' in shared['text'];assert '/en/' in shared['url']
    # A recorded order with a lost response remains retryable across languages.
    quote=call('quote&symbol=BTC');payload={'symbol':'BTC','side':'buy','quantity':1000,'quoteToken':quote['quoteToken'],'requestId':str(uuid.uuid4())}
    assert call('trade',payload)['status']==200;count=len(call('history')['items'])
    page.evaluate("({id,payload})=>sessionStorage.setItem('practice.v4.pending.'+id,JSON.stringify(payload))",{'id':before['id'],'payload':payload})
    page.reload(wait_until='networkidle');expect(page.locator('.pending')).to_be_visible()
    page.locator('#practice-language').select_option('ja');expect(page.locator('.pending')).to_be_visible()
    page.locator('[data-action=retry-order]').click();expect(page.locator('.pending')).to_have_count(0);assert len(call('history')['items'])==count
    page.locator('#practice-language').select_option('en');expect(page).to_have_url(re.compile('/en/app.html'))
    page.locator('[data-tab=ranking]').click();page.locator('[data-comments=GENERAL]').click();expect(page.locator('#comment-form')).to_be_visible()
    text='ランキング <img src=x onerror=alert(1)>'
    page.locator('#comment-form textarea').fill(text);page.locator('#comment-form [type=submit]').click();expect(page.locator('#comment-list')).to_contain_text(text);assert page.locator('#comment-list img').count()==0
    page.locator('[data-action=close]').click()
    for width in [320,390,768,1280]:
        page.set_viewport_size({'width':width,'height':900})
        for tab in ['market','challenges','ranking','history']:
            page.locator('[data-tab='+tab+']').click()
            if tab=='market':expect(page.locator('#main .stock-row')).to_have_count(4)
            elif tab=='challenges':expect(page.locator('#main .achievement-tile')).to_have_count(6)
            elif tab=='ranking':expect(page.locator('#main .rank-row.me')).to_be_visible()
            else:expect(page.locator('#main .history-row').first).to_be_visible()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,tab)
            if tab in ['challenges','ranking']:page.screenshot(path=str(OUT/f'en-{tab}-{width}.png'),full_page=True)
    for name_page in ['index','terms','privacy','data']:
        page.goto(BASE+'/en/'+name_page+'.html',wait_until='networkidle');expect(page.locator('html')).to_have_attribute('lang','en')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.set_viewport_size({'width':390,'height':844});page.goto(BASE+'/en/index.html',wait_until='networkidle');page.screenshot(path=str(OUT/'en-landing-390.png'),full_page=True)
    page.goto(BASE+'/en/app.html',wait_until='networkidle');page.locator('[data-tab=history]').click();page.locator('[data-action=account]').click();page.locator('[data-action=delete-account]').click();page.locator('#delete-form [name=password]').fill(password);page.locator('#delete-form input[type=checkbox]').check();page.locator('#delete-form [type=submit]').click();expect(page.locator('#dialog')).not_to_be_visible()
    assert not errors,errors
    (OUT/'localization-result.json').write_text(json.dumps({'result':'PASS','environment':'isolated localhost HTTP; not production trading','countryCases':['JP','US','GB','unknown'],'manualPreference':'PASS','blockedStorage':'PASS','networkFallback':'PASS','englishTrading':'PASS','crossLanguageWalletAndHistory':'UNCHANGED','lostReplyIdempotency':'PASS','userTextPreserved':'PASS','sharePayload':'stubbed navigator.share; English text verified','viewports':[320,390,768,1280],'browserErrors':errors},indent=2))
    ctx.close();browser.close()
