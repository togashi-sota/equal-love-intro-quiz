// オンライン対戦（イントロ対戦・ランダム再生対戦・歌詞クイズ対戦）で、参加者全員が
// 実際に利用できる曲だけを出題対象にするための、共通曲（intersection）判定を担当する
// ファイル（2026-08-26新設、2026-08-27に歌詞クイズ対戦・入退室時の再計算プレビュー・
// お気に入り/プレイリスト選択への対応を追加）。
//
// 【設計方針・重要】新曲データパック（js/dataPackImport.js）の導入により、端末によって
// 「持っている曲」が異なる状態（例：Aさんは20枚目まで、Bさん・Cさんは21枚目まで）が
// 正式に起こりうるようになった。オンライン対戦でその曲を出題してしまうと、
// 持っていない参加者が再生・回答できず、対戦が成立しない。そこで、対戦開始の直前に
// 「参加者全員の所持曲IDの共通部分（intersection）」を計算し、それを実際の出題対象
// （settings.questionSource）へ反映してからstartBattle()を呼ぶ。
//
// 【2026-08-27拡張：音源だけでなく歌詞データにも対応】イントロ対戦・ランダム再生対戦は
// 「音源を持っているか」（availableAudioSongIds）で絞り込むが、歌詞クイズ対戦は
// 「歌詞データを持っているか」（availableLyricsSongIds）で絞り込む必要がある
// （本人指示：重複ロジックを増やさず、同じ仕組みを種類（kind）だけ切り替えて使う）。
// どちらのkindで絞り込むかはjs/battleModes/index.jsのgetAvailabilityKind(gameMode)が
// 返す値で決まり、このファイル自身はgameModeの中身を一切意識しない。
//
// 【安全設計：Firebaseルール未対応でも壊れない】この機能は、各参加者がロビー入室時に
// 自分の所持曲ID一覧をrooms/{roomId}/players/{uid}/availableAudioSongIds（音源）・
// availableLyricsSongIds（歌詞）へ書き込むことを前提にしている。この新しいフィールドを
// 許可するには、本番のFirebaseセキュリティルールの更新が別途必要（本人の確認・承認を
// 経てから公開する既存の運用ルールに従う）。ルールがまだ許可していない環境では
// 書き込みが失敗するが、その場合は例外を握りつぶし、「誰からも所持曲の報告が無かった」
// 状態として扱う。js/onlineBattleSongAvailabilityPayloads.jsのrestrictSongPoolToCommonAvailability()は
// 「誰も報告していなければ制限しない」設計のため、ルール更新前は今までと完全に同じ挙動
// （絞り込みなし）のまま安全に動作する。つまりこの仕組みは「ルールが対応するまでは
// 何もしない」形で段階導入できる。
//
// 【共有してよい情報の範囲】Firebaseへ送るのは「曲ID（songId）の配列」だけで、
// 音源そのもの・歌詞本文・その他の著作権データは一切送らない（本人指示のとおり）。
//
// 【ファイル分割について】判定の中核ロジック（restrictSongPoolToCommonAvailability、
// Firebase・DOMに一切触れない純粋関数）は、自動テストから安全にimportできるよう
// js/onlineBattleSongAvailabilityPayloads.jsへ分離してある（js/lyricsQuizBattleFirebase.js／
// js/lyricsQuizBattleFirebasePayloads.jsの既存の分け方と同じ考え方。詳細は
// そちらのファイル冒頭コメント・tests/onlineBattleSongAvailability.test.js参照）。

import { ref, get, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { database, authReady, getCurrentUid } from "./firebaseClient.js";
import { restrictSongPoolToCommonAvailability, computeRoomCommonSongPool } from "./onlineBattleSongAvailabilityPayloads.js";

export { restrictSongPoolToCommonAvailability, computeRoomCommonSongPool };

// 所持データの種類ごとに、rooms/{roomId}/players/{uid}のどのフィールドへ書き込む／
// 読み取るかを1箇所にまとめる（2026-08-27拡張：歌詞クイズ対戦も同じ仕組みで
// 絞り込めるよう、音源専用だった設計を種類ごとに一般化した）。
const AVAILABILITY_FIELD_BY_KIND = {
  audio: "availableAudioSongIds",
  lyrics: "availableLyricsSongIds",
};

// この端末の所持曲一覧（音源または歌詞）を、今いるルームへ書き込む。ロビー画面へ入った
// タイミング・準備完了を押したタイミング等、繰り返し呼んでも安全（同じ値で上書きするだけ）。
// 【重要】失敗しても例外を外へは投げない（Firebaseルール未対応・通信不調のいずれでも、
// ロビー画面の他の操作を妨げてはならないため）。
export async function reportMyAvailableSongIdsForKind({ roomId, kind, availableSongIds }) {
  try {
    await authReady;
    const uid = getCurrentUid();
    if (!uid) return;
    const field = AVAILABILITY_FIELD_BY_KIND[kind];
    await update(ref(database, `rooms/${roomId}/players/${uid}`), {
      [field]: availableSongIds,
    });
  } catch {
    // ルール未対応・通信不調等で書き込めなくても、致命的ではない。
    // この参加者は「所持曲を報告していない」扱いとなり、対戦開始時の絞り込みからは
    // 除外される（＝今までどおり、そのまま出題される）。
  }
}

// 現在のルームの参加者（players）全員について、指定した種類の所持曲一覧を読み取る。
// 読み取れなかった・そもそも書き込まれていない参加者はnullとして返す。
// 戻り値: (string[] | null)[]
export async function fetchParticipantsAvailableSongIdsForKind({ roomId, playerUids, kind }) {
  const field = AVAILABILITY_FIELD_BY_KIND[kind];
  const results = await Promise.all(
    playerUids.map(async (uid) => {
      try {
        const snapshot = await get(ref(database, `rooms/${roomId}/players/${uid}/${field}`));
        const value = snapshot.val();
        return Array.isArray(value) ? value : null;
      } catch {
        return null;
      }
    })
  );
  return results;
}

// startBattle()の直前に呼ぶ想定のヘルパー。settings.questionSourceが指す出題対象
// （resolveQuestionSourceSongPool等で解決済みのsongPool）を、参加者全員の共通曲へ絞り込み、
// 絞り込んだ結果を settings.questionSource = { type: "collaborativeSelection", songIds } の
// 形へ書き換える（既存のcollaborativeSelectionの仕組みをそのまま使うことで、
// js/battleModes/timeAttackBattleMode.js等の既存コードには一切手を入れない設計）。
//
// kind："audio"（イントロ対戦・ランダム再生対戦）または"lyrics"（歌詞クイズ対戦）。
// js/battleModes/index.jsのgetAvailabilityKind(gameMode)が返す値をそのまま渡す想定
// （省略時は後方互換のため"audio"扱いにする）。
//
// 共通曲での絞り込みが不要（誰も報告していない・絞り込んでも変化がない）な場合は、
// 渡されたsettingsをそのまま返す（余計な書き換えをしない）。
export async function restrictSettingsToCommonlyAvailableSongs({
  roomId,
  playerUids,
  settings,
  resolvedSongPool,
  kind = "audio",
}) {
  const availabilityList = await fetchParticipantsAvailableSongIdsForKind({ roomId, playerUids, kind });
  const restrictedPool = restrictSongPoolToCommonAvailability(resolvedSongPool, availabilityList);

  if (restrictedPool.length === resolvedSongPool.length) {
    return settings; // 絞り込みの必要が無かった（今までと同じ出題範囲）
  }

  // 【2026-09-05追加・実機・実Firebaseで確認：同種不具合の横断監査で発見】
  // ここで作るcollaborativeSelectionは、ホストが「④曲を選んで出題」を選んで
  // 参加者が手動で選んだ曲（js/onlineBattleScreen.jsのopenCollabSongPicker等）とは
  // 出自が全く違う、システムが自動的に付け足した一時的な絞り込みでしかない。
  // この違いを区別するタグを付けないと、①②③のカテゴリ選択中でも常時ホスト側で動いている
  // syncCollaborativeSongPoolIfHost()（参加者のselectedSongIds集合とsongIdsを同期させる
  // 仕組み）が「④が手動選択された」と誤認し、まだ誰も選曲画面を開いていない
  // （selectedSongIds空）ことを理由にsongIdsを0件へ上書きしてしまい、「出題する曲が
  // 選ばれていません」で再戦がブロックされる不具合が実機・実Firebaseで再現した
  // （歌詞クイズ対戦のモード切替が原因だった以前の不具合1とは別の発生経路）。
  // autoRestrictedToCommonSongs:trueを付けることで、syncCollaborativeSongPoolIfHost()・
  // js/onlineBattleSongSourceUi.jsのresolveSongSourceOptionValue()・
  // js/onlineBattle.jsのwasCollaborativeSelection判定（モード変更時の引き継ぎ）の
  // 3箇所に「これは④の手動選択ではない」と伝え、それぞれ安全側の動作（上書きしない・
  // ④として表示しない・引き継がない）に倒す。
  return {
    ...settings,
    questionSource: { type: "collaborativeSelection", songIds: restrictedPool, autoRestrictedToCommonSongs: true },
  };
}
