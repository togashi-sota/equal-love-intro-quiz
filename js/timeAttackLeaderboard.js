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
// （本人指示：出題数は5問・10問・20問・50問・全曲の5種類、カテゴリーは表題曲のみ／
// 表題曲＋全員曲／全曲の3種類、すべてを対象にする＝2×5×3の30パターン。出題数の「全曲」と
// カテゴリーの「全曲」は別の軸で、既存クイズ側と同じ意味＝「そのカテゴリー内で現在出題
// 可能な全曲をプレイする」を維持する。既存クイズのcategory-filterラジオボタンの値
// （"title-track"|"title-and-group"|"all"）をそのまま使い、新しい値は作らない）。
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
// 【2026-08-16再改訂・本人指示】一度5問・10問だけに絞ったが、「5/10/20/50/全曲すべてを
// ランキング対象にしてほしい」という指示により、元の5種類全てに戻した。カテゴリーの
// 絞り込み（表題のみ／表題＋全員曲だけ、「全曲」は対象外）はそのまま維持する。
export const LEADERBOARD_QUESTION_COUNT_VALUES = ["5", "10", "20", "50", "all"];

// ランキング記録に「参考情報として」残すルールの値（js/timeAttackScreen.jsのTIME_ATTACK_RULEと
// 同じ文字列をあえて複製している。このファイルをFirebase非依存の恒久テスト対象に保つ設計方針を
// 維持するため、LEADERBOARD_QUESTION_COUNT_VALUESと同じ考え方）。
// 【2026-08-16改訂】もはやランキングの区分（Firebaseパスの階層）には使わない。表示用の値。
export const LEADERBOARD_RULE_VALUES = ["normal", "hard", "loveChain"];

// ランキング対応のカテゴリー（index.htmlのcategory-filterラジオボタンの値とそのまま一致）。
// 【2026-08-16再改訂・本人指示】一度「全曲」を対象外にしたが、本人指示により表題曲のみ／
// 表題曲＋全員曲／全曲の3種類すべてを対象に戻した。
export const LEADERBOARD_CATEGORY_VALUES = ["title-track", "title-and-group", "all"];

// ランキング記録に「参考情報として」残す、プレイ方法の値。
// timeAttack：タイムアタックから送信された記録。normal：通常クイズ（通常イントロ／
// 通常ランダム再生）から送信された記録。ランキングの区分には使わず、任意のバッジ表示にだけ使う
// （本人指示：rank/name/timeの表示を優先し、UIが窮屈にならない範囲でだけ表示してよい）。
export const LEADERBOARD_SOURCE_VALUES = ["timeAttack", "normal"];

// 出題数・カテゴリーが、現在ランキングに対応している組み合わせかどうかを判定する。
// 【2026-08-16再改訂】出題数（5/10/20/50/全曲）・カテゴリー（表題曲のみ/表題曲＋全員曲/全曲）
// のどちらも既存クイズの全ラジオボタン値をそのまま対象にするため、実質的にはこの2つの値一覧に
// 定義されている値かどうかのチェックになる。将来どちらかの次元をまた絞ることになった場合に
// 備えて、判定ロジック自体はそのまま残しておく（呼び出し側を変更せずに済むように）。
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
// 【2026-08-29追加、本人指示】実際に出題された問題数をactualQuestionCountとして記録に残す。
// これが無いと、出題数「全曲」の記録は「1問あたりの平均タイム」を一切計算できない
// （曲数はカタログの更新で変わるため、後から現在の曲数で割り算すると不正確になる）。
// 呼び出し側が渡さなかった（undefined）場合や不正な値の場合はnullのまま保存し、
// 表示側は既存のcomputeAverageSecondsPerQuestion／findVerifiedAllModeAverageSecondsに
// フォールバックする（古い記録・この値を渡さない呼び出し元があっても壊れない）。
export function buildLeaderboardEntryPayload({
  displayName,
  oshiMemberId,
  clearTimeMs,
  missCount,
  rule,
  source,
  achievedAt,
  actualQuestionCount,
}) {
  const normalizedActualQuestionCount = Number(actualQuestionCount);
  return {
    displayName: typeof displayName === "string" && displayName.trim() !== "" ? displayName.trim() : "名無しのファン",
    oshiMemberId: oshiMemberId ?? null,
    clearTimeMs,
    missCount,
    rule: LEADERBOARD_RULE_VALUES.includes(rule) ? rule : null,
    source: LEADERBOARD_SOURCE_VALUES.includes(source) ? source : null,
    achievedAt,
    actualQuestionCount:
      Number.isFinite(normalizedActualQuestionCount) && normalizedActualQuestionCount > 0
        ? normalizedActualQuestionCount
        : null,
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

// 【2026-08-29追加、本人指示】タイム・ミス数が既存記録と全く同じで「更新なし」と判定される
// 場合でも、既存記録に欠けているactualQuestionCount（実際に出題された問題数）だけは
// 後から補えるかどうかを判定する。
// 【なぜ必要か】isBetterLeaderboardRecord()は「登録日時をむやみに更新しない」ため、タイム・
// ミス数が同じ記録の再送信を常に「更新なし」として弾く。これは正しい設計だが、
// actualQuestionCountの記録開始（2026-08-29）より前に登録された記録は、この判定のせいで
// 永久にactualQuestionCountを補えなくなってしまう（＝平均タイムが一生表示されないバグ）。
// 平均タイム表示にしか使わない項目なので、「タイム・ミス数はそのまま・この項目だけ後から
// 書き足す」という部分更新を許可する。既存記録がすでに値を持っていれば（＝間違った値で
// 上書きする心配がない場合でも）触らない。
export function needsActualQuestionCountBackfill(existingEntry, candidate) {
  if (!existingEntry) return false;
  if (existingEntry.actualQuestionCount) return false;
  if (!Number.isFinite(candidate?.actualQuestionCount) || candidate.actualQuestionCount <= 0) return false;
  return existingEntry.clearTimeMs === candidate.clearTimeMs && existingEntry.missCount === candidate.missCount;
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

  // actualQuestionCountを保存する前の古い記録にはこの項目自体が存在しないため、
  // その場合はnullのまま返す（表示側がフォールバック計算に切り替える合図になる）。
  const actualQuestionCountRaw = Number(raw.actualQuestionCount);
  const actualQuestionCount =
    Number.isFinite(actualQuestionCountRaw) && actualQuestionCountRaw > 0 ? actualQuestionCountRaw : null;

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
    actualQuestionCount,
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
// categoryであればノーマル/ハード/LOVE連チャンをまたいで最速の1件だけを残す。万が一
// 定義されていない値が履歴に混ざっていた場合に備え、isSupportedLeaderboardDimension()で
// 対応外の組み合わせを弾く処理は残す（本人指示：対応外の次元は絶対に送信しない）。
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
        // 2026-08-29追加：js/timeAttackHistory.jsのsaveTimeAttackHistoryEntry()が保存する
        // questions配列の件数＝その回に実際に出題された問題数（perQuestionResultsそのまま）。
        actualQuestionCount: Array.isArray(entry.questions) ? entry.questions.length : null,
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

// 1問あたりの平均タイム（秒）を計算する（2026-08-24追加、本人指示）。
// 【なぜ出題数「全曲」は対象外か】ランキング記録には実際に出題された曲数が保存されておらず、
// 「全曲」の曲数はカタログの更新で時期によって変わる（例：本セッション中だけでも81→82曲に増加）。
// 現在の曲数を使って割り算すると、記録が作られた時点の実際の出題数とズレて不正確な平均を
// 表示してしまう恐れがあるため、questionCountValueが固定値（5/10/20/50）の記録だけを対象にする。
// 【安全性】この関数はclearTimeMsを一切書き換えない・保存もしない、表示専用の計算にとどめる
// （本人指示：既存のランキング順位・保存済みクリアタイムには一切影響させない）。
export function computeAverageSecondsPerQuestion(clearTimeMs, questionCountValue) {
  if (questionCountValue === "all") return null;
  const questionCount = Number(questionCountValue);
  if (!Number.isFinite(questionCount) || questionCount <= 0) return null;
  if (!Number.isFinite(clearTimeMs) || clearTimeMs <= 0) return null;
  return clearTimeMs / 1000 / questionCount;
}

// 【2026-08-24追加、本人指示の特例】出題数「全曲」は通常は自動計算しない（実際の出題数が
// 記録に残っておらず、曲数も時期によって変わるため）。ただし本人が自分のプレイ履歴画面
// （実際の出題数が残っている）から実際の値を確認できた記録だけ、ここに手動で登録して
// 表示する。variant×questionCountValue×categoryFilterValue×clearTimeMsの完全一致（微小な
// 誤差だけ許容）で照合するため、対象の記録が新しいタイムに更新された場合は自動的に
// 一致しなくなり、古い（もう正しくない）平均を表示し続けることがないようにしている。
const VERIFIED_ALL_MODE_RECORDS = [
  {
    // 2026-08-16 01:47のタイムアタック（本人のプレイ履歴画面で確認：81問中81問正解、
    // 経過時間137.03秒）。本人指示により、この1件だけ特例として表示する。
    variant: "intro",
    questionCountValue: "all",
    categoryFilterValue: "all",
    clearTimeMs: 137029.00000000026,
    actualQuestionCount: 81,
  },
];

export function findVerifiedAllModeAverageSeconds(variant, questionCountValue, categoryFilterValue, clearTimeMs) {
  const match = VERIFIED_ALL_MODE_RECORDS.find(
    (entry) =>
      entry.variant === variant &&
      entry.questionCountValue === questionCountValue &&
      entry.categoryFilterValue === categoryFilterValue &&
      Math.abs(entry.clearTimeMs - clearTimeMs) < 1
  );
  return match ? clearTimeMs / 1000 / match.actualQuestionCount : null;
}

// 【2026-08-29追加、本人指示】出題数「全曲」の記録で平均タイムが表示されないバグの修正。
// 根本原因：記録に「実際に出題された問題数」が保存されておらず、questionCountValueが
// "all"の記録は計算しようがなかった（VERIFIED_ALL_MODE_RECORDSの手作業リストでしか
// 表示できていなかった）。今後の記録にはactualQuestionCountを保存するようにしたため
// （buildLeaderboardEntryPayload参照）、表示側はこの関数を優先的に使う。
// 優先順位：①記録自身が持つactualQuestionCount（今後の記録・バックフィル分）
// →②questionCountValueが固定値（5/10/20/50）の記録は既存の計算式
// →③手作業で確認済みの旧「全曲」記録（VERIFIED_ALL_MODE_RECORDS）
// →④どれにも該当しなければnull（無理に表示しない）。
// 既存の3関数（computeAverageSecondsPerQuestion等）はそのまま残し、この関数はそれらを
// 組み合わせるだけの表示専用ラッパーにとどめる（clearTimeMs等の保存データは一切書き換えない）。
export function resolveAverageSecondsPerQuestion(entry, variant, questionCountValue, categoryFilterValue) {
  if (Number.isFinite(entry?.actualQuestionCount) && entry.actualQuestionCount > 0) {
    return entry.clearTimeMs / 1000 / entry.actualQuestionCount;
  }
  return (
    computeAverageSecondsPerQuestion(entry.clearTimeMs, questionCountValue) ??
    findVerifiedAllModeAverageSeconds(variant, questionCountValue, categoryFilterValue, entry.clearTimeMs)
  );
}
