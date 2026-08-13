// タイムアタックのグローバルランキング（TOP10）に関する、Firebaseに一切触れない純粋関数群。
// Firebaseへの実際の読み書きはjs/timeAttackLeaderboardSync.jsが担当する
// （js/publicProfilePayloads.js・js/publicProfileSync.jsと同じファイル分割方針。
// 恒久テストがFirebase初期化を発生させないようにするため）。
//
// 【ランキングの分離方針】出題タイプ(variant)×出題数(questionCountValue)の組み合わせごとに
// 完全に別々のランキングとして扱う（5問と50問を混ぜない、イントロとランダム再生を混ぜない）。
// カテゴリ・ルールはランキングの分離対象にしない（本人指示：variant×questionCountだけで分離）。
//
// 【記録の比較基準】クリアタイム昇順（速い方が上位）。同タイムは①クリアタイム②ミス数
// ③登録日時（早い方が上位）の順で決める（本人の第一候補どおり）。

// タイムアタックの出題数のうち、ランキング対応の値。既存のtime-attack-question-countの
// ラジオボタンの値（"5"|"10"|"20"|"50"|"all"）とそのまま一致させている。
export const LEADERBOARD_QUESTION_COUNT_VALUES = ["5", "10", "20", "50", "all"];

// ランキング（TOP10表示・自己記録送信）の対象として認める唯一のルール。
// 【本人指示・緊急メンテ2026-08-13】ノーマル/ハードは出題数固定・連打で速く終えやすく、
// 全問ノーミス必須のLOVE連チャンと同じ枠で速さを比べると不公平になる。そのため公開ランキングは
// LOVE連チャンの記録だけを対象にする。ノーマル/ハードは今までどおり遊べて自己ベスト・履歴には
// 保存されるが、公開ランキングへは一切送信しない。
// js/timeAttackScreen.jsのTIME_ATTACK_RULE.LOVE_CHAINと同じ文字列をあえて複製している
// （このファイルをFirebase非依存の恒久テスト対象に保つ設計方針を維持するため。
// LEADERBOARD_QUESTION_COUNT_VALUESと同じ考え方）。
const LEADERBOARD_ELIGIBLE_RULE = "loveChain";

export function isRuleEligibleForLeaderboard(rule) {
  return rule === LEADERBOARD_ELIGIBLE_RULE;
}

// ランキングへ書き込んでよい記録かどうかを検証する。
// 【本人指示】不正な0秒以下・NaN・不正なミス数がランキングに登録されないことを保証すること。
export function isValidLeaderboardCandidate({ clearTimeMs, missCount }) {
  return (
    Number.isFinite(clearTimeMs) &&
    clearTimeMs > 0 &&
    Number.isFinite(missCount) &&
    missCount >= 0
  );
}

// variant×questionCountの組み合わせから、Firebase Realtime Databaseのパスを組み立てる。
// timeAttackLeaderboards/{variant}/{questionCountValue}/{uid} という構造（本人指定）。
export function buildLeaderboardPath(variant, questionCountValue) {
  return `timeAttackLeaderboards/${variant}/${questionCountValue}`;
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

// ローカルのタイムアタック履歴（js/timeAttackHistory.js）から、variant×questionCountの
// 組み合わせごとに最速のクリア記録を1件ずつ抽出する（2026-08-07追加）。
// 【本人指示の背景】ランキングへの送信は「新記録を出した瞬間」だけに起きる設計のため、
// 「みんなのプロフィール」を後からONにした人・すでにONだった人の既存の自己ベストは、
// そのままではランキングに一切反映されない。このズレを解消するため、履歴から
// 「もし今日ランキング機能があったら新記録だったはずの記録」を掘り起こす。
// ランキング自体はルール・カテゴリを分けない設計（本人指示：variant×questionCountだけで分離）
// のため、ここでもルール・カテゴリを問わず、同じvariant×questionCountの中で最も速かった
// 1件（LOVE連チャン失敗等、完走していない記録は除く）だけを残す。
export function findBestEntryPerVariantAndQuestionCount(historyEntries) {
  const bestByKey = new Map();
  historyEntries.forEach((entry) => {
    if (!entry.completed) return;
    // 【2026-08-13追加】ランキング対象外のルール（ノーマル/ハード）の履歴は、
    // バックフィル（過去の自己ベストをランキングへ反映する処理）でも一切対象にしない。
    if (!isRuleEligibleForLeaderboard(entry.rule)) return;
    const variant = entry.variant ?? "intro";
    const key = `${variant}.${entry.questionCountValue}`;
    const current = bestByKey.get(key);
    if (!current || entry.totalElapsedMs < current.clearTimeMs) {
      bestByKey.set(key, {
        variant,
        questionCountValue: entry.questionCountValue,
        rule: entry.rule,
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
