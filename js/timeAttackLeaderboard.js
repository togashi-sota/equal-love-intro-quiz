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
// 【2026-09-22追加：論理ユーザー識別キー identityKey（ランキング重複の恒久対策）】
// ランキングの記録は「Firebase匿名認証のUID」をキーに保存している（同じUIDなら set() で上書き＝
// 二重送信しても1件のまま）。しかしこのアプリでは匿名UIDが差し替わることがある
// （Firebase側の匿名アカウント自動削除〈HANDOFF 116章〉、機種変更・復旧によるバックアップの
// 引き継ぎ）。UIDが変わっても端末内の自己ベスト（rankingCandidateBest）はそのまま残るため、
// 新UIDで同じ記録が自動再送信され、旧UIDの記録と並んで「同じ人が2人」見えていた（2026-09-22 実機で
// じゅ・サブ・Olkya の3人に再発。前回〈がしお〉の修正は「旧UID→新UIDの対応が分かる端末だけ・本人が
// フレンド画面で手動実行」だったため、対応が取れない端末では防げなかった）。
// 対策の第一線：各記録に identityKey（UIDに依存しない「同じ人」の印）を保存する。値は backupId
// （crypto.randomUUID 由来・UIDが変わっても引き継がれる・バックアップ復元でも同じ値になる）の
// SHA-256 ハッシュ。backupId そのものは引き継ぎコードの一部になる値のため公開しない（ハッシュは一方向）。
// 第二線：表示時に identityKey が同じ記録は最良の1件だけを残す（dedupeLeaderboardEntriesByIdentity）。
// 【絶対に名前で同一人物と判断しない】同名の別人（identityKey が違う／無い）は別々に載せる。
// 旧記録（identityKey 無し）は互いに別人として扱う（誤統合しない側に倒す）。
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

// TOP10 として表示する件数と、同一人物の重複を統合する前にサーバーから取得する件数
// （2026-09-22追加）。identityKey が同じ記録を統合すると10件に満たなくなる可能性があるため、
// 少し多めに取得してから統合し、先頭10件だけを表示する（全件ダウンロードはしない）。
export const LEADERBOARD_TOP_DISPLAY_COUNT = 10;
export const LEADERBOARD_TOP_FETCH_LIMIT = 30;
// 【2026-09-22追加】ページ取得の上限ページ数（30件×20ページ＝600件まで。無限取得を防ぐ安全弁。
// 現在の総記録数は1区分あたり10件前後なので、通常は1ページで終わる）。
export const LEADERBOARD_TOP_MAX_PAGES = 20;

// identityKey として受け付ける長さ（SHA-256 の16進64文字。Rules の .validate と同じ範囲）。
const IDENTITY_KEY_MIN_LENGTH = 16;
const IDENTITY_KEY_MAX_LENGTH = 64;

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
// 【2026-09-22追加】identityKey（論理ユーザー識別キー）を渡すと記録に含める。無い（null）ときは
// キー自体を付けない（Rules の .validate は「無い or 文字列」を受け付ける。null を入れると
// 旧Rulesで拒否されるため、存在しない形にそろえる）。
export function buildLeaderboardEntryPayload({
  displayName,
  oshiMemberId,
  clearTimeMs,
  missCount,
  rule,
  source,
  achievedAt,
  actualQuestionCount,
  identityKey = null,
}) {
  const normalizedActualQuestionCount = Number(actualQuestionCount);
  const payload = {
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
  if (isValidLeaderboardIdentityKey(identityKey)) payload.identityKey = identityKey;
  return payload;
}

// identityKey の形式チェック（16〜64文字の英数字）。Firebase から読んだ値・自分で作った値の両方に使う。
export function isValidLeaderboardIdentityKey(value) {
  return (
    typeof value === "string" &&
    value.length >= IDENTITY_KEY_MIN_LENGTH &&
    value.length <= IDENTITY_KEY_MAX_LENGTH &&
    /^[0-9a-zA-Z]+$/.test(value)
  );
}

// backupId → identityKey（SHA-256 の16進文字列）。同じ backupId からは必ず同じ値になり（決定的）、
// 値から backupId を逆算することはできない。crypto.subtle が使えない環境（非セキュアコンテキスト等）や
// backupId が無い場合は null（＝記録に identityKey を付けない。従来どおりの記録になるだけで壊れない）。
// subtle は差し替え可能（テストで「使えない環境」を再現するため）。
export async function computeLeaderboardIdentityKey(backupId, subtle = globalThis.crypto?.subtle) {
  if (typeof backupId !== "string" || backupId.length < 8) return null;
  if (!subtle || typeof subtle.digest !== "function") return null;
  try {
    const bytes = new TextEncoder().encode(`equalLoveIntroQuiz.leaderboardIdentity.v1:${backupId}`);
    const digest = await subtle.digest("SHA-256", bytes);
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return isValidLeaderboardIdentityKey(hex) ? hex : null;
  } catch {
    return null;
  }
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

// 【2026-09-22追加】既存の自分の記録（同じUID）に identityKey が無く、今回は分かっている場合だけ
// 後から書き足せるかを判定する。タイム・ミス数は問わない（自分のUIDの記録は必ず自分のものなので、
// キーを付けても他人の記録と混ざることはない）。既に値があれば触らない。
export function needsIdentityKeyBackfill(existingEntry, identityKey) {
  if (!existingEntry) return false;
  if (isValidLeaderboardIdentityKey(existingEntry.identityKey)) return false;
  return isValidLeaderboardIdentityKey(identityKey);
}

// 【2026-09-22追加】「今回の記録をどう保存するか」を1箇所で決める純粋関数（保存処理の冪等性の要）。
// 戻り値：
//   { action: "set" }                     … 新記録（既存より速い／既存なし）→ 記録全体を set() で置き換える
//   { action: "update", fields: {...} }   … 新記録ではないが、欠けている項目（identityKey・
//                                            actualQuestionCount）だけを update() で書き足す
//   { action: "none" }                    … 何もしない（同じ記録の再送信・遅い記録）
// 同じUID・同じ区分の記録は必ずこの1件に集約されるため、同じ結果保存が2回・3回呼ばれても
// 記録が増えることはない（キーがUIDで、push() を使わないため）。
export function resolveLeaderboardWritePlan({ existingEntry, candidate, identityKey = null }) {
  if (isBetterLeaderboardRecord(existingEntry, candidate)) return { action: "set" };
  const fields = {};
  if (needsActualQuestionCountBackfill(existingEntry, candidate)) fields.actualQuestionCount = candidate.actualQuestionCount;
  if (needsIdentityKeyBackfill(existingEntry, identityKey)) fields.identityKey = identityKey;
  return Object.keys(fields).length > 0 ? { action: "update", fields } : { action: "none" };
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
    // 2026-09-22追加：無い・壊れている場合は null（＝他のどの記録とも同一人物とは判断しない）
    identityKey: isValidLeaderboardIdentityKey(raw.identityKey) ? raw.identityKey : null,
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

// 【2026-09-22追加】同じ identityKey（＝同じ論理ユーザー）の記録が複数あれば、並び順で最初の1件
// （＝最良の記録）だけを残す。identityKey が無い記録は誰とも統合しない（旧記録・別人を守る）。
// 名前・推し・タイムの一致では絶対に統合しない（同名の別人が共存できるようにするため）。
// 入力は sortLeaderboardEntries() で並び替え済みであること（先頭＝最良）。
export function dedupeLeaderboardEntriesByIdentity(sortedEntries) {
  const seen = new Set();
  return sortedEntries.filter((entry) => {
    if (!isValidLeaderboardIdentityKey(entry.identityKey)) return true;
    if (seen.has(entry.identityKey)) return false;
    seen.add(entry.identityKey);
    return true;
  });
}

// 【2026-09-22追加】取得した記録を「並び替え → 同一人物の統合 → 先頭N件」の順で TOP 表示用に整える。
export function buildLeaderboardTopEntries(entries, displayCount = LEADERBOARD_TOP_DISPLAY_COUNT) {
  return dedupeLeaderboardEntriesByIdentity(sortLeaderboardEntries(entries)).slice(0, displayCount);
}

// 【2026-09-22追加：ページ取得で正しいユニークTOP10を作る】
// fetchPage(cursor) は「clearTimeMs 昇順の1ページ」を返す非同期関数：{ entries: [正規化済み], nextCursor: any|null }
//   nextCursor が null ならデータの終わり。cursor の中身はこの関数は解釈しない（Firebase側の startAt 用）。
// 「同一人物（identityKey）の統合後にユニークが displayCount 人そろう」か「データが尽きる」か
// 「maxPages に達する」まで次のページを取り続ける。固定30件では、上位30件に重複が大量にあると
// 31位以降の別ユーザーを取り損ねて真のTOP10が欠けるため（本人指摘）。
// 戻り値は並び替え → 統合 → 先頭 displayCount 件。
export async function collectUniqueTopEntries(
  fetchPage,
  { displayCount = LEADERBOARD_TOP_DISPLAY_COUNT, maxPages = LEADERBOARD_TOP_MAX_PAGES } = {}
) {
  const collected = [];
  let cursor = null;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await fetchPage(cursor);
    const entries = Array.isArray(result?.entries) ? result.entries : [];
    collected.push(...entries);
    const unique = dedupeLeaderboardEntriesByIdentity(sortLeaderboardEntries(collected));
    if (unique.length >= displayCount) return unique.slice(0, displayCount);
    if (!result?.nextCursor || entries.length === 0) break;
    cursor = result.nextCursor;
  }
  return buildLeaderboardTopEntries(collected, displayCount);
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
    // 【2026-08-30再確認】この記録の時点（コミット8e63fb9・2026-08-15の直後）のjs/data/songs.js
    // 全体の曲数は82曲だったが、実際の出題数81との差は、当時この端末でまだ音源を
    // インポートしていなかった曲が1曲あったためと考えられる（「全曲」モードの実際の出題数は
    // カタログの曲数ではなく、その端末に音源をインポート済みの曲数で決まる設計のため）。
    // 本人のプレイ履歴画面での実測値である81の方が、カタログの曲数より信頼できるため、
    // このまま変更しない。
    variant: "intro",
    questionCountValue: "all",
    categoryFilterValue: "all",
    clearTimeMs: 137029.00000000026,
    actualQuestionCount: 81,
  },
  // 【2026-08-30追加、本人指示】Firebase Rulesの不具合（2026-08-29〜08-30）により
  // actualQuestionCountが保存できていなかった既存記録3件を、git履歴から当時の
  // カタログ曲数を調査し、推定値として登録する（本人了承のうえでの推定）。
  // 音源インポート状況までは端末側の情報のためgit履歴だけでは検証できず、
  // 「当時のカタログ曲数」を実際の出題数の最有力な推定値として使っている
  // （がしおの記録で見られたとおり、実際はこれよりわずかに少ない可能性もある）。
  {
    // 「ぜんた」2026-08-28 22:30のタイムアタック（65.65秒、intro・全曲・表題曲のみ）。
    // この時点で最新だったjs/data/songsのコミットは6c5b943（2026-08-26）。
    // 表題曲カテゴリーの曲数は2026-07-25のカテゴリー3分類導入以降23曲のまま一度も
    // 変わっていない（本調査で確認済み）ため、他の記録より確度が高い推定値。
    variant: "intro",
    questionCountValue: "all",
    categoryFilterValue: "title-track",
    clearTimeMs: 65654.99999999988,
    actualQuestionCount: 23,
  },
  {
    // 「じゅ」2026-08-28 21:54のタイムアタック（175.88秒、intro・全曲・全曲カテゴリー）。
    // この時点で最新だったコミットは6c5b943（2026-08-26、全曲カタログ84曲）。
    variant: "intro",
    questionCountValue: "all",
    categoryFilterValue: "all",
    clearTimeMs: 175882.00000000047,
    actualQuestionCount: 84,
  },
  {
    // 「じゅ」2026-08-28 21:46のランダム再生タイムアタック（159.06秒、全曲・全曲カテゴリー）。
    // 上の記録の8分前・同一プレイヤーのため、同じ時点のカタログ曲数（84曲）を使う。
    variant: "randomPlayback",
    questionCountValue: "all",
    categoryFilterValue: "all",
    clearTimeMs: 159061.99999999814,
    actualQuestionCount: 84,
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
