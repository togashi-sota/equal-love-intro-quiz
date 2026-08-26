// js/onlineBattleSongAvailability.js（オンライン対戦の共通曲＝intersection判定）のテスト。
//
// 【Firebaseに触れないテストにしている理由】reportMyAvailableAudioSongIds・
// fetchParticipantsAvailableAudioSongIds・restrictSettingsToCommonlyAvailableSongsは、
// いずれも実際のFirebase Realtime Databaseへ読み書きする関数のため、自動テストからは呼ばない
// （このプロジェクトの既存テストが、実際の書き込みを伴う関数を自動テストの対象外にしている
// 方針と同じ。tests/callStorage.test.js等を参照）。js/onlineBattleSongAvailability.js自体は
// Firebase SDKの初期化コード（js/firebaseClient.js）をimportしているため、このテストファイルは
// 判定ロジックだけを切り出したjs/onlineBattleSongAvailabilityPayloads.jsを直接importする
// （js/lyricsQuizBattleFirebasePayloads.jsと同じ分離パターン。詳細はそちらのファイル・
// js/onlineBattleSongAvailability.js冒頭コメント参照）。
// このファイルは、Firebase・DOMに一切触れない純粋関数restrictSongPoolToCommonAvailability()
// だけを対象にする（オンライン対戦で「参加者全員が実際に再生できる曲だけに絞り込む」という、
// このファイルの中核ロジック）。
//
// 本人指示（G）：「時間アタック対戦で、参加者A（20枚目まで）・B/C（21枚目まで）が
// 一緒に対戦する場合、出題範囲はA∩B∩C（20枚目までの共通部分）になるべき」を、
// 「最も所持曲が少ない人に合わせる」ではなく「実際のID集合の共通部分」で判定できているかを
// 中心に確認する（本人の例：曲が歯抜けの場合でも正しく動くこと）。

import { restrictSongPoolToCommonAvailability, computeRoomCommonSongPool } from "../js/onlineBattleSongAvailabilityPayloads.js";
import { assertEqual } from "./test-utils.js";

export function runOnlineBattleSongAvailabilityTests() {
  // ---- 誰も報告していない場合：絞り込みを行わない（Firebaseルール未対応時の安全な既定動作） ----
  assertEqual(
    restrictSongPoolToCommonAvailability(["a", "b", "c"], []),
    ["a", "b", "c"],
    "誰も所持曲を報告していなければ、絞り込みを行わずbasePoolをそのまま返す"
  );
  assertEqual(
    restrictSongPoolToCommonAvailability(["a", "b", "c"], [null, undefined]),
    ["a", "b", "c"],
    "全員がnull/undefined（未報告）の場合も、絞り込みを行わない"
  );

  // ---- 本人の例そのもの：A={1..20}, B={1..21}, C={1..21} → 共通部分はA（20枚目まで） ----
  {
    const basePool = Array.from({ length: 21 }, (_, i) => `song-${i + 1}`); // song-1〜song-21
    const playerA = Array.from({ length: 20 }, (_, i) => `song-${i + 1}`); // song-1〜song-20のみ
    const playerB = Array.from({ length: 21 }, (_, i) => `song-${i + 1}`); // song-1〜song-21
    const playerC = Array.from({ length: 21 }, (_, i) => `song-${i + 1}`); // song-1〜song-21

    const restricted = restrictSongPoolToCommonAvailability(basePool, [playerA, playerB, playerC]);
    assertEqual(
      restricted,
      Array.from({ length: 20 }, (_, i) => `song-${i + 1}`),
      "A(20枚目まで)・B/C(21枚目まで)の共通曲は、21枚目の曲を含まないA∩B∩Cになる"
    );
  }

  // ---- 曲が歯抜けの場合でも、「N曲まで」ではなく実際の集合の交差で正しく判定される ----
  {
    const basePool = ["song-1", "song-2", "song-3", "song-4", "song-5"];
    // Aはsong-3が欠けている（歯抜け）、Bはsong-5が欠けている
    const playerA = ["song-1", "song-2", "song-4", "song-5"];
    const playerB = ["song-1", "song-2", "song-3", "song-4"];

    const restricted = restrictSongPoolToCommonAvailability(basePool, [playerA, playerB]);
    assertEqual(
      restricted,
      ["song-1", "song-2", "song-4"],
      "歯抜けの所持状況でも、単純な曲数の最小値ではなく実際のID集合の共通部分で絞り込まれる"
    );
  }

  // ---- basePoolの並び順は維持される ----
  {
    const basePool = ["z", "a", "m"];
    const restricted = restrictSongPoolToCommonAvailability(basePool, [["a", "z"]]);
    assertEqual(restricted, ["z", "a"], "絞り込み後もbasePoolの並び順は維持される");
  }

  // ---- 誰か1人でも報告していれば、その人（たち）だけを対象に絞り込む（未報告者は判定から除外） ----
  {
    const basePool = ["a", "b", "c"];
    const restricted = restrictSongPoolToCommonAvailability(basePool, [["a", "b"], null]);
    assertEqual(
      restricted,
      ["a", "b"],
      "未報告の参加者（null）は判定から除外され、報告済みの参加者の所持曲だけで絞り込まれる"
    );
  }

  // ---- 全員が全曲持っていれば、絞り込みは発生しない（basePoolと完全一致） ----
  {
    const basePool = ["a", "b", "c"];
    const restricted = restrictSongPoolToCommonAvailability(basePool, [
      ["a", "b", "c"],
      ["a", "b", "c"],
    ]);
    assertEqual(restricted, ["a", "b", "c"], "全員が全曲持っていれば、basePoolのまま変化しない");
  }

  // ===== computeRoomCommonSongPool（2026-08-27新設） =====
  // rooms/{roomId}/players（Firebaseの生データそのままの形）から、今この瞬間ルームに
  // いる全員の共通曲を計算する窓口。本人が指定した代表ケースA〜Iのうち、Firebase・DOMに
  // 一切触れない範囲（純粋関数として検証できる部分）をここで確認する。
  {
    const allSongs84 = Array.from({ length: 84 }, (_, i) => `song-${i + 1}`);
    const allSongs81 = allSongs84.slice(0, 81);
    const allSongs50 = allSongs84.slice(0, 50);

    // ケースA：A=84曲、B=84曲 → 84曲使用可能
    {
      const players = { a: { availableAudioSongIds: allSongs84 }, b: { availableAudioSongIds: allSongs84 } };
      const pool = computeRoomCommonSongPool({ allEligibleSongIds: allSongs84, players, kind: "audio" });
      assertEqual(pool.length, 84, "ケースA：84曲・84曲の参加者2人なら共通84曲になる");
    }

    // ケースB：A=84曲、B=81曲 → 共通81曲のみ（21st等の3曲は対象外）
    {
      const players = { a: { availableAudioSongIds: allSongs84 }, b: { availableAudioSongIds: allSongs81 } };
      const pool = computeRoomCommonSongPool({ allEligibleSongIds: allSongs84, players, kind: "audio" });
      assertEqual(pool, allSongs81, "ケースB：84曲と81曲の参加者では、共通81曲だけが使用可能になる");
    }

    // ケースC：A=84曲、B=81曲、C=50曲 → 3人のintersectionだけ使用（50曲）
    {
      const players = {
        a: { availableAudioSongIds: allSongs84 },
        b: { availableAudioSongIds: allSongs81 },
        c: { availableAudioSongIds: allSongs50 },
      };
      const pool = computeRoomCommonSongPool({ allEligibleSongIds: allSongs84, players, kind: "audio" });
      assertEqual(pool, allSongs50, "ケースC：3人のうち最も少ないCの曲数と、実際の共通部分が一致する");
    }

    // ケースD：A=50曲、B=50曲だが中身が一部違う → 単純な50曲ではなく本当の共通部分になる
    {
      const playerA = ["song-1", "song-2", "song-3", "song-4", "song-5"];
      const playerB = ["song-1", "song-2", "song-3", "song-4", "song-99"]; // song-5の代わりにsong-99を持つ
      const players = { a: { availableAudioSongIds: playerA }, b: { availableAudioSongIds: playerB } };
      const pool = computeRoomCommonSongPool({
        allEligibleSongIds: ["song-1", "song-2", "song-3", "song-4", "song-5", "song-99"],
        players,
        kind: "audio",
      });
      assertEqual(
        pool,
        ["song-1", "song-2", "song-3", "song-4"],
        "ケースD：曲数が同じでも中身が違えば、一致する4曲だけが共通曲になる（5曲にはならない）"
      );
    }

    // ケースE：共通0曲 → 空配列になる（開始不可の判定は呼び出し側＝js/onlineBattle.jsの役目）
    {
      const players = { a: { availableAudioSongIds: ["song-1"] }, b: { availableAudioSongIds: ["song-2"] } };
      const pool = computeRoomCommonSongPool({ allEligibleSongIds: ["song-1", "song-2"], players, kind: "audio" });
      assertEqual(pool, [], "ケースE：共通する曲が1つも無ければ空配列になる");
    }

    // ケースH：参加者が途中参加して共通曲が減る（players集合の変化に追従する）
    {
      const beforeJoin = { a: { availableAudioSongIds: allSongs84 }, b: { availableAudioSongIds: allSongs84 } };
      const afterJoin = { ...beforeJoin, c: { availableAudioSongIds: allSongs50 } };
      const poolBefore = computeRoomCommonSongPool({ allEligibleSongIds: allSongs84, players: beforeJoin, kind: "audio" });
      const poolAfter = computeRoomCommonSongPool({ allEligibleSongIds: allSongs84, players: afterJoin, kind: "audio" });
      assertEqual(poolBefore.length, 84, "ケースH：Cが入る前はA・Bの共通84曲");
      assertEqual(poolAfter, allSongs50, "ケースH：Cが入室した瞬間、共通曲が50曲へ再計算される");
    }

    // ケースI：その参加者が退出する（players集合から取り除かれると元に戻る）
    {
      const withC = {
        a: { availableAudioSongIds: allSongs84 },
        b: { availableAudioSongIds: allSongs84 },
        c: { availableAudioSongIds: allSongs50 },
      };
      const { c, ...afterLeave } = withC;
      const poolAfterLeave = computeRoomCommonSongPool({ allEligibleSongIds: allSongs84, players: afterLeave, kind: "audio" });
      assertEqual(poolAfterLeave.length, 84, "ケースI：Cが退出すると、残ったA・Bの共通84曲へ戻る");
    }

    // kind="lyrics"：音源(availableAudioSongIds)ではなくavailableLyricsSongIdsで判定する
    {
      const players = {
        a: { availableAudioSongIds: allSongs84, availableLyricsSongIds: ["song-1", "song-2"] },
        b: { availableAudioSongIds: allSongs84, availableLyricsSongIds: ["song-1"] },
      };
      const pool = computeRoomCommonSongPool({ allEligibleSongIds: allSongs84, players, kind: "lyrics" });
      assertEqual(pool, ["song-1"], "kind:lyricsのときは、availableAudioSongIdsではなくavailableLyricsSongIdsで絞り込む");
    }

    // 未報告の参加者が混ざっていても安全（null相当として扱われる）
    {
      const players = { a: { availableAudioSongIds: ["song-1", "song-2"] }, b: {} };
      const pool = computeRoomCommonSongPool({ allEligibleSongIds: ["song-1", "song-2"], players, kind: "audio" });
      assertEqual(pool, ["song-1", "song-2"], "所持曲を報告していない参加者（フィールド無し）がいても、絞り込みを行わず安全に扱う");
    }
  }
}
