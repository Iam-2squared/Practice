"""Default: real localhost HTTP + API fixture server (CI).
PRACTICE_UI_ISOLATED=1: pure in-memory API mocks, NO network bridge; rendering only.
The isolated mode is not an HTTP/Cookie/Supabase/live-provider E2E test.
"""
import os, json, base64, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
isolated=os.getenv('PRACTICE_UI_ISOLATED')=='1'
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH') or '/usr/bin/chromium' if isolated else None, headless=True, args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    if isolated:
        html=(ROOT/'public/index.html').read_text().replace('<script type="module" src="/app.js"></script>','').replace('<link rel="stylesheet" href="/style.css">','').replace('<link rel="manifest" href="/manifest.json">','')
        html=html.replace('src="/icon.svg"','src="data:image/svg+xml;base64,'+base64.b64encode((ROOT/'public/icon.svg').read_bytes()).decode()+'"')
        page.set_content(html)
        page.add_style_tag(content=(ROOT/'public/style.css').read_text())
        page.add_script_tag(content=(ROOT/'tests/ui-mock.js').read_text())
        page.add_script_tag(content=(ROOT/'public/app.js').read_text(),type='module')
    else:
        r=page.goto('http://localhost:3000',wait_until='networkidle');assert r.status==200
        assert "script-src 'self'" in r.headers['content-security-policy']
    expect(page.get_by_role('heading',name='あなたの資産')).to_be_visible()
    assert page.locator('nav button').count()==5
    assert page.locator('nav button').all_text_contents()==['資産','仮想通貨','FX','ランキング','履歴・口座']
    page.get_by_role('button',name='口座を作る',exact=True).click()
    username='ui_'+uuid.uuid4().hex[:10]
    password='Ui7!qZ' # Ephemeral local test fixture only.
    page.locator('[name=username]').fill(username)
    page.locator('#password').fill(password)
    page.locator('[name=confirmation]').fill(password)
    page.locator('[name=saved]').check()
    page.locator('#auth-form [type=submit]').click()
    expect(page.locator('#dialog')).not_to_be_visible(timeout=10000)
    if not isolated:
        cookies=page.context.cookies();session=next(c for c in cookies if c['name']=='practice_session')
        assert session['httpOnly'] and session['sameSite']=='Strict'
        assert 'practice_session' not in page.evaluate('document.cookie')
    page.locator('[data-tab=crypto]').click()
    expect(page.locator('[data-symbol=BTC]')).to_be_visible()
    assert page.locator('[data-symbol=USDJPY]').count()==0
    page.locator('[data-symbol=BTC]').click()
    expect(page.locator('#quantity')).to_have_value('0.001')
    for invalid in ['-1','0.0000001','0.000001','1000000']:
        page.locator('#quantity').fill(invalid);expect(page.locator('#order-next')).to_be_disabled()
    page.locator('#quantity').fill('0.001')
    page.get_by_role('button',name='購入内容を確認',exact=True).click()
    page.get_by_role('button',name='仮想購入する',exact=True).click()
    expect(page.locator('#dialog')).not_to_be_visible()
    page.locator('[data-tab=assets]').click()
    expect(page.locator('.history-row')).to_have_count(1)
    assert page.locator('#main .stock-row').count()==0
    page.screenshot(path=str(OUT/'assets-crypto-fx.png'))
    page.locator('[data-tab=crypto]').click();page.locator('[data-symbol=BTC]').click()
    page.locator('[data-side=sell]').click();page.locator('#quantity').fill('0.001')
    page.get_by_role('button',name='売却内容を確認',exact=True).click();page.get_by_role('button',name='仮想売却する',exact=True).click()
    expect(page.locator('#dialog')).not_to_be_visible()
    page.locator('[data-tab=fx]').click();expect(page.locator('[data-symbol=USDJPY]')).to_be_visible()
    assert page.locator('[data-symbol=BTC]').count()==0
    page.locator('[data-symbol=USDJPY]').click()
    expect(page.locator('.quote-meta')).to_contain_text('日次参考レート')
    page.locator('#quantity').fill('0.5');expect(page.locator('#order-next')).to_be_disabled()
    page.locator('#quantity').fill('10');page.get_by_role('button',name='購入内容を確認',exact=True).click();page.get_by_role('button',name='仮想購入する',exact=True).click()
    expect(page.locator('#dialog')).not_to_be_visible()
    page.locator('[data-tab=history]').click();expect(page.locator('.history-row')).to_have_count(3)
    page.locator('[data-action=account]').click();newname='edited_'+uuid.uuid4().hex[:8]
    page.locator('#username-form [name=username]').fill(newname);page.locator('#username-form [type=submit]').click()
    expect(page.locator('#dialog')).not_to_be_visible()
    page.locator('[data-tab=ranking]').click();expect(page.locator('.rank-row.me')).to_contain_text(newname)
    page.screenshot(path=str(OUT/'ranking-crypto-fx.png'))
    for width in [320,360,390,430,768,1280]:
        page.set_viewport_size({'width':width,'height':844})
        for tab in ['assets','crypto','fx','ranking','history']:
            page.locator('[data-tab='+tab+']').click();page.wait_for_timeout(50)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), (width,tab)
            for box in page.locator('nav button').all(): assert box.bounding_box()['height']>=44
    page.set_viewport_size({'width':390,'height':844});page.locator('[data-tab=fx]').click();page.locator('[data-symbol=USDJPY]').click()
    expect(page.locator('.quote-meta')).to_contain_text('日次参考レート')
    page.screenshot(path=str(OUT/'fx-sheet.png'))
    page.locator('[data-action=close]').click()
    page.locator('[data-tab=history]').click();page.locator('[data-action=account]').click();page.get_by_role('button',name='ログアウト',exact=True).click()
    expect(page.locator('#dialog')).not_to_be_visible()
    page.get_by_role('button',name='すでに口座がある方はログイン').click()
    page.locator('#password').fill(password);page.locator('#auth-form [type=submit]').click();expect(page.locator('#dialog')).not_to_be_visible()
    page.locator('[data-tab=history]').click();expect(page.locator('.history-row')).to_have_count(3)
    page.locator('[data-action=account]').click();page.locator('[data-action=delete-account]').click()
    page.locator('#delete-form [name=password]').fill(password);page.locator('#delete-form input[type=checkbox]').check();page.locator('#delete-form [type=submit]').click()
    expect(page.locator('#dialog')).not_to_be_visible()
    expect(page.get_by_role('button',name='口座を作る',exact=True)).to_be_visible()
    assert not errors, errors
    result={'result':'PASS','mode':'isolated-renderer-with-mock-api' if isolated else 'HTTP-real-API-fixtures','viewports':[320,360,390,430,768,1280],'tabs':5,'holdingsList':False,'uncaughtErrors':errors}
    (OUT/'browser-result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
    browser.close()
