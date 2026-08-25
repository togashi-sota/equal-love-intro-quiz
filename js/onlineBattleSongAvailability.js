// オンライン対戦（タイムアタック・ランダム再生）で、参加者全員が実際に再生できる曲だけを
// 出題対象にするための、共通曲（intersection）判定を担当するファイル（2026-08-26新設）。
//
// 【設計方針・重要】新曲データパック（js/dataPackImport.js）の導入により、端末によって
// 「持っている曲」が異なる状態（例：Aさんは20枚目まで、Bさん・Cさんは21枚目まで）が
// 正式に起こりうるようになった。オンライン対戦で21枚目の曲を出題してしまうと、
// それを持っていない参加者が再生できず、対戦が成立しない。そこで、対戦開始の直前に
// 「参加者全員の音源所持曲IDの共通部分（intersection）」を計算し、それを実際の出題対象
// （settings.questionSource）へ反映してからstartBattle()を呼ぶ。
//
// 【安全設計：Firebaseルール未対応でも壊れない】この機能は、各参加者がロビー入室時に
// 自分の所持曲ID一覧をrooms/{roomId}/players/{uid}/availableAudioSongIdsへ書き込むことを
// 前提にしている。この新しいフィールドを許可するには、本番のFirebaseセキュリティルールの
// 更新が別途必要（このセッションでは実施しない、本人の確認・承認を経てから公開する
// 既存の運用ルールに従う）。ルールがまだ許可していない環境では書き込みが失敗するが、
// その場合は例外を握りつぶし、「誰からも所持曲の報告が無かった」状態として扱う。
// js/onlineBattleSongAvailabilityPayloads.jsのrestrictSongPoolToCommonAvailability()は
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
import { restrictSongPoolToCommonAvailability } from "./onlineBattleSongAvailabilityPayloads.js";

export { restrictSongPoolToCommonAvailability };

// この端末の音源所持曲一覧を、今いるルームへ書き込む。ロビー画面へ入ったタイミング・
// 準備完了を押したタイミング等、繰り返し呼んでも安全（同じ値で上書きするだけ）。
// 【重要】失敗しても例外を外へは投げない（Firebaseルール未対応・通信不調のいずれでも、
// ロビー画面の他の操作を妨げてはならないため）。
export async function reportMyAvailableAudioSongIds({ roomId, availableSongIds }) {
  try {
    await authReady;
    const uid = getCurrentUid();
    if (!uid) return;
    await update(ref(database, `rooms/${roomId}/players/${uid}`), {
      availableAudioSongIds: availableSongIds,
    });
  } catch {
    // ルール未対応・通信不調等で書き込めなくても、致命的ではない。
    // この参加者は「所持曲を報告していない」扱いとなり、対戦開始時の絞り込みからは
    // 除外される（＝今までどおり、そのまま出題される）。
  }
}

// 現在のルームの参加者（players）全員について、availableAudioSongIdsを読み取る。
// 読み取れなかった・そもそも書き込まれていない参加者はnullとして返す。
// 戻り値: (string[] | null)[]
export async function fetchParticipantsAvailableAudioSongIds({ roomId, playerUids }) {
  const results = await Promise.all(
    playerUids.map(async (uid) => {
      try {
        const snapshot = await get(ref(database, `rooms/${roomId}/players/${uid}/availableAudioSongIds`));
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
// 共通曲での絞り込みが不要（誰も報告していない・絞り込んでも変化がない）な場合は、
// 渡されたsettingsをそのまま返す（余計な書き換えをしない）。
export async function restrictSettingsToCommonlyAvailableSongs({ roomId, playerUids, settings, resolvedSongPool }) {
  const availabilityList = await fetchParticipantsAvailableAudioSongIds({ roomId, playerUids });
  const restrictedPool = restrictSongPoolToCommonAvailability(resolvedSongPool, availabilityList);

  if (restrictedPool.length === resolvedSongPool.length) {
    return settings; // 絞り込みの必要が無かった（今までと同じ出題範囲）
  }

  return {
    ...settings,
    questionSource: { type: "collaborativeSelection", songIds: restrictedPool },
  };
}
