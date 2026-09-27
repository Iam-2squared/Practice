"""Real localhost API with isolated providers. Never use production accounts.

Scope UI assertions to #main or the open dialog: closed dialogs retain their DOM
and must not satisfy a challenge-screen assertion or a screenshot readiness check.
"""
import json
import uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

OUT = Path('test-results')
OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://localhost:3000/app.html', wait_until='networkidle')
    assert page.locator('.bottom-nav button').all_text_contents() == ['資産', 'マーケット', 'チャレンジ', 'ランキング', 'アカウント']
    page.get_by_role('button', name='仮想口座を作る', exact=True).click()
    name = 'quest_' + uuid.uuid4().hex[:8]
    password = 'quest-' + uuid.uuid4().hex
    page.locator('[name=username]').fill(name)
    page.locator('#password').fill(password)
    page.locator('[name=confirmation]').fill(password)
    page.locator('[name=saved]').check()
    page.locator('#auth-form [type=submit]').click()
    expect(page.locator('#dialog')).not_to_be_visible(timeout=15000)

    def ready(tab):
        page.locator('.bottom-nav [data-tab=' + tab + ']').click()
        expect(page.locator('.bottom-nav [data-tab=' + tab + ']')).to_have_attribute('aria-current', 'page')
        selector = {'market': '.stock-row', 'challenges': '.mission-list', 'ranking': '.rank-row.me', 'history': '.account-entry'}[tab]
        expect(page.locator('#main ' + selector).first).to_be_visible(timeout=15000)
        expect(page.locator('#main .loading')).to_have_count(0)

    ready('challenges')
    expect(page.locator('#main .mission-row')).to_have_count(5)
    expect(page.locator('#main .achievement-tile')).to_have_count(6)

    def buy(kind, symbol, quantity):
        ready('market')
        page.locator('[data-market=' + kind + ']').click()
        page.locator('[data-symbol=' + symbol + ']').click()
        expect(page.locator('#quantity')).to_be_visible()
        expect(page.locator('.chart-plot')).to_be_visible(timeout=15000)
        page.locator('#quantity').fill(quantity)
        page.get_by_role('button', name='購入内容を確認', exact=True).click()
        page.get_by_role('button', name='仮想購入する', exact=True).click()
        expect(page.locator('#dialog')).not_to_be_visible(timeout=15000)

    for _ in range(3):
        buy('crypto', 'BTC', '0.001')
    for _ in range(3):
        buy('fx', 'USDJPY', '1')
    ready('challenges')
    expect(page.locator('#main [data-achievement=crypto3]')).to_have_class('achievement-tile earned')
    expect(page.locator('#main [data-achievement=fx3]')).to_have_class('achievement-tile earned')
    page.locator('#main [data-mission=sell]').click()
    expect(page.locator('#quantity')).to_be_visible()
    page.locator('#quantity').fill('0.001')
    page.get_by_role('button', name='売却内容を確認', exact=True).click()
    page.get_by_role('button', name='仮想売却する', exact=True).click()
    expect(page.locator('#dialog')).not_to_be_visible(timeout=15000)
    # The regular Assets API records a completed portfolio observation.
    page.locator('.bottom-nav [data-tab=assets]').click()
    expect(page.locator('#main .balance')).not_to_have_text('—', timeout=15000)
    ready('challenges')
    expect(page.locator('#main .mission-row.complete')).to_have_count(5)

    ready('history')
    page.locator('#main [data-action=profile]').click()
    expect(page.locator('#badge-form')).to_be_visible()
    page.locator('#badge-form [name=badges][value=crypto3]').check()
    page.locator('#badge-form [name=badges][value=fx3]').check()
    page.get_by_role('button', name='プロフィールを保存', exact=True).click()
    expect(page.locator('#dialog')).not_to_be_visible()
    ready('ranking')
    expect(page.locator('#main .rank-row.me .achievement-chip')).to_have_count(2)
    expect(page.locator('[data-rank-mode=weekly]')).to_have_attribute('aria-pressed', 'true')
    expect(page.locator('#main .weekly-summary')).to_be_visible()
    expect(page.locator('#main .rank-row.me .rank-total small')).to_have_text('売却 1回')
    page.locator('[data-rank-mode=total]').click()
    expect(page.locator('#main .rank-row.me')).to_be_visible()
    page.locator('[data-rank-mode=weekly]').click()
    page.locator('[data-rank-mode=total]').click()
    expect(page.locator('[data-rank-mode=total]')).to_have_attribute('aria-pressed', 'true')
    expect(page.locator('#main .rank-row.me .achievement-chip')).to_have_count(2)
    expect(page.locator('#main .weekly-summary')).to_have_count(0)

    page.reload(wait_until='networkidle')
    ready('history')
    page.locator('#main [data-action=profile]').click()
    expect(page.locator('#badge-form [name=badges][value=crypto3]')).to_be_checked()
    expect(page.locator('#badge-form [name=badges][value=fx3]')).to_be_checked()
    page.locator('[data-action=close]').click()
    for width in [320, 390, 768, 1280]:
        page.set_viewport_size({'width': width, 'height': 900})
        for tab in ['market', 'challenges', 'ranking', 'history']:
            ready(tab)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), (width, tab)
        ready('challenges')
        expect(page.locator('#main .achievement-tile')).to_have_count(6)
        expect(page.locator('#main .mission-row.complete')).to_have_count(5)
        page.evaluate('window.scrollTo(0,0)')
        page.screenshot(path=str(OUT / f'challenges-{width}.png'), full_page=True)
        ready('ranking')
        page.locator('[data-rank-mode=weekly]').click()
        expect(page.locator('#main .weekly-summary')).to_be_visible()
        expect(page.locator('#main .rank-row.me .achievement-chip')).to_have_count(2)
        page.evaluate('window.scrollTo(0,0)')
        page.screenshot(path=str(OUT / f'weekly-{width}.png'), full_page=True)
    # Check the three-title UI limit with explicitly mocked earned data only.
    # No forged achievement is sent to or saved by the API.
    profile_response = page.request.get('http://localhost:3000/api/index?action=progress')
    assert profile_response.ok
    simulated = profile_response.json()
    for achievement in simulated['achievements']:
        achievement['earnedAt'] = 1
    simulated['selected'] = ['profit1000', 'crypto3', 'fx3']
    pattern = '**/api/index?action=progress'
    page.route(pattern, lambda route: route.fulfill(json=simulated))
    ready('history')
    page.locator('#main [data-action=profile]').click()
    expect(page.locator('#badge-count')).to_have_text('3 / 3 選択中')
    expect(page.locator('#badge-form [name=badges]:checked')).to_have_count(3)
    expect(page.locator('#badge-form [value=profit2000]')).to_be_disabled()
    page.locator('#badge-form [value=profit1000]').uncheck()
    expect(page.locator('#badge-form [value=profit2000]')).to_be_enabled()
    page.locator('#badge-form [value=profit2000]').check()
    expect(page.locator('#badge-count')).to_have_text('3 / 3 選択中')
    page.screenshot(path=str(OUT / 'profile-three-limit-ui.png'), full_page=True)
    page.locator('[data-action=close]').click()
    page.unroute(pattern)

    ready('history')
    page.locator('[data-action=account]').click()
    page.locator('[data-action=delete-account]').click()
    page.locator('#delete-form [name=password]').fill(password)
    page.locator('#delete-form input[type=checkbox]').check()
    page.locator('#delete-form [type=submit]').click()
    expect(page.locator('#dialog')).not_to_be_visible()
    assert not errors, errors
    (OUT / 'progression-result.json').write_text(json.dumps({
        'result': 'PASS', 'mode': 'local-HTTP-fixtures', 'missionsCompleted': 5,
        'achievements': 6, 'persistedBadges': 2, 'threeTitleUiLimit': 'mocked earned data only',
        'rankingModes': ['weekly', 'total'], 'viewports': [320, 390, 768, 1280], 'errors': errors
    }, indent=2))
    browser.close()
