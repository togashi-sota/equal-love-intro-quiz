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
    challengeConditions: [
      "出題数：5問",
      "対象モード：イントロクイズ／タイムアタック（イントロ形式）",
      "カテゴリー：自由（表題曲のみ／表題曲＋全員曲／全曲、どれでも可）",
      "条件：全問正解（誤答・未回答なし。LOVE連チャン等ミス後も続くルールでも、1問でも間違えたその回は対象外）",
    ],
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "intro_challenger",
    name: "イントロチャレンジャー",
    category: "growth",
    iconKey: "intro_challenger",
    conditionText: "イントロ系で10問ノーミス！",
    challengeConditions: [
      "出題数：10問",
      "対象モード：イントロクイズ／タイムアタック（イントロ形式）",
      "カテゴリー：自由（表題曲のみ／表題曲＋全員曲／全曲、どれでも可）",
      "条件：全問正解（誤答・未回答なし。LOVE連チャン等ミス後も続くルールでも、1問でも間違えたその回は対象外）",
    ],
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "intro_ace",
    name: "イントロエース",
    category: "growth",
    iconKey: "intro_ace",
    conditionText: "イントロ系で20問ノーミス！",
    challengeConditions: [
      "出題数：20問",
      "対象モード：イントロクイズ／タイムアタック（イントロ形式）",
      "カテゴリー：自由（表題曲のみ／表題曲＋全員曲／全曲、どれでも可）",
      "条件：全問正解（誤答・未回答なし。LOVE連チャン等ミス後も続くルールでも、1問でも間違えたその回は対象外）",
    ],
    compositeOf: null,
    rewardNote: null,
  },
  // 【2026-08-30追加・本人指示④⑥】アウトロ系。イントロ系と全く同じ取得条件
  // （出題数・全問正解の基準）をそのままアウトロクイズ（specialModeId:"outroQuiz"、
  // 通常導線のみ。オリジナル問題作成モード経由〈customQuizOutro〉は他の系統と同じく対象外）に
  // 適用する。難易度・条件を新しく作らない、という本人指示に従っている。
  {
    id: "outro_beginner",
    name: "アウトロビギナー",
    category: "growth",
    iconKey: "outro_beginner",
    conditionText: "アウトロ系で5問ノーミス！",
    challengeConditions: [
      "出題数：5問",
      "対象モード：アウトロクイズ",
      "カテゴリー：自由（表題曲のみ／表題曲＋全員曲／全曲、どれでも可）",
      "条件：全問正解（誤答・未回答なし）",
    ],
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "outro_challenger",
    name: "アウトロチャレンジャー",
    category: "growth",
    iconKey: "outro_challenger",
    conditionText: "アウトロ系で10問ノーミス！",
    challengeConditions: [
      "出題数：10問",
      "対象モード：アウトロクイズ",
      "カテゴリー：自由（表題曲のみ／表題曲＋全員曲／全曲、どれでも可）",
      "条件：全問正解（誤答・未回答なし）",
    ],
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "outro_ace",
    name: "アウトロエース",
    category: "growth",
    iconKey: "outro_ace",
    conditionText: "アウトロ系で20問ノーミス！",
    challengeConditions: [
      "出題数：20問",
      "対象モード：アウトロクイズ",
      "カテゴリー：自由（表題曲のみ／表題曲＋全員曲／全曲、どれでも可）",
      "条件：全問正解（誤答・未回答なし）",
    ],
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "shuffle_beginner",
    name: "シャッフルビギナー",
    category: "growth",
    iconKey: "shuffle_beginner",
    conditionText: "ランダム再生で5問ノーミス！",
    challengeConditions: [
      "出題数：5問",
      "対象モード：ランダム再生クイズ／タイムアタック（ランダム再生形式）",
      "カテゴリー：自由（表題曲のみ／表題曲＋全員曲／全曲、どれでも可）",
      "条件：全問正解（誤答・未回答なし。LOVE連チャン等ミス後も続くルールでも、1問でも間違えたその回は対象外）",
    ],
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "shuffle_challenger",
    name: "シャッフルチャレンジャー",
    category: "growth",
    iconKey: "shuffle_challenger",
    conditionText: "ランダム再生で10問ノーミス！",
    challengeConditions: [
      "出題数：10問",
      "対象モード：ランダム再生クイズ／タイムアタック（ランダム再生形式）",
      "カテゴリー：自由（表題曲のみ／表題曲＋全員曲／全曲、どれでも可）",
      "条件：全問正解（誤答・未回答なし。LOVE連チャン等ミス後も続くルールでも、1問でも間違えたその回は対象外）",
    ],
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "shuffle_ace",
    name: "シャッフルエース",
    category: "growth",
    iconKey: "shuffle_ace",
    conditionText: "ランダム再生で20問ノーミス！",
    challengeConditions: [
      "出題数：20問",
      "対象モード：ランダム再生クイズ／タイムアタック（ランダム再生形式）",
      "カテゴリー：自由（表題曲のみ／表題曲＋全員曲／全曲、どれでも可）",
      "条件：全問正解（誤答・未回答なし。LOVE連チャン等ミス後も続くルールでも、1問でも間違えたその回は対象外）",
    ],
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "lyric_beginner",
    name: "リリックビギナー",
    category: "growth",
    iconKey: "lyric_beginner",
    conditionText: "歌詞クイズで5問ノーミス！",
    challengeConditions: [
      "出題数：5問",
      "対象モード：歌詞クイズ",
      "カテゴリー：自由（表題曲のみ／表題曲＋全員曲／全曲、どれでも可）",
      "回答方式：自由（回答候補4択／10択／30択／50択／全曲検索、どれでも可）",
      "条件：全問正解（誤答・スキップなし）",
    ],
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "lyric_challenger",
    name: "リリックチャレンジャー",
    category: "growth",
    iconKey: "lyric_challenger",
    conditionText: "歌詞クイズで10問ノーミス！",
    challengeConditions: [
      "出題数：10問",
      "対象モード：歌詞クイズ",
      "カテゴリー：自由（表題曲のみ／表題曲＋全員曲／全曲、どれでも可）",
      "回答方式：自由（回答候補4択／10択／30択／50択／全曲検索、どれでも可）",
      "条件：全問正解（誤答・スキップなし）",
    ],
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "lyric_ace",
    name: "リリックエース",
    category: "growth",
    iconKey: "lyric_ace",
    conditionText: "歌詞クイズで20問ノーミス！",
    challengeConditions: [
      "出題数：20問",
      "対象モード：歌詞クイズ",
      "カテゴリー：自由（表題曲のみ／表題曲＋全員曲／全曲、どれでも可）",
      "回答方式：自由（回答候補4択／10択／30択／50択／全曲検索、どれでも可）",
      "条件：全問正解（誤答・スキップなし）",
    ],
    compositeOf: null,
    rewardNote: null,
  },

  // 【2026-08-30追加・本人指示⑦⑪】一瞬チャレンジ系。他4系統と違い、出題数だけでなく
  // 再生時間・回答候補数もセットで条件になるため、それぞれ独立した固有の組み合わせで定義する
  // （段階間のカスケード＝下位を自動付与する仕組みは無い。本人確定仕様）。
  {
    id: "instant_beginner",
    name: "一瞬ビギナー",
    category: "growth",
    iconKey: "instant_beginner",
    conditionText: "1.5秒・4択・3問を全問正解！",
    challengeConditions: [
      "再生時間：1.5秒",
      "回答方式：4択",
      "出題数：3問",
      "条件：全問正解（「もう一度聞く」は回数不問）",
    ],
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "instant_challenger",
    name: "一瞬チャレンジャー",
    category: "growth",
    iconKey: "instant_challenger",
    conditionText: "1秒・4択・5問を全問正解！",
    challengeConditions: [
      "再生時間：1秒",
      "回答方式：4択",
      "出題数：5問",
      "条件：全問正解（「もう一度聞く」は回数不問）",
    ],
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "instant_ace",
    name: "一瞬エース",
    category: "growth",
    iconKey: "instant_ace",
    conditionText: "1秒・10択・10問を全問正解！",
    challengeConditions: [
      "再生時間：1秒",
      "回答方式：10択",
      "出題数：10問",
      "条件：全問正解（「もう一度聞く」は回数不問）",
    ],
    compositeOf: null,
    rewardNote: null,
  },
  {
    // 【重要】category:"masterPath"（他4系統のマスター段階＝no_miss_master・outro_master・
    // full_chorus_master・song_masterと統一。js/achievementList.jsのGROWTH_TIER_ID_SETが
    // idベースでトロフィー表示へ組み込むため、category自体はビギナー〜エースの"growth"とは
    // 分けておく）。
    id: "instant_master",
    name: "一瞬マスター",
    category: "masterPath",
    iconKey: "instant_master",
    conditionText: "0.5秒・10択・10問を全問正解！",
    challengeConditions: [
      "再生時間：0.5秒",
      "回答方式：10択",
      "出題数：10問",
      "条件：全問正解（「もう一度聞く」は回数不問）",
    ],
    compositeOf: null,
    rewardNote: null,
  },

  // ===== ＝LOVEマスターへの道（表：ノーミスマスター・フルコーラスマスター・歌マスター・＝LOVEマスター） =====
  // 【2026-08-14改訂・本人指示】「全曲」は、カテゴリー絞り込みなしの本当の全曲
  // （js/achievementEvaluation.jsのisUnrestrictedFullPool）だけを指す。「表題曲のみ」等で
  // 絞り込んだ状態の"全曲"では達成できない。
  {
    // 【2026-08-30改訂・本人指示⑤】表示名のみ「ノーミスマスター」→「イントロマスター」へ変更。
    // idは既存取得者のデータを壊さないよう絶対に変更しない（js/achievementDefinitions.js冒頭の
    // 設計方針どおり、idと表示名は分離されているため、既存の取得済み状態・取得日時・
    // バックアップ・公開プロフィール・フレンド表示・＝LOVEマスター判定は一切変わらない）。
    id: "no_miss_master",
    name: "イントロマスター",
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
    rewardNote: "🎁 特典があります。推しアイコンに専用バッジが付きます。",
  },
  // 【2026-08-30追加・本人指示⑥】アウトロマスター。イントロマスター（no_miss_master）と
  // 全く同じ条件をアウトロクイズに適用する新設の称号。
  {
    id: "outro_master",
    name: "アウトロマスター",
    category: "masterPath",
    iconKey: "outro_master",
    conditionText: "アウトロ系で出題可能な全曲をノーミスクリア！",
    challengeConditions: [
      "モード：アウトロクイズ",
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
    // 【2026-08-30改訂・本人指示⑤】表示名のみ「フルコーラスマスター」→「シャッフルマスター」へ変更。
    // idは変更しない（既存取得者の保護は上のイントロマスターと同じ理由）。
    id: "full_chorus_master",
    name: "シャッフルマスター",
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
    // 【2026-08-30改訂・本人指示⑤】表示名のみ「歌マスター」→「リリックマスター」へ変更。
    // idは変更しない。旧「リリックマスター」（裏チャレンジ側）は同時に「完全記憶」へ改名しており、
    // 表示名の衝突は起きない。
    id: "song_master",
    name: "リリックマスター",
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
    // 【2026-08-30改訂・本人指示⑫】アウトロマスターが加わり、必要な称号が3→4つに変更。
    // compositeOfへ"outro_master"を1件足すだけで判定ロジック（evaluateCompositeAchievements、
    // 「compositeOfの全idが解放済みか」を汎用的にチェックするだけの仕組み）はそのまま動く。
    // 【既存ユーザーへの影響】この時点ですでに＝LOVEマスターを取得している人がいた場合でも、
    // 取得済みのunlockedAchievementIdsは一切書き換わらない・再判定もされない（js/achievementProgress.js
    // のmergeAchievementProgress()は「新規に達成したものを追加するだけ」で、既存の取得を
    // 条件変更によって取り消す仕組みがそもそも存在しない）。そのため、新条件（4称号）を
    // 満たしていない状態で＝LOVEマスターを保持し続けることはあっても、剥奪されることは絶対にない。
    conditionText:
      "「イントロマスター」「アウトロマスター」「シャッフルマスター」「リリックマスター」の4つをすべて獲得した、表ルート完全制覇の証。",
    challengeConditions: null,
    compositeOf: ["no_miss_master", "outro_master", "full_chorus_master", "song_master"],
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
  // 【2026-08-30追加・本人指示⑬⑭】アウトロ裏チャレンジ「完全終曲」。本人確定仕様どおり、
  // 電光石火・メロディアスと違い平均回答時間の条件は課さない（アウトロマスターと全く同じ
  // 条件になるが、本人の明示的な指定どおりに実装する）。「全曲」の判定は、既存のアウトロマスター・
  // 電光石火と同じisUnrestrictedFullPool()（カテゴリー絞り込みなし＋出題数も"全曲"）を使うため、
  // 「カタログ上の総曲数」のような固定値を一切ベタ書きしない＝新曲が増えてもその時点の
  // 実際の出題可能数で自動的に正しく判定される。
  {
    id: "complete_finale",
    name: "完全終曲",
    category: "backChallenge",
    iconKey: "complete_finale",
    conditionText: "アウトロ系を出題可能な全曲・ノーミスで完全クリア！",
    challengeConditions: [
      "モード：アウトロクイズ",
      "出題数：現在出題可能な全曲",
      "カテゴリー：全曲（絞り込みなし）",
      "回答方式：4択固定",
      "条件：全問正解・誤答0・未回答0",
      "補足：カテゴリーを絞った状態では達成できません",
    ],
    compositeOf: null,
    rewardNote: null,
  },
  {
    // 【2026-08-30改訂・本人指示⑤⑬】表示名のみ「メロディアス」→「絶対音感」へ変更。
    // idは変更しない（既存取得者の保護は上のイントロマスター等と同じ理由）。
    id: "melody_ace",
    name: "絶対音感",
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
    // 【2026-08-30改訂・本人指示⑤⑬】表示名のみ「リリックマスター」→「完全記憶」へ変更。
    // idは変更しない。表マスター側の新しい「リリックマスター」（song_master、上のセクション）とは
    // 別のidなので、名称の入れ替わりによる混同は保存データ上は一切発生しない。
    id: "lyric_master",
    name: "完全記憶",
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
  // 【2026-08-30追加・本人指示⑦⑬】一瞬チャレンジ裏チャレンジ「即聞即答」。0.5秒・全曲検索・10問を
  // 全問正解、かつ全問を通じて「もう一度聞く」を一度も使わなかった場合だけ成立する
  // （js/instantChallengeScreen.jsのnoReplayUsedをそのまま使う）。
  {
    id: "instant_flash_answer",
    name: "即聞即答",
    category: "backChallenge",
    iconKey: "instant_flash_answer",
    conditionText: "0.5秒・全曲検索・10問を、聞き直し無しの一発勝負で全問正解！",
    challengeConditions: [
      "再生時間：0.5秒",
      "回答方式：全曲検索",
      "出題数：10問",
      "条件：全問正解・「もう一度聞く」を一度も使用しない",
    ],
    compositeOf: null,
    rewardNote: null,
  },
  {
    id: "equal_love_complete",
    name: "＝LOVE完全制覇",
    category: "backChallenge",
    iconKey: "equal_love_complete",
    // 【2026-08-30改訂・本人指示⑮】＝LOVEマスター（表ルート4称号の複合）自体も必須条件に含め、
    // 「＝LOVEマスターを取得済み、かつ裏チャレンジ5種すべて取得済み」の両方を要求する。
    // compositeOfへ"equal_love_master"を1件加えるだけで、判定ロジック（evaluateCompositeAchievements、
    // 「compositeOfの全idが解放済みか」を汎用チェックするだけ）は変更不要で実現できる。
    conditionText:
      "「＝LOVEマスター」に加え、「電光石火」「完全終曲」「絶対音感」「完全記憶」「即聞即答」の裏称号5つすべてを獲得した者だけが手にできる、表裏ともに極めた最高到達点の称号。",
    challengeConditions: null,
    compositeOf: [
      "equal_love_master",
      "lightning_fast",
      "complete_finale",
      "melody_ace",
      "lyric_master",
      "instant_flash_answer",
    ],
    rewardNote: "🎁 特典があります。推しアイコンに、王冠とダイヤの両方が付きます。",
  },
];

export function getAchievementById(id) {
  return ACHIEVEMENTS.find((achievement) => achievement.id === id) ?? null;
}
