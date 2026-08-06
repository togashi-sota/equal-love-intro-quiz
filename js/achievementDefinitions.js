// 新しい称号（実績）システムの定義ファイル。
// 旧js/titleDefinitions.js（パーフェクト・イントロマスター・電光石火・＝LOVE皆伝・ひらめき）は
// このシステムに完全に置き換えられ、削除された。旧データはlocalStorageに残したまま、
// js/achievementProgress.jsのsyncLegacyAchievements()が読み取り専用で参照し、
// 対応するノーミス段階称号の根拠として一度だけ静かに引き継ぐ（本人指示：
// 「安全に移行できるなら移行、難しい場合は内部互換データとして保持だけで構いません」）。
//
// 称号IDは表示名と分離している（本人指示）。表示名を将来変更しても、
// 保存データ（unlockedAchievementIds配列にはIDだけを保存する）は壊れない。

// 称号1件が持つ項目の意味
// id            : 保存・参照に使う一意な識別子（将来も変更しない）
// name          : 表示名（将来変更してもデータは壊れない）
// category      : 一覧での分類："noMiss" | "backRoute" | "composite"
// iconKey       : js/achievementIcons.jsのアイコン定義を引くためのキー
// conditionText : 一覧で常に表示する、獲得条件の説明文
// compositeOf   : 複合称号（category:"composite"）が要求する、他の称号idの配列。nullなら複合称号ではない。
// rewardNote    : 複合称号だけが持つ、特典・見た目の変化を予告する一言（本人指示、2026-08-07追加）。
//                 一覧カード・獲得演出の両方に、目立つように表示する。それ以外の称号はnull。
export const ACHIEVEMENTS = [
  // ===== ノーミス系（イントロクイズ または 現在のイントロ形式タイムアタックで取得） =====
  {
    id: "no_miss_bronze",
    name: "ブロンズ",
    category: "noMiss",
    iconKey: "no_miss_bronze",
    conditionText: "イントロクイズまたはタイムアタックで、5曲をノーミスクリアする",
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "no_miss_silver",
    name: "シルバー",
    category: "noMiss",
    iconKey: "no_miss_silver",
    conditionText: "イントロクイズまたはタイムアタックで、10曲をノーミスクリアする",
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "no_miss_gold",
    name: "ゴールド",
    category: "noMiss",
    iconKey: "no_miss_gold",
    conditionText: "イントロクイズまたはタイムアタックで、20曲をノーミスクリアする",
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "no_miss_platinum",
    name: "プラチナ",
    category: "noMiss",
    iconKey: "no_miss_platinum",
    conditionText: "イントロクイズまたはタイムアタックで、50曲をノーミスクリアする",
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "no_miss_master",
    name: "ノーミスマスター",
    category: "noMiss",
    iconKey: "no_miss_master",
    conditionText: "イントロクイズまたはタイムアタックで、全曲モードをノーミスクリアする",
    compositeOf: null,
    rewardNote: null,
  },

  // ===== 表マスター（＝LOVEマスターの構成称号のうち、ノーミスマスター以外の2つ） =====
  {
    id: "full_chorus_master",
    name: "フルコーラスマスター",
    category: "modeMaster",
    iconKey: "full_chorus_master",
    conditionText: "ランダム再生クイズの全曲モードを、誤答・未回答なしの全問正解でクリアする（時間は問わない）",
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "song_master",
    name: "歌マスター",
    category: "modeMaster",
    iconKey: "song_master",
    conditionText: "歌詞クイズの全曲モードを、誤答・スキップなしの全問正解でクリアする（ヒント数・時間は問わない）",
    compositeOf: null,
    rewardNote: null,
  },

  // ===== 裏称号（＝LOVE完全制覇の構成称号） =====
  {
    id: "lightning_fast",
    name: "電光石火",
    category: "backRoute",
    iconKey: "lightning_fast",
    conditionText: "イントロクイズまたはタイムアタックの全曲モードを、誤答・未回答なしの全問正解、平均回答時間1.7秒以内でクリアする",
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "melody_ace",
    name: "メロディアス",
    category: "backRoute",
    iconKey: "melody_ace",
    conditionText: "ランダム再生クイズの全曲モードを、誤答・未回答なしの全問正解、平均回答時間1.7秒以内でクリアする",
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "lyric_master",
    name: "リリックマスター",
    category: "backRoute",
    iconKey: "lyric_master",
    conditionText: "歌詞クイズの全曲モードを、誤答・スキップなしの全問正解、すべてヒント1だけで正解してクリアする",
    compositeOf: null,
    rewardNote: null,
  },

  // ===== 複合称号 =====
  {
    id: "equal_love_master",
    name: "＝LOVEマスター",
    category: "composite",
    iconKey: "equal_love_master",
    conditionText: "イントロ、ランダム再生、歌詞クイズの全曲モードを、すべてノーミスで制覇した証。",
    compositeOf: ["no_miss_master", "full_chorus_master", "song_master"],
    rewardNote: "🎁 特典があります。推しアイコンに王冠が付きます。",
  },
  {
    id: "equal_love_complete",
    name: "＝LOVE完全制覇",
    category: "composite",
    iconKey: "equal_love_complete",
    conditionText: "速さ、メロディー、歌詞。そのすべてを極めた、究極の＝LOVEマスター。",
    compositeOf: ["lightning_fast", "melody_ace", "lyric_master"],
    rewardNote: "🎁 特典があります。推しアイコンに、王冠とダイヤの両方が付きます。",
  },
];

export function getAchievementById(id) {
  return ACHIEVEMENTS.find((achievement) => achievement.id === id) ?? null;
}
