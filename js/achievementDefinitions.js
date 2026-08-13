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
  // ===== 成長段階系（初心者〜中級者向け、2026-08-13追加） =====
  // イントロ系／シャッフル系（ランダム再生）／リリック系（歌詞クイズ）それぞれに、
  // ビギナー(5問)→チャレンジャー(10問)→エース(20問)の3段階を用意する（本人指示）。
  // 既存の最上位称号（ノーミスマスター・表マスター・裏称号）とは別の位置づけで、
  // 「高難度の称号」よりさらに手前にある、自然な最初の目標として案内する。
  // カテゴリー・回答方式（歌詞クイズの回答候補数も含む）は一切問わない。
  // LOVE連チャン等ミス後も進行しうるモードでも、判定はjs/achievementEvaluation.jsの
  // isCleanClear()（誤答・未回答0かつcompleted!==false）を使うため、1問でもミスがあれば
  // 付与されない（既存のノーミス段階称号と全く同じ安全な仕組みを再利用している）。
  {
    id: "intro_beginner",
    name: "イントロビギナー",
    category: "growth",
    iconKey: "intro_beginner",
    conditionText: "イントロ系クイズ（イントロクイズ／タイムアタック）で5問をノーミスで正解する（カテゴリー・回答方式自由）",
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "intro_challenger",
    name: "イントロチャレンジャー",
    category: "growth",
    iconKey: "intro_challenger",
    conditionText: "イントロ系クイズ（イントロクイズ／タイムアタック）で10問をノーミスで正解する（カテゴリー・回答方式自由）",
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "intro_ace",
    name: "イントロエース",
    category: "growth",
    iconKey: "intro_ace",
    conditionText: "イントロ系クイズ（イントロクイズ／タイムアタック）で20問をノーミスで正解する（カテゴリー・回答方式自由）",
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "shuffle_beginner",
    name: "シャッフルビギナー",
    category: "growth",
    iconKey: "shuffle_beginner",
    conditionText: "シャッフル系クイズ（ランダム再生クイズ／タイムアタックのランダム再生）で5問をノーミスで正解する（カテゴリー・回答方式自由）",
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "shuffle_challenger",
    name: "シャッフルチャレンジャー",
    category: "growth",
    iconKey: "shuffle_challenger",
    conditionText: "シャッフル系クイズ（ランダム再生クイズ／タイムアタックのランダム再生）で10問をノーミスで正解する（カテゴリー・回答方式自由）",
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "shuffle_ace",
    name: "シャッフルエース",
    category: "growth",
    iconKey: "shuffle_ace",
    conditionText: "シャッフル系クイズ（ランダム再生クイズ／タイムアタックのランダム再生）で20問をノーミスで正解する（カテゴリー・回答方式自由）",
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "lyric_beginner",
    name: "リリックビギナー",
    category: "growth",
    iconKey: "lyric_beginner",
    conditionText: "歌詞クイズで5問をノーミスで正解する（カテゴリー・回答候補数は自由）",
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "lyric_challenger",
    name: "リリックチャレンジャー",
    category: "growth",
    iconKey: "lyric_challenger",
    conditionText: "歌詞クイズで10問をノーミスで正解する（カテゴリー・回答候補数は自由）",
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "lyric_ace",
    name: "リリックエース",
    category: "growth",
    iconKey: "lyric_ace",
    conditionText: "歌詞クイズで20問をノーミスで正解する（カテゴリー・回答候補数は自由）",
    compositeOf: null,
    rewardNote: null,
  },

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
    // 本人指示（2026-08-07）：電光石火のような上級者向け称号と混同されないよう、
    // 「時間は関係なく、全曲ノーミスであれば取れる」ことと「まず最初に目指す称号」であることを
    // 明記した、初心者向けの文面に変更。
    conditionText:
      "イントロクイズまたはタイムアタックの全曲モードを、時間を気にせずノーミスでクリアすると獲得できます。まずはここを目指そう！",
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
    conditionText:
      "歌詞クイズの全曲モード・回答候補「全曲から探す」設定を、誤答・スキップなしの全問正解でクリアする（ヒント数・時間は問わない）",
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
    conditionText:
      "歌詞クイズの全曲モード・回答候補「全曲から探す」設定を、誤答・スキップなしの全問正解、すべてヒント1だけで正解してクリアする",
    compositeOf: null,
    rewardNote: null,
  },

  // ===== 複合称号 =====
  {
    id: "equal_love_master",
    name: "＝LOVEマスター",
    category: "composite",
    iconKey: "equal_love_master",
    // 本人指示（2026-08-07）：「どの称号を集めれば最終称号になるのか」が一目で分かるよう、
    // 必要な3称号の名前を条件文自体に明記。あわせて「表ルート（時間を問わない側）の
    // 完全制覇」であることを一言添え、裏ルート版（＝LOVE完全制覇）との違いが伝わるようにする。
    conditionText:
      "「ノーミスマスター」「フルコーラスマスター」「歌マスター」の3つをすべて獲得した、表ルート完全制覇の証。",
    compositeOf: ["no_miss_master", "full_chorus_master", "song_master"],
    rewardNote: "🎁 特典があります。推しアイコンに王冠が付きます。",
  },
  {
    id: "equal_love_complete",
    name: "＝LOVE完全制覇",
    category: "composite",
    iconKey: "equal_love_complete",
    conditionText:
      "「電光石火」「メロディアス」「リリックマスター」の3つの裏称号をすべて獲得した者だけが手にできる、裏ルートまで極めた最高到達点の称号。",
    compositeOf: ["lightning_fast", "melody_ace", "lyric_master"],
    rewardNote: "🎁 特典があります。推しアイコンに、王冠とダイヤの両方が付きます。",
  },
];

export function getAchievementById(id) {
  return ACHIEVEMENTS.find((achievement) => achievement.id === id) ?? null;
}
