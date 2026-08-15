// クイズランキング（js/timeAttackLeaderboard.js）の参加条件（全問正解・誤答0・スキップなし・
// 答えを見るなし・完走）を満たした自己ベストを、「フレンド」の公開設定がOFFのときも
// 端末内に保存しておくためのファイル（2026-08-16新設、本人指示）。
//
// 【なぜ既存の自己ベスト（js/timeAttackScore.js・js/randomPlaybackScore.js）を再利用しないか】
// 既存の自己ベストは「そのモードでの最速タイム」を保持するだけで、ランキング条件
// （ミス0）を満たしているとは限らない（ノーマル/ハードルールはミスがあっても記録される）。
// 通常イントロクイズに至っては、そもそも所要時間の自己ベスト自体を保存する仕組みが無い。
// そのため、「ランキング条件を満たした記録だけ」を対象にした専用の保存領域を新設する
// （本人指示：既存データから復元できないなら新設してよい）。
//
// 【設計】js/timeAttackHistory.jsと同じパターン（プレイヤーごとに完全に別キー、1つのJSONに
// まとめて保存）。出題タイプ×出題数×カテゴリーの組み合わせごとに、最速の1件だけを保持する
// （本人指示：「同じ組み合わせで複数回クリアした場合は一番速いBESTだけを保持」）。
//
// 【公開設定との関係】この保存自体は公開設定のON/OFFに一切関係なく常に行う。
// 実際にFirebaseへ送るかどうかの判断はjs/timeAttackLeaderboardSync.jsが別途担当する
// （本人指示：「公開ON/OFF」と「ランキング記録そのもの」を分けて考える）。
import { getPlayerKeyPrefix } from "./playerProfile.js";

const CURRENT_SCHEMA_VERSION = 1;

function buildStorageKey() {
  return `equalLoveIntroQuiz.${getPlayerKeyPrefix()}rankingCandidateBest`;
}

function buildComboKey(variant, questionCountValue, categoryFilterValue) {
  return `${variant}.${questionCountValue}.${categoryFilterValue}`;
}

function loadData() {
  const empty = { schemaVersion: CURRENT_SCHEMA_VERSION, bestsByCombo: {} };
  try {
    const stored = localStorage.getItem(buildStorageKey());
    if (!stored) return empty;

    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed.bestsByCombo !== "object" || parsed.bestsByCombo === null) return empty;
    return parsed;
  } catch {
    return empty;
  }
}

function saveData(data) {
  try {
    localStorage.setItem(buildStorageKey(), JSON.stringify(data));
  } catch {
    // プライベートブラウジング等でlocalStorageが使えない環境でも、アプリ自体は動き続けられるようにする
  }
}

// 指定した出題タイプ・出題数・カテゴリーの組み合わせにおける、ランキング条件を満たした
// 自己ベストを取得する。未保存なら null を返す。
export function getRankingCandidateBest(variant, questionCountValue, categoryFilterValue) {
  const data = loadData();
  return data.bestsByCombo[buildComboKey(variant, questionCountValue, categoryFilterValue)] ?? null;
}

// 今回の記録が、保存済みの候補ベストより速ければ保存する。保存したら true を返す。
// 【呼び出し側の責務】この関数自体はランキング条件（全問正解・誤答0・スキップなし・
// 答えを見るなし・完走）を判定しない。呼び出し側が条件を満たしたと確認した記録だけを
// 渡す想定（js/main.js・js/randomPlaybackScreen.js・js/timeAttackScreen.jsの各結果画面）。
export function saveRankingCandidateIfBetter({
  variant,
  questionCountValue,
  categoryFilterValue,
  clearTimeMs,
  missCount,
  rule,
  source,
  achievedAt,
}) {
  const data = loadData();
  const key = buildComboKey(variant, questionCountValue, categoryFilterValue);
  const current = data.bestsByCombo[key];
  if (current && clearTimeMs >= current.clearTimeMs) {
    return false;
  }

  data.bestsByCombo[key] = {
    variant,
    questionCountValue,
    categoryFilterValue,
    clearTimeMs,
    missCount,
    rule: rule ?? null,
    source: source ?? null,
    achievedAt,
  };
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  saveData(data);
  return true;
}

// 保存されている候補ベストを全件、配列として返す（読み取り専用）。
// フレンド公開設定をOFF→ONへ切り替えた瞬間の一括同期（js/timeAttackLeaderboardSync.jsの
// syncRankingCandidatesToFirebase）から呼ばれる想定。最大30件（出題タイプ2×出題数5×
// カテゴリー3）だが、実際にはプレイした組み合わせの分だけしか保存されていない。
export function getAllRankingCandidateBests() {
  return Object.values(loadData().bestsByCombo);
}
