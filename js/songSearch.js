// 曲名検索の「正規化」と「一致判定」だけを置く、DOMに一切触れない純粋関数のファイル
// （2026-09-15、js/songlist.jsから移設。本人指示：パーティー対戦の音声回答で曲名マッチングに
// 再利用し、かつtests.htmlから安全にimportできるようにするため）。
// 収録曲一覧・オリジナル問題作成モード・オンライン対戦の曲選択・回答候補一覧・
// 音声回答（js/songNameMatcher.js）が、すべて同じ判定を共有する。
//
// 以下の2関数は移設前と1文字も変えていない（既存の検索仕様を守るため）。

// 検索用に文字列を正規化する（大文字/小文字・全角/半角数字・カタカナ/ひらがな・空白・
// 検索の邪魔になりやすい記号の違いを吸収する）。オリジナル問題作成モードの選曲画面
// （customQuizScreen.js）でも、曲名検索の判定を完全に同じ仕様にするため、この関数と
// 下のsongMatchesSearch()を外部公開して再利用する（2画面で別々に実装すると、
// 将来どちらかだけ直し忘れて仕様がずれる恐れがあるため、判定ロジックを1箇所に集約する）。
export function normalizeForSearch(text) {
  return text
    .toLowerCase()
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/\s/g, "")
    .replace(/[・！？!?「」『』"'’〜~]/g, "");
}

// 曲名・読み仮名・別名（愛称）が検索語と一致するか判定する。
// 正式な曲名・読み仮名（title・reading）は前方一致、略称・愛称（aliases）は完全一致、
// と一致条件をあえて分けている。略称は読みが短いものが多く、前方一致のままだと
// 「あ」で「青サブ」の読み「あおさぶ」まで拾ってしまうなど、正式名称の検索結果に
// 略称由来の意図しない曲が紛れ込みやすいため（実際にこの不具合が発生し、この仕様に変更した）。
// normalizedQueryは呼び出し側でnormalizeForSearch()済みのものを渡す想定
// （曲ごとに何度も呼ばれるループの中で、検索語側の正規化を毎回やり直さないため）。
// aliasesは省略可（例：「青春"サブリミナル"」に対する「青サブ」のような、ファンの間の呼び方。
// songs.jsのsearchAliasesフィールド参照）。配列の要素は、文字列（カタカナ・ひらがな・
// 英字だけの別名）と、{ text, reading }オブジェクト（漢字を含む別名。readingにひらがな
// 表記を添える）のどちらも混在できる。カタカナ⇔ひらがなの違いはnormalizeForSearch()が
// 吸収するため、完全一致であっても「あおさぶ」で「アオサブ」を探す、といったことは可能。
export function songMatchesSearch(title, reading, aliases, normalizedQuery) {
  if (normalizedQuery === "") return true;

  const officialCandidates = [title, reading ?? ""];
  if (officialCandidates.some((candidate) => normalizeForSearch(candidate).startsWith(normalizedQuery))) {
    return true;
  }

  return (aliases ?? []).some((alias) => {
    if (typeof alias === "string") {
      return normalizeForSearch(alias) === normalizedQuery;
    }
    return (
      normalizeForSearch(alias.text) === normalizedQuery ||
      (alias.reading && normalizeForSearch(alias.reading) === normalizedQuery)
    );
  });
}
