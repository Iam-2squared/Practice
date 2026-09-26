// Names are a small local discovery index, not price data or an investment recommendation.
export const CATALOG = [
 ['7203.T','トヨタ自動車','Toyota','自動車'], ['6758.T','ソニーグループ','Sony','電気機器'],
 ['7974.T','任天堂','Nintendo','その他製品'], ['9984.T','ソフトバンクグループ','SoftBank Group','情報・通信'],
 ['8306.T','三菱UFJフィナンシャル・グループ','MUFG','銀行'], ['9432.T','NTT','日本電信電話','情報・通信'],
 ['9983.T','ファーストリテイリング','Fast Retailing ユニクロ','小売'], ['6501.T','日立製作所','Hitachi','電気機器'],
 ['8058.T','三菱商事','Mitsubishi','卸売'], ['4063.T','信越化学工業','Shin-Etsu','化学'],
 ['4502.T','武田薬品工業','Takeda','医薬品'], ['8316.T','三井住友フィナンシャルグループ','SMFG','銀行'],
 ['9433.T','KDDI','au','情報・通信'], ['7267.T','本田技研工業','Honda ホンダ','自動車'],
 ['7011.T','三菱重工業','MHI','機械'], ['4661.T','オリエンタルランド','Disney ディズニー','サービス'],
 ['6861.T','キーエンス','Keyence','電気機器'], ['8035.T','東京エレクトロン','Tokyo Electron','電気機器'],
 ['2914.T','日本たばこ産業','JT','食料品'], ['1605.T','INPEX','インペックス','鉱業'],
].map(([symbol,name,aliases,sector]) => ({symbol,name,aliases,sector}));
export function catalogSearch(query) {
 const q = query.normalize('NFKC').trim().toLowerCase();
 return CATALOG.filter(x => `${x.symbol} ${x.name} ${x.aliases}`.toLowerCase().includes(q)).slice(0,20);
}
