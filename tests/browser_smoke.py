"""Optional UI verification (pip install playwright). Start `npm run dev` first.

The managed browser in the authoring environment blocks direct localhost navigation.
This harness renders the actual static files and bridges fetch to the actual local
HTTP API with an isolated cookie jar. It tests UI + application behavior, NOT
Vercel deployment routing, browser cookie enforcement, or CSP enforcement.
No browser security policy is changed. Production URL smoke tests remain required.
"""
import base64
import json
import os
from pathlib import Path
import urllib.request
import urllib.error
import uuid
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results'
OUT.mkdir(exist_ok=True)
html = (ROOT/'public/index.html').read_text().replace('<script type="module" src="/app.js"></script>', '').replace('<link rel="stylesheet" href="/style.css">', '')
html = html.replace('src="/icon.svg"', 'src="data:image/svg+xml;base64,'+base64.b64encode((ROOT/'public/icon.svg').read_bytes()).decode()+'"')
cookie = ''

def transport(source, path, options):
    global cookie
    headers = {'Origin':'http://localhost:3000','Cookie':cookie,**options.get('headers',{})}
    request = urllib.request.Request('http://localhost:3000'+path, data=options.get('body','').encode() if options.get('method')=='POST' else None, headers=headers, method=options.get('method','GET'))
    try:
        response = urllib.request.urlopen(request, timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    if response.headers.get('Set-Cookie'):
        cookie = response.headers.get('Set-Cookie').split(';')[0]
    return {'status':response.status,'body':response.read().decode()}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('about:blank')
    page.set_content(html)
    page.add_style_tag(content=(ROOT/'public/style.css').read_text())
    page.expose_binding('localApi', transport)
    page.evaluate('''() => {
      window.fetch=async(path,options={})=>{const r=await window.localApi(path,options);return new Response(r.body,{status:r.status,headers:{'Content-Type':'application/json'}});};
      if(!crypto.randomUUID)crypto.randomUUID=()=> '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
    }''')
    page.add_script_tag(content=(ROOT/'public/app.js').read_text(),type='module')
    expect(page.get_by_role('heading',name='あなたの資産')).to_be_visible()
    assert page.locator('nav button').count()==3
    page.get_by_role('button',name='練習をはじめる',exact=True).click()
    password='BrowserTest_Only_'+str(uuid.uuid4())
    page.locator('#password').fill(password)
    page.locator('[name=confirmation]').fill(password)
    page.locator('[name=saved]').check()
    page.get_by_role('button',name='10万円で練習をはじめる').click()
    expect(page.locator('#dialog')).not_to_be_visible()
    expect(page.get_by_role('heading',name='最初の1株を買ってみよう')).to_be_visible()
    page.locator('[data-tab=trade]').click()
    expect(page.get_by_role('heading',name='銘柄を探す',exact=True)).to_be_visible()
    page.locator('#search').fill('トヨタ')
    expect(page.locator('[data-symbol="7203.T"]')).to_be_visible()
    page.locator('[data-symbol="7203.T"]').click()
    expect(page.locator('#quantity')).to_be_visible()
    page.locator('#quantity').fill('100000')
    expect(page.locator('#order-next')).to_be_disabled()
    expect(page.locator('#trade-error')).to_contain_text('買付余力が不足')
    page.locator('#quantity').fill('3')
    page.screenshot(path=str(OUT/'trade-mobile.png'))
    page.get_by_role('button',name='購入内容を確認').click()
    page.get_by_role('button',name='仮想購入する',exact=True).click()
    expect(page.locator('#dialog')).not_to_be_visible()
    page.locator('[data-tab=assets]').click()
    expect(page.locator('[data-symbol="7203.T"]')).to_contain_text('3株')
    # Holdings -> sell, no separate search required.
    page.locator('[data-symbol="7203.T"]').click()
    expect(page.locator('[data-side-toggle=sell]')).to_have_attribute('aria-pressed','true')
    page.locator('#quantity').fill('4')
    expect(page.locator('#order-next')).to_be_disabled()
    page.locator('#quantity').fill('1')
    page.get_by_role('button',name='売却内容を確認').click()
    page.get_by_role('button',name='仮想売却する',exact=True).click()
    expect(page.locator('#dialog')).not_to_be_visible()
    expect(page.locator('[data-symbol="7203.T"]')).to_contain_text('2株')
    page.screenshot(path=str(OUT/'assets-mobile.png'))
    page.locator('[data-tab=history]').click()
    expect(page.locator('.history-row')).to_have_count(2)
    page.screenshot(path=str(OUT/'history-mobile.png'))
    page.locator('[data-filter=sell]').click()
    expect(page.locator('.history-row')).to_have_count(1)
    page.get_by_role('button',name='アカウント',exact=False).filter(has=page.locator('strong')).click()
    page.get_by_role('button',name='ログアウト',exact=True).click()
    expect(page.locator('#dialog')).not_to_be_visible()
    page.locator('[data-action=account]').click()
    page.locator('#password').fill(password)
    page.locator('#auth-form [type=submit]').click()
    expect(page.locator('#dialog')).not_to_be_visible()
    page.locator('[data-tab=assets]').click()
    expect(page.locator('[data-symbol="7203.T"]')).to_contain_text('2株')
    page.set_viewport_size({'width':1280,'height':900})
    page.screenshot(path=str(OUT/'assets-desktop.png'))
    page.set_viewport_size({'width':360,'height':800})
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.screenshot(path=str(OUT/'assets-small-mobile.png'))
    assert not errors, errors
    (OUT/'browser-result.json').write_text(json.dumps({'result':'PASS','transport':'isolated renderer + local HTTP API bridge','checks':['3-tab layout','password-only registration','search','insufficient balance','buy confirmation','holding-to-sell','oversell rejected','history','history filter','logout','relogin persistence','360px no overflow','1280px desktop','no uncaught JS errors'],'uncaught_js_errors':errors},ensure_ascii=False,indent=2))
    print('PASS: UI purchase/sale/history/auth flow, mobile+desktop; no uncaught JS errors.')
    browser.close()
