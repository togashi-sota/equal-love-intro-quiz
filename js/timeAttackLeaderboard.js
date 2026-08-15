// タイムアタックのグローバルランキング（TOP10）に関する、Firebaseに一切触れない純粋関数群。
// Firebaseへの実際の読み書きはjs/timeAttackLeaderboardSync.jsが担当する
// （js/publicProfilePayloads.js・js/publicProfileSync.jsと同じファイル分割方針。
// 恒久テストがFirebase初期化を発生させないようにするため）。
//
// 【2026-08-16再改訂・本人指示】「タイムアタックだけのランキング」から、「通常のイントロクイズ・
// 通常のランダム再生クイズでも、ノーミス完走ならランキングへ参加できる」仕組みへ拡張した。
// これに伴い、ルール（ノーマル/ハード/LOVE連チャン）は掲載可否にも区分にも一切関係なくなった
// （「1問でも間違えたプレイは載らない」を満たしていれば、どのルールで遊んだかは問わず
// 同じランキングで比較する）。ruleはあくまで「どのルールで出したタイムか」を表示するための
// 参考情報として記録には残すが、ランキングを分ける基準にはしない。
// 同じ理由で、出題した方法（通常クイズ／タイムアタック）も区分の基準にはしない
// （sourceとして記録には残すが、任意のバッジ表示にだけ使う）。
//
// 【分離方針】出題タイプ(variant：イントロ／ランダム再生)×出題数(questionCountValue)×
// カテゴリー(categoryFilterValue)の組み合わせごとに完全に別々のランキングとして扱う
// （本人指示によりシンプル化：出題数は5問・10問のみ、カテゴリーは表題曲のみ／表題曲＋全員曲の
// みを対象にする。20問・50問・全曲、カテゴリー「全曲」は対象外のまま）。
//
// 【記録の比較基準】クリアタイム昇順（速い方が上位）。同タイムは①クリアタイム②ミス数
// ③登録日時（早い方が上位）の順で決める（本人の第一候補どおり、変更なし）。
//
// 【旧データとの互換性】以前の構造（timeAttackLeaderboardsV2/{variant}/{rule}/{questionCountValue}/
// {categoryFilterValue}/{uid}、ルールごとに別ランキング）は、この新しい構造とは別の場所
// （トップレベルのキー名をtimeAttackLeaderboardsV3に変える）に置く。旧データは削除せず、
// 単に新しいコードからは一切参照しない（本人指示：既存データを誤って新しい構造へ混ぜない。
// V1→V2のときと同じ安全なやり方を踏襲）。

// タイムアタックの出題数のうち、ランキング対応の値。既存のtime-attack-question-countの
// ラジオボタンの値と一致させている。
// 【2026-08-16改訂・本人指示】5問・10問だけに絞った（20問・50問・全曲はランキング対象外。
// 通常クイズは「次へ」ボタンでの手動進行があり、20問以上では公平な比較になりにくいため）。
export const LEADERBOARD_QUESTION_COUNT_VALUES = ["5", "10"];

// ランキング記録に「参考情報として」残すルールの値（js/timeAttackScreen.jsのTIME_ATTACK_RULEと
// 同じ文字列をあえて複製している。このファイルをFirebase非依存の恒久テスト対象に保つ設計方針を
// 維持するため、LEADERBOARD_QUESTION_COUNT_VALUESと同じ考え方）。
// 【2026-08-16改訂】もはやランキングの区分（Firebaseパスの階層）には使わない。表示用の値。
export const LEADERBOARD_RULE_VALUES = ["normal", "hard", "loveChain"];

// ランキング対応のカテゴリー（index.htmlのcategory-filterラジオボタンの値とそのまま一致）。
// 【2026-08-16改訂・本人指示】表題曲のみ／表題曲＋全員曲だけに絞った（カテゴリー「全曲」は対象外）。
export const LEADERBOARD_CATEGORY_VALUES = ["title-track", "title-and-group"];

// ランキング記録に「参考情報として」残す、プレイ方法の値。
// timeAttack：タイムアタックから送信された記録。normal：通常クイズ（通常イントロ／
// 通常ランダム再生）から送信された記録。ランキングの区分には使わず、任意のバッジ表示にだけ使う
// （本人指示：rank/name/timeの表示を優先し、UIが窮屈にならない範囲でだけ表示してよい）。
export const LEADERBOARD_SOURCE_VALUES = ["timeAttack", "normal"];

// 出題数・カテゴリーが、現在ランキングに対応している組み合わせかどうかを判定する。
// 【本人指示・セクション9,10】ランキングの次元は出題数(5/10)×カテゴリー(表題曲のみ/表題曲＋全員曲)
// だけに絞り、20問・50問・全曲・カテゴリー「全曲」は既存のラジオボタン値のまま
// （新しい値を作らない）対象外として弾く。
export function isSupportedLeaderboardDimension(questionCountValue, categoryFilterValue) {
  return (
    LEADERBOARD_QUESTION_COUNT_VALUES.includes(questionCountValue) &&
    LEADERBOARD_CATEGORY_VALUES.includes(categoryFilterValue)
  );
}

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

// variant×questionCount×categoryの組み合わせから、Firebase Realtime Databaseの
// パスを組み立てる。【2026-08-16改訂】ruleはもう区分に使わないため、パスから除いた
// （timeAttackLeaderboardsV2→V3）。
export function buildLeaderboardPath(variant, questionCountValue, categoryFilterValue) {
  return `timeAttackLeaderboardsV3/${variant}/${questionCountValue}/${categoryFilterValue}`;
}

// 1件の記録（自分の今回のプレイ結果）から、Firebaseに保存するpayloadを組み立てる。
// uidは呼び出し側がFirebaseのキーとして使うため、payload本文には含めない
// （本人指示：「可能ならUIDを記録本文へ重複保存せずキーとして使う」）。
// achievedAtはFirebaseのserverTimestamp()をそのまま渡せるよう、呼び出し側に委ねる
// （このファイルはFirebaseの型を一切知らない）。
// ruleとsourceは区分には使わないが、任意のバッジ表示・参考情報のために記録へ残す
// （2026-08-16追加）。
export function buildLeaderboardEntryPayload({
  displayName,
  oshiMemberId,
  clearTimeMs,
  missCount,
  rule,
  source,
  achievedAt,
}) {
  return {
    displayName: typeof displayName === "string" && displayName.trim() !== "" ? displayName.trim() : "名無しのファン",
    oshiMemberId: oshiMemberId ?? null,
    clearTimeMs,
    missCount,
    rule: LEADERBOARD_RULE_VALUES.includes(rule) ? rule : null,
    source: LEADERBOARD_SOURCE_VALUES.includes(source) ? source : null,
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
    rule: LEADERBOARD_RULE_VALUES.includes(raw.rule) ? raw.rule : null,
    source: LEADERBOARD_SOURCE_VALUES.includes(raw.source) ? raw.source : null,
    // achievedAtはFirebaseのserverTimestampがミリ秒数値として保存される想定。
    // 数値でなければ、ソートの安定性のためだけに0（＝最も古い扱い）にフォールバックする。
    achievedAt: typeof raw.achievedAt === "number" ? raw.achievedAt : 0,
  };
}

// ローカルのタイムアタック履歴（js/timeAttackHistory.js）から、
// variant×questionCount×categoryの組み合わせごとに、条件を満たす（全問正解・誤答0・
// 未回答0の）最速のクリア記録を1件ずつ抽出する（2026-08-07追加、2026-08-16にルールを
// 問わず統合する形へ再改訂）。
// 【本人指示の背景】ランキングへの送信は「新記録を出した瞬間」だけに起きる設計のため、
// 「フレンド」を後からONにした人・すでにONだった人の既存の自己ベストは、そのままでは
// ランキングに一切反映されない。このズレを解消するため、履歴から「もし今日この条件で
// ランキング機能があったら新記録だったはずの記録」を掘り起こす。
// 【2026-08-16改訂】ルールはもう区分に使わないため、キーから外し、同じvariant×questionCount×
// categoryであればノーマル/ハード/LOVE連チャンをまたいで最速の1件だけを残す。また、
// 20問・50問・全曲・カテゴリー「全曲」など新しいランキングが対応しない組み合わせは、
// isSupportedLeaderboardDimension()で確実に弾く（本人指示：対応外の次元は絶対に送信しない）。
export function findBestEntryPerVariantQuestionCountAndCategory(historyEntries) {
  const bestByKey = new Map();
  historyEntries.forEach((entry) => {
    if (!entry.completed) return;
    if (!isValidLeaderboardCandidate({ clearTimeMs: entry.totalElapsedMs, missCount: entry.missCount })) return;
    if (!isSupportedLeaderboardDimension(entry.questionCountValue, entry.categoryFilterValue)) return;
    const variant = entry.variant ?? "intro";
    const key = `${variant}.${entry.questionCountValue}.${entry.categoryFilterValue}`;
    const current = bestByKey.get(key);
    if (!current || entry.totalElapsedMs < current.clearTimeMs) {
      bestByKey.set(key, {
        variant,
        questionCountValue: entry.questionCountValue,
        categoryFilterValue: entry.categoryFilterValue,
        clearTimeMs: entry.totalElapsedMs,
        missCount: entry.missCount,
        rule: entry.rule,
        source: "timeAttack",
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
