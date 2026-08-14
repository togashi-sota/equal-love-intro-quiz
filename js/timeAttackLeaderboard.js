// タイムアタックのグローバルランキング（TOP10）に関する、Firebaseに一切触れない純粋関数群。
// Firebaseへの実際の読み書きはjs/timeAttackLeaderboardSync.jsが担当する
// （js/publicProfilePayloads.js・js/publicProfileSync.jsと同じファイル分割方針。
// 恒久テストがFirebase初期化を発生させないようにするため）。
//
// 【2026-08-16改訂・本人指示】以前はLOVE連チャンルールだけを対象にしていたが、
// 「1問でも間違えたプレイは公開ランキングに載らない」ことさえ保証すれば、ノーマル・ハードも
// 含めて公平に比較できると判断し、3ルールすべてを対象に戻した。加えてカテゴリー
// （表題曲のみ／表題曲＋全員曲／全曲）でも完全に分離する。
//
// 【分離方針】出題タイプ(variant)×ルール(rule)×出題数(questionCountValue)×
// カテゴリー(categoryFilterValue)の組み合わせごとに完全に別々のランキングとして扱う。
//
// 【記録の比較基準】クリアタイム昇順（速い方が上位）。同タイムは①クリアタイム②ミス数
// ③登録日時（早い方が上位）の順で決める（本人の第一候補どおり）。
//
// 【旧データとの互換性】以前の構造（timeAttackLeaderboards/{variant}/{questionCountValue}/{uid}、
// ルール・カテゴリーの区別なし）は、この新しい構造とは別の場所（トップレベルのキー名を
// timeAttackLeaderboardsV2に変える）に置く。混ぜて表示すると「ルール・カテゴリーを問わない
// 記録」と「新条件を満たした記録」が区別できなくなり、不正確な比較になってしまうため。
// 旧データは削除せず、単に新しいコードからは一切参照しない（本人指示：既存データを
// 誤って新しいカテゴリーへ混ぜない）。

// タイムアタックの出題数のうち、ランキング対応の値。既存のtime-attack-question-countの
// ラジオボタンの値（"5"|"10"|"20"|"50"|"all"）とそのまま一致させている。
export const LEADERBOARD_QUESTION_COUNT_VALUES = ["5", "10", "20", "50", "all"];

// ランキング対応のルール（js/timeAttackScreen.jsのTIME_ATTACK_RULEと同じ文字列をあえて
// 複製している。このファイルをFirebase非依存の恒久テスト対象に保つ設計方針を維持するため、
// LEADERBOARD_QUESTION_COUNT_VALUESと同じ考え方）。
export const LEADERBOARD_RULE_VALUES = ["normal", "hard", "loveChain"];

// ランキング対応のカテゴリー（index.htmlのcategory-filterラジオボタンの値とそのまま一致）。
export const LEADERBOARD_CATEGORY_VALUES = ["title-track", "title-and-group", "all"];

// ランキングへ書き込んでよい記録かどうかを検証する。
// 【本人指示・2026-08-16】ルールを問わず「1問でも間違えたプレイは公開ランキングに載らない」を
// 絶対条件にする。missCountは、そのプレイ全体を通して1回でも不正解の選択肢を選んだ回数の
// 合計（js/timeAttackScreen.jsのmissCount）。timeAttackにはスキップ・未回答の概念が無いため
// （skippedCountは常に0、js/timeAttackScreen.jsのbuildAchievementResultInput参照）、
// missCount === 0であれば「全問正解・誤答0・未回答0」の完全クリアを意味する。
export function isValidLeaderboardCandidate({ clearTimeMs, missCount }) {
  return (
    Number.isFinite(clearTimeMs) &&
    clearTimeMs > 0 &&
    Number.isFinite(missCount) &&
    missCount === 0
  );
}

// variant×rule×questionCount×categoryの組み合わせから、Firebase Realtime Databaseの
// パスを組み立てる。
export function buildLeaderboardPath(variant, rule, questionCountValue, categoryFilterValue) {
  return `timeAttackLeaderboardsV2/${variant}/${rule}/${questionCountValue}/${categoryFilterValue}`;
}

// 1件の記録（自分の今回のプレイ結果）から、Firebaseに保存するpayloadを組み立てる。
// uidは呼び出し側がFirebaseのキーとして使うため、payload本文には含めない
// （本人指示：「可能ならUIDを記録本文へ重複保存せずキーとして使う」）。
// achievedAtはFirebaseのserverTimestamp()をそのまま渡せるよう、呼び出し側に委ねる
// （このファイルはFirebaseの型を一切知らない）。
export function buildLeaderboardEntryPayload({ displayName, oshiMemberId, clearTimeMs, missCount, achievedAt }) {
  return {
    displayName: typeof displayName === "string" && displayName.trim() !== "" ? displayName.trim() : "名無しのファン",
    oshiMemberId: oshiMemberId ?? null,
    clearTimeMs,
    missCount,
    achievedAt,
  };
}

// 新しい記録が、既存の自己ベスト記録より「良い」かどうかを判定する。
// existingEntryがnull（まだ記録が無い）なら常にtrue。
// 比較基準：①クリアタイムが短い方が良い、②同タイムならミス数が少ない方が良い、
// ③完全に同一（タイム・ミス数とも同じ）なら「良くなっていない」として上書きしない
// （すでにある記録の登録日時をむやみに更新しないため）。
export function isBetterLeaderboardRecord(existingEntry, candidate) {
  if (!existingEntry) return true;
  if (candidate.clearTimeMs !== existingEntry.clearTimeMs) {
    return candidate.clearTimeMs < existingEntry.clearTimeMs;
  }
  return candidate.missCount < existingEntry.missCount;
}

// Firebaseから読み込んだ生データ（uidをキーとするオブジェクト、または個別の1件）を、
// 型が壊れていても安全な形へ正規化する（js/publicProfilePayloads.jsのnormalizePublicProfileEntry
// と同じ考え方。他人が意図的に不正な値を書き込んでいた場合でも画面が壊れないようにする）。
export function normalizeLeaderboardEntry(uid, raw) {
  if (!raw || typeof raw !== "object") return null;
  const clearTimeMs = Number(raw.clearTimeMs);
  if (!Number.isFinite(clearTimeMs) || clearTimeMs < 0) return null;

  const missCountRaw = Number(raw.missCount);
  const missCount = Number.isFinite(missCountRaw) && missCountRaw >= 0 ? missCountRaw : 0;

  return {
    uid,
    displayName: typeof raw.displayName === "string" && raw.displayName.trim() !== "" ? raw.displayName : "名無しのファン",
    oshiMemberId: typeof raw.oshiMemberId === "string" ? raw.oshiMemberId : null,
    clearTimeMs,
    missCount,
    // achievedAtはFirebaseのserverTimestampがミリ秒数値として保存される想定。
    // 数値でなければ、ソートの安定性のためだけに0（＝最も古い扱い）にフォールバックする。
    achievedAt: typeof raw.achievedAt === "number" ? raw.achievedAt : 0,
  };
}

// ローカルのタイムアタック履歴（js/timeAttackHistory.js）から、
// variant×rule×questionCount×categoryの組み合わせごとに、条件を満たす（全問正解・誤答0・
// 未回答0の）最速のクリア記録を1件ずつ抽出する（2026-08-07追加、2026-08-16に
// ルール・カテゴリー別の抽出へ拡張）。
// 【本人指示の背景】ランキングへの送信は「新記録を出した瞬間」だけに起きる設計のため、
// 「フレンド」を後からONにした人・すでにONだった人の既存の自己ベストは、そのままでは
// ランキングに一切反映されない。このズレを解消するため、履歴から「もし今日この条件で
// ランキング機能があったら新記録だったはずの記録」を掘り起こす。
export function findBestEntryPerVariantRuleQuestionCountAndCategory(historyEntries) {
  const bestByKey = new Map();
  historyEntries.forEach((entry) => {
    if (!entry.completed) return;
    if (!isValidLeaderboardCandidate({ clearTimeMs: entry.totalElapsedMs, missCount: entry.missCount })) return;
    const variant = entry.variant ?? "intro";
    const key = `${variant}.${entry.rule}.${entry.questionCountValue}.${entry.categoryFilterValue}`;
    const current = bestByKey.get(key);
    if (!current || entry.totalElapsedMs < current.clearTimeMs) {
      bestByKey.set(key, {
        variant,
        rule: entry.rule,
        questionCountValue: entry.questionCountValue,
        categoryFilterValue: entry.categoryFilterValue,
        clearTimeMs: entry.totalElapsedMs,
        missCount: entry.missCount,
      });
    }
  });
  return [...bestByKey.values()];
}

// 複数の記録（正規化済み）を、ランキング表示順に並び替える。
// ①クリアタイム昇順②ミス数昇順③登録日時昇順（早い者勝ち）。
export function sortLeaderboardEntries(entries) {
  return [...entries].sort((a, b) => {
    if (a.clearTimeMs !== b.clearTimeMs) return a.clearTimeMs - b.clearTimeMs;
    if (a.missCount !== b.missCount) return a.missCount - b.missCount;
    return a.achievedAt - b.achievedAt;
  });
}

// 並び替え済みの配列の中で、指定したuidが何位か（1始まり）を返す。見つからなければnull。
export function findRankByUid(sortedEntries, uid) {
  const index = sortedEntries.findIndex((entry) => entry.uid === uid);
  return index === -1 ? null : index + 1;
}
