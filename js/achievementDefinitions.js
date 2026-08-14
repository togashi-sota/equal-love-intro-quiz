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
// id                 : 保存・参照に使う一意な識別子（将来も変更しない）
// name               : 表示名（将来変更してもデータは壊れない）
// category           : 一覧での分類："growth"（ステップアップ） | "masterPath"（＝LOVEマスターへの道）
//                       | "backChallenge"（裏チャレンジ）
// iconKey            : js/achievementIcons.jsのアイコン定義を引くためのキー
// conditionText      : 一覧に常に表示する、短い一文の獲得条件（本人指示・2026-08-14：
//                       「イントロ系で5問ノーミス！」のように一目で分かる短文にする）
// challengeConditions: 「挑戦条件」として箇条書きで表示する詳細条件（本人指示・2026-08-14追加）。
//                       masterPath・backChallengeの単体称号（複合称号を除く）だけが持つ。
//                       それ以外（growth・複合称号）はnull（growthは条件が単純なため
//                       conditionTextだけで十分、複合称号はcompositeProgressの
//                       チェックリストが同じ役割を果たすため）。
// compositeOf        : 複合称号が要求する、他の称号idの配列。nullなら複合称号ではない
//                       （表示上のcategoryとは独立させている。判定・見た目の特別扱いは
//                       すべてcompositeOfの有無で判定する）。
// rewardNote         : 複合称号だけが持つ、特典・見た目の変化を予告する一言（本人指示、2026-08-07追加）。
//                       一覧カード・獲得演出の両方に、目立つように表示する。それ以外の称号はnull。
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
    conditionText: "イントロ系で5問ノーミス！",
    challengeConditions: null,
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "intro_challenger",
    name: "イントロチャレンジャー",
    category: "growth",
    iconKey: "intro_challenger",
    conditionText: "イントロ系で10問ノーミス！",
    challengeConditions: null,
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "intro_ace",
    name: "イントロエース",
    category: "growth",
    iconKey: "intro_ace",
    conditionText: "イントロ系で20問ノーミス！",
    challengeConditions: null,
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "shuffle_beginner",
    name: "シャッフルビギナー",
    category: "growth",
    iconKey: "shuffle_beginner",
    conditionText: "ランダム再生で5問ノーミス！",
    challengeConditions: null,
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "shuffle_challenger",
    name: "シャッフルチャレンジャー",
    category: "growth",
    iconKey: "shuffle_challenger",
    conditionText: "ランダム再生で10問ノーミス！",
    challengeConditions: null,
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "shuffle_ace",
    name: "シャッフルエース",
    category: "growth",
    iconKey: "shuffle_ace",
    conditionText: "ランダム再生で20問ノーミス！",
    challengeConditions: null,
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "lyric_beginner",
    name: "リリックビギナー",
    category: "growth",
    iconKey: "lyric_beginner",
    conditionText: "歌詞クイズで5問ノーミス！",
    challengeConditions: null,
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "lyric_challenger",
    name: "リリックチャレンジャー",
    category: "growth",
    iconKey: "lyric_challenger",
    conditionText: "歌詞クイズで10問ノーミス！",
    challengeConditions: null,
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "lyric_ace",
    name: "リリックエース",
    category: "growth",
    iconKey: "lyric_ace",
    conditionText: "歌詞クイズで20問ノーミス！",
    challengeConditions: null,
    compositeOf: null,
    rewardNote: null,
  },

  // ===== ＝LOVEマスターへの道（表：ノーミスマスター・フルコーラスマスター・歌マスター・＝LOVEマスター） =====
  // 【2026-08-14改訂・本人指示】「全曲」は、カテゴリー絞り込みなしの本当の全曲
  // （js/achievementEvaluation.jsのisUnrestrictedFullPool）だけを指す。「表題曲のみ」等で
  // 絞り込んだ状態の"全曲"では達成できない。
  {
    id: "no_miss_master",
    name: "ノーミスマスター",
    category: "masterPath",
    iconKey: "no_miss_master",
    conditionText: "イントロ系で出題可能な全曲をノーミスクリア！",
    challengeConditions: [
      "モード：イントロ系（イントロクイズ／タイムアタック）",
      "出題数：現在出題可能な全曲",
      "カテゴリー：全曲（絞り込みなし）",
      "条件：全問正解・誤答0・未回答0",
      "時間制限：なし",
      "補足：「表題曲のみ」などカテゴリーを絞った状態では達成できません",
    ],
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "full_chorus_master",
    name: "フルコーラスマスター",
    category: "masterPath",
    iconKey: "full_chorus_master",
    conditionText: "ランダム再生で出題可能な全曲をノーミスクリア！",
    challengeConditions: [
      "モード：ランダム再生クイズ",
      "出題数：現在出題可能な全曲",
      "カテゴリー：全曲（絞り込みなし）",
      "条件：全問正解・誤答0・未回答0",
      "時間制限：なし",
      "補足：カテゴリーを絞った状態では達成できません",
    ],
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "song_master",
    name: "歌マスター",
    category: "masterPath",
    iconKey: "song_master",
    conditionText: "歌詞クイズを最高難度で全曲ノーミス！",
    challengeConditions: [
      "モード：歌詞クイズ",
      "出題数：現在出題可能な全曲",
      "カテゴリー：全曲（絞り込みなし）",
      "回答方式：全曲検索",
      "条件：全問正解・誤答0・未回答0",
      "時間制限：なし",
      "補足：カテゴリーを絞った状態、または回答候補が全曲検索以外では達成できません",
    ],
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "equal_love_master",
    name: "＝LOVEマスター",
    category: "masterPath",
    iconKey: "equal_love_master",
    // 本人指示（2026-08-07）：「どの称号を集めれば最終称号になるのか」が一目で分かるよう、
    // 必要な3称号の名前を条件文自体に明記。あわせて「表ルート（時間を問わない側）の
    // 完全制覇」であることを一言添え、裏ルート版（＝LOVE完全制覇）との違いが伝わるようにする。
    conditionText:
      "「ノーミスマスター」「フルコーラスマスター」「歌マスター」の3つをすべて獲得した、表ルート完全制覇の証。",
    challengeConditions: null,
    compositeOf: ["no_miss_master", "full_chorus_master", "song_master"],
    rewardNote: "🎁 特典があります。推しアイコンに王冠が付きます。",
  },

  // ===== 裏チャレンジ（電光石火・メロディアス・リリックマスター・＝LOVE完全制覇） =====
  {
    id: "lightning_fast",
    name: "電光石火",
    category: "backChallenge",
    iconKey: "lightning_fast",
    conditionText: "イントロ系を全曲ノーミス・平均1.7秒以内でクリア！",
    challengeConditions: [
      "モード：イントロ系（イントロクイズ／タイムアタック）",
      "出題数：現在出題可能な全曲",
      "カテゴリー：全曲（絞り込みなし）",
      "条件：全問正解・誤答0・未回答0",
      "平均回答時間：1.70秒以内",
      "補足：カテゴリーを絞った状態では達成できません",
    ],
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "melody_ace",
    name: "メロディアス",
    category: "backChallenge",
    iconKey: "melody_ace",
    conditionText: "ランダム再生を全曲ノーミス・平均1.7秒以内でクリア！",
    challengeConditions: [
      "モード：ランダム再生クイズ",
      "出題数：現在出題可能な全曲",
      "カテゴリー：全曲（絞り込みなし）",
      "条件：全問正解・誤答0・未回答0",
      "平均回答時間：1.70秒以内",
      "補足：カテゴリーを絞った状態では達成できません",
    ],
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "lyric_master",
    name: "リリックマスター",
    category: "backChallenge",
    iconKey: "lyric_master",
    conditionText: "歌詞クイズを最高難度で全曲・全問ヒント1のみでクリア！",
    challengeConditions: [
      "モード：歌詞クイズ",
      "出題数：現在出題可能な全曲",
      "カテゴリー：全曲（絞り込みなし）",
      "回答方式：全曲検索",
      "条件：全問正解・誤答0・未回答0",
      "ヒント条件：全問ヒント1のみで正解",
      "補足：カテゴリーを絞った状態、または回答候補が全曲検索以外では達成できません",
    ],
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "equal_love_complete",
    name: "＝LOVE完全制覇",
    category: "backChallenge",
    iconKey: "equal_love_complete",
    conditionText:
      "「電光石火」「メロディアス」「リリックマスター」の3つの裏称号をすべて獲得した者だけが手にできる、裏ルートまで極めた最高到達点の称号。",
    challengeConditions: null,
    compositeOf: ["lightning_fast", "melody_ace", "lyric_master"],
    rewardNote: "🎁 特典があります。推しアイコンに、王冠とダイヤの両方が付きます。",
  },
];

export function getAchievementById(id) {
  return ACHIEVEMENTS.find((achievement) => achievement.id === id) ?? null;
}
