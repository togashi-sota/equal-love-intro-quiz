// 「回答候補（曲）が多いときの検索欄＋50音ジャンプバー」を、複数のオンライン対戦モードで
// 共通利用するための小さなヘルパー（2026-09-07新設・本人指示）。
//
// 【なぜ切り出したか】この検索・50音ジャンプの仕組みは、もともと歌詞クイズ対戦
// （js/onlineLyricsQuizBattleScreen.js）だけが持っていたが、「一瞬チャレンジ・一瞬バトル・
// 一瞬協力にも同じ50音ジャンプ・検索UIを展開してほしい。ただしモードごとに別実装にして
// 挙動がズレるのは避けてほしい」という本人指示を受け、状態管理・絞り込み・描画のロジック
// 部分をこのファイルへ集約した。検索・50音の判定そのもの（normalizeForSearch・
// songMatchesSearch・deriveGojuonRowKey）はjs/songlist.jsの既存実装をそのまま呼ぶだけで、
// このファイル自身は新しい検索アルゴリズムを一切持たない。
//
// 【歌詞クイズ対戦（js/onlineLyricsQuizBattleScreen.js）自体は今回書き換えていない】
// 既に本番で動いている実装のため、リスクを避けて手を加えず、このファイルは新たに
// 対応する3モード（一瞬チャレンジ・一瞬バトル・一瞬協力）からだけ利用する。
// 見た目のCSSクラス（online-lyrics-battle-answer-jump-bar・online-lyrics-battle-jump-chip）は
// 歌詞クイズ対戦と共通のものをそのまま再利用する（ピル型チップの汎用的な見た目のため、
// モードを問わず流用して問題ない）。
//
// 【使い方】1つの回答候補プールにつき、createAnswerPoolBrowseState()で状態を1つ作り、
// 新しい問題に切り替わるたびresetAnswerPoolBrowseState()でリセットする。
// フィルタ結果はfilterAnswerPool()で取得し、50音ジャンプバーの描画はrenderAnswerJumpBar()に
// 任せる（全曲検索＝候補数が多いプールのときだけ表示する想定。呼び出し側でhidden制御する）。

import { normalizeForSearch, songMatchesSearch, GOJUON_ROWS, deriveGojuonRowKey } from "./songlist.js";

// 検索文字列・50音ジャンプの選択行を1組にまとめた状態オブジェクトを作る。
export function createAnswerPoolBrowseState() {
  return { searchQuery: "", jumpRowKey: null };
}

// 新しい問題に切り替わった瞬間に呼ぶ（本人指示：問題ごとに検索状態を完全リセットする）。
export function resetAnswerPoolBrowseState(state) {
  state.searchQuery = "";
  state.jumpRowKey = null;
}

// 検索文字列（前方一致・別名は完全一致）→50音ジャンプ（該当行のみ）→どちらも無ければ
// 全件、の優先順位で回答候補プールを絞り込む。js/onlineLyricsQuizBattleScreen.jsの
// filterAnswerPool()と全く同じロジック。
export function filterAnswerPool(pool, state) {
  const normalizedQuery = normalizeForSearch(state.searchQuery);
  if (normalizedQuery !== "") {
    return pool.filter((song) => songMatchesSearch(song.title, song.searchReading, song.searchAliases, normalizedQuery));
  }
  if (state.jumpRowKey && state.jumpRowKey !== "all") {
    return pool.filter((song) => deriveGojuonRowKey(song.searchReading ?? song.title) === state.jumpRowKey);
  }
  return pool;
}

// 50音ジャンプバー（「すべて｜あ｜か｜さ｜…」）を描画する。行を押すと、検索文字列を
// クリアしたうえでその行だけに絞り込む（検索を優先する既存の設計と同じ）。
// onChangeは、状態を更新した後に呼び出し側が再描画するためのコールバック。
export function renderAnswerJumpBar(containerElement, state, onChange) {
  containerElement.innerHTML = "";
  const chips = [{ key: "all", label: "すべて" }, ...GOJUON_ROWS];
  chips.forEach(({ key, label }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "online-lyrics-battle-jump-chip";
    button.textContent = label;
    const isActive = key === "all" ? !state.jumpRowKey || state.jumpRowKey === "all" : state.jumpRowKey === key;
    if (isActive) button.classList.add("is-active");
    button.addEventListener("click", () => {
      state.jumpRowKey = key;
      state.searchQuery = "";
      onChange();
    });
    containerElement.appendChild(button);
  });
}
