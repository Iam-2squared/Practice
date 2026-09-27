"""Real localhost API with isolated provider fixtures. No production users."""
import json,uuid
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
OUT=Path('test-results');OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://localhost:3000/app.html',wait_until='networkidle')
    assert page.locator('.bottom-nav button').all_text_contents()==['資産','マーケット','チャレンジ','ランキング','アカウント']
    page.get_by_role('button',name='仮想口座を作る',exact=True).click()
    name='quest_'+uuid.uuid4().hex[:8];password='quest-'+uuid.uuid4().hex
    page.locator('[name=username]').fill(name);page.locator('#password').fill(password);page.locator('[name=confirmation]').fill(password);page.locator('[name=saved]').check();page.locator('#auth-form [type=submit]').click()
    expect(page.locator('#dialog')).not_to_be_visible(timeout=15000)
    page.locator('[data-tab=challenges]').click()
    expect(page.locator('.mission-row')).to_have_count(5);expect(page.locator('.achievement-tile')).to_have_count(6)
    def buy(kind,symbol,quantity):
        page.locator('[data-tab=market]').click();page.locator('[data-market='+kind+']').click();page.locator('[data-symbol='+symbol+']').click()
        expect(page.locator('#quantity')).to_be_visible();expect(page.locator('.chart-plot')).to_be_visible(timeout=15000)
        page.locator('#quantity').fill(quantity);page.get_by_role('button',name='購入内容を確認',exact=True).click();page.get_by_role('button',name='仮想購入する',exact=True).click();expect(page.locator('#dialog')).not_to_be_visible()
    for _ in range(3):buy('crypto','BTC','0.001')
    for _ in range(3):buy('fx','USDJPY','1')
    page.locator('[data-tab=challenges]').click()
    expect(page.locator('[data-achievement=crypto3]')).to_have_class('achievement-tile earned');expect(page.locator('[data-achievement=fx3]')).to_have_class('achievement-tile earned')
    page.locator('[data-tab=history]').click();page.locator('#main [data-action=profile]').click();expect(page.locator('#badge-form')).to_be_visible()
    page.locator('[name=badges][value=crypto3]').check();page.locator('[name=badges][value=fx3]').check();page.get_by_role('button',name='プロフィールを保存',exact=True).click();expect(page.locator('#dialog')).not_to_be_visible()
    page.locator('[data-tab=ranking]').click();expect(page.locator('.rank-row.me .achievement-chip')).to_have_count(2);expect(page.locator('[data-rank-mode=weekly]')).to_have_attribute('aria-pressed','true');expect(page.locator('.weekly-summary')).to_be_visible()
    page.locator('[data-rank-mode=total]').click();expect(page.locator('.rank-row.me')).to_be_visible();page.locator('[data-rank-mode=weekly]').click();page.locator('[data-rank-mode=total]').click();expect(page.locator('[data-rank-mode=total]')).to_have_attribute('aria-pressed','true');expect(page.locator('.rank-row.me .achievement-chip')).to_have_count(2)
    page.reload(wait_until='networkidle');page.locator('[data-tab=history]').click();page.locator('#main [data-action=profile]').click();expect(page.locator('[name=badges][value=crypto3]')).to_be_checked();expect(page.locator('[name=badges][value=fx3]')).to_be_checked();page.locator('[data-action=close]').click()
    for width in [320,390,768,1280]:
        page.set_viewport_size({'width':width,'height':900})
        for tab in ['market','challenges','ranking','history']:
            page.locator('[data-tab='+tab+']').click();page.wait_for_timeout(120);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,tab)
        page.locator('[data-tab=challenges]').click();expect(page.locator('.achievement-tile')).to_have_count(6);page.screenshot(path=str(OUT/f'challenges-{width}.png'),full_page=True)
    page.locator('[data-tab=history]').click();page.locator('[data-action=account]').click();page.locator('[data-action=delete-account]').click();page.locator('#delete-form [name=password]').fill(password);page.locator('#delete-form input[type=checkbox]').check();page.locator('#delete-form [type=submit]').click();expect(page.locator('#dialog')).not_to_be_visible()
    assert not errors,errors
    (OUT/'progression-result.json').write_text(json.dumps({'result':'PASS','mode':'local-HTTP-fixtures','missions':5,'achievements':6,'persistedBadges':2,'rankingModes':['weekly','total'],'viewports':[320,390,768,1280],'errors':errors},indent=2));browser.close()
