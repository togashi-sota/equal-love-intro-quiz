// 一瞬チャレンジの「クリア済み条件」を記録するファイル（2026-08-30新設、本人指示）。
//
// 【設計方針】一瞬チャレンジはタイムランキング競争ではなく、「その条件（再生時間×回答候補数）を
// 一度達成したらクリア」というチャレンジ型のモード。将来、称号・特殊ランキング（クリア者一覧）を
// 追加する際にそのまま使えるよう、今のうちに「どの条件を、いつ、何回クリアしたか」だけを
// きちんと保存しておく（称号の具体的な条件・名称は本人指示により今回は決めない・実装しない）。
//
// 【クリアの判定】「全問正解で完走した」ことをクリアとする（呼び出し側が判定し、この関数は
// 判定結果を受け取って保存するだけ。判定ロジック自体はここに持たせない）。
// 【1回クリアすれば十分】同じ条件を複数回クリアしても、初回クリア日時は上書きしない
// （本人方針〈他の称号系ファイルと同じ「初回だけ記録」の考え方〉）。挑戦回数の目安として
// clearCountだけは毎回増やしておく（将来「N回クリアで称号」のような条件を作る余地を残すため）。
import { getPlayerKeyPrefix } from "./playerProfile.js";
import { scheduleBackupSync } from "./backupSync.js";

function buildInstantChallengeClearsKey() {
  return `equalLoveIntroQuiz.${getPlayerKeyPrefix()}instantChallengeClears`;
}

// 【2026-08-30改訂・本人指示】称号「一瞬ビギナー〜一瞬マスター」「即聞即答」が
// 再生時間×回答候補数だけでなく出題数（3/5/10問）ごとに条件を分けて確定したため、
// comboKeyにquestionCountValueを追加した（schemaVersion 1→2）。
// 【既存データの安全性】旧schemaVersion 1時代のレコードは、questionCountValueを含まない
// 短いキー（例："0.5_4"）のまま同じclearedCombosオブジェクトに残り続ける。新しいキー
// （例："0.5_4_10"）とは文字列として別物なので衝突・上書きは起きない。称号判定は
// 新しいキー形式のレコードだけを見るため、古いレコードは静かに無視されるだけで、
// 削除も改変もされない（本人指示：既存データを失わせない）。
const CURRENT_SCHEMA_VERSION = 2;

// 再生時間（"1.5"|"1"|"0.5"）・回答候補数（"4"|"10"|"all"）・出題数（"3"|"5"|"10"）から、
// 保存キーとして使う一意な組み合わせキーを作る。再生時間の値がすでに"."を含むため、
// 区切り文字には"_"を使う（"."を区切りに使うと"1.5"と"1"+"5"のような曖昧さが生まれるため）。
export function buildComboKey(playDurationValue, answerPoolSizeValue, questionCountValue) {
  return `${playDurationValue}_${answerPoolSizeValue}_${questionCountValue}`;
}

function loadData() {
  const empty = { schemaVersion: CURRENT_SCHEMA_VERSION, clearedCombos: {} };
  try {
    const stored = localStorage.getItem(buildInstantChallengeClearsKey());
    if (!stored) return empty;
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed.clearedCombos !== "object" || parsed.clearedCombos === null) return empty;
    return parsed;
  } catch {
    return empty;
  }
}

function saveData(data) {
  try {
    localStorage.setItem(buildInstantChallengeClearsKey(), JSON.stringify(data));
    scheduleBackupSync(); // クラウドバックアップも更新する（js/backupSync.js参照）
  } catch {
    // プライベートブラウジング等でlocalStorageが使えない環境でも、アプリ自体は動き続けられるようにする
  }
}

// 指定した条件のクリア状況を返す（未クリアならnull）。
export function getInstantChallengeClear(playDurationValue, answerPoolSizeValue, questionCountValue) {
  const data = loadData();
  return data.clearedCombos[buildComboKey(playDurationValue, answerPoolSizeValue, questionCountValue)] ?? null;
}

// 指定した条件を「クリアした」として記録する。呼び出し側は、全問正解で完走した場合だけ呼ぶ想定
// （判定はここでは行わない）。初回クリア日時（clearedAt）は上書きしない。
// noReplayUsed: そのプレイの全問を通じて「もう一度聞く」を一度も使わなかった場合はtrue
// （裏チャレンジ「即聞即答」の判定材料。初回達成日時だけnoReplayClearedAtに記録し、以後は上書きしない）。
export function recordInstantChallengeClear(playDurationValue, answerPoolSizeValue, questionCountValue, { noReplayUsed = false } = {}) {
  const data = loadData();
  const key = buildComboKey(playDurationValue, answerPoolSizeValue, questionCountValue);
  const existing = data.clearedCombos[key];
  data.clearedCombos[key] = {
    playDurationValue,
    answerPoolSizeValue,
    questionCountValue,
    clearedAt: existing?.clearedAt ?? new Date().toISOString(),
    clearCount: (existing?.clearCount ?? 0) + 1,
    noReplayClearedAt: noReplayUsed ? existing?.noReplayClearedAt ?? new Date().toISOString() : existing?.noReplayClearedAt ?? null,
  };
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  saveData(data);
  return data.clearedCombos[key];
}

// クリア済みの条件をすべて返す（読み取り専用、将来のクリア者一覧・称号判定用）。
export function getAllInstantChallengeClears() {
  return Object.values(loadData().clearedCombos);
}
