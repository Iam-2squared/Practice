// Context-sensitive translations are applied to trusted source at build time,
// before interpolation. They never inspect or change user-authored content.
export const EN_CONTEXT=Object.freeze({
 'プロフィール・称号':'Profile / achievements',
 '獲得した実績を3つまで表示':'Display up to three earned achievements'
});
export function englishTemplates(source){return source
 .replaceAll("${state.side==='buy'?'購入':'売却'}内容を確認", "Review ${state.side==='buy'?'purchase':'sale'}")
 .replaceAll("仮想${side==='buy'?'購入':'売却'}する", "Confirm virtual ${side==='buy'?'purchase':'sale'}")
 .replaceAll("${side==='buy'?'購入':'売却'}金額", "${side==='buy'?'Purchase':'Sale'} amount")
 .replaceAll('1 ${esc(q.unit)} あたり', 'Per 1 ${esc(q.unit)}')
 .replaceAll('${stamp(q.quoteAt)} JST 時点', 'As of ${stamp(q.quoteAt)} JST')
 .replaceAll('数量（${esc(q.unit)}）', 'Quantity (${esc(q.unit)})')
 .replaceAll('${stampDay(r.week?.start)}〜${stampDay((r.week?.end||0)-1)} の増減額', '${stampDay(r.week?.start)} – ${stampDay((r.week?.end||0)-1)} change')
 .replaceAll("${m.done?'完了':'未完了'}", "${m.done?'Completed':'Incomplete'}");}
