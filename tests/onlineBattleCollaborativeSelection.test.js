// js/onlineBattleCollaborativeSelectionPayloads.js（オンライン対戦の共同選曲）のテスト。
//
// 【Firebaseに触れないテストにしている理由】js/onlineBattleSongAvailability.test.jsと
// 同じ理由・同じ分離パターン（冒頭コメント参照）。ここではrooms/{roomId}/playersの
// 生データ形（{ [uid]: { selectedSongIds } }）を模したオブジェクトを直接渡し、
// Firebase・DOMに一切触れない純粋関数だけを検証する。

import {
  computeMergedSelectedSongIds,
  areSongIdSetsEqual,
  buildSelectionBreakdownByPlayer,
  buildSelectorUidsBySongId,
} from "../js/onlineBattleCollaborativeSelectionPayloads.js";
import { assertEqual } from "./test-utils.js";

export function runOnlineBattleCollaborativeSelectionTests() {
  // ---- computeMergedSelectedSongIds：基本の和集合 ----
  {
    const players = {
      a: { selectedSongIds: ["love", "start"] },
      b: { selectedSongIds: ["citron"] },
    };
    assertEqual(
      computeMergedSelectedSongIds(players),
      ["love", "start", "citron"],
      "参加者2人の選択がそのまま和集合になる（本人指示：全員で1つの出題曲リストを共同編集）"
    );
  }

  // ---- 同じ曲を複数人が選んだ場合：重複は1件にまとめる ----
  {
    const players = {
      a: { selectedSongIds: ["love", "start"] },
      b: { selectedSongIds: ["start", "citron"] },
    };
    assertEqual(
      computeMergedSelectedSongIds(players),
      ["love", "start", "citron"],
      "同じ曲を複数人が選んでも、和集合では1件にまとめられる（重複しない）"
    );
  }

  // ---- 誰も選んでいない（フィールド無し・空配列）参加者が混ざっていても安全 ----
  {
    const players = {
      a: { selectedSongIds: ["love"] },
      b: {}, // selectedSongIds未設定（まだ一度も選んだことがない参加者）
      c: { selectedSongIds: [] },
    };
    assertEqual(computeMergedSelectedSongIds(players), ["love"], "未選択の参加者が混ざっていても、選択済みの曲だけが和集合に入る");
  }

  // ---- 誰も選んでいない場合：空配列を返す ----
  assertEqual(computeMergedSelectedSongIds({}), [], "参加者が1人もいなければ空配列を返す");
  assertEqual(
    computeMergedSelectedSongIds({ a: {}, b: {} }),
    [],
    "全員が未選択なら空配列を返す"
  );

  // ---- 参加者が退出する（playersから消える）と、その人の選択も自動的に和集合から外れる ----
  {
    const withThreePlayers = {
      a: { selectedSongIds: ["love"] },
      b: { selectedSongIds: ["start"] },
      c: { selectedSongIds: ["citron"] },
    };
    const { c, ...afterLeave } = withThreePlayers;
    assertEqual(
      computeMergedSelectedSongIds(afterLeave),
      ["love", "start"],
      "参加者が退出してplayersから消えると、その人が選んでいた曲も和集合から自動的に外れる"
    );
  }

  // ---- areSongIdSetsEqual：並び順が違っても中身が同じなら等しいと判定する ----
  assertEqual(areSongIdSetsEqual(["a", "b", "c"], ["c", "a", "b"]), true, "並び順が違っても同じ集合ならtrue");
  assertEqual(areSongIdSetsEqual(["a", "b"], ["a", "b", "c"]), false, "件数が違えばfalse");
  assertEqual(areSongIdSetsEqual(["a", "b"], ["a", "c"]), false, "中身が違えばfalse");
  assertEqual(areSongIdSetsEqual([], []), true, "どちらも空なら等しいと判定する（ホストの自動同期が無駄な書き込みをしないための判定）");

  // ==== buildSelectionBreakdownByPlayer（誰がどの曲を選んだか一覧、2026-09-14新設）====
  {
    const players = {
      a: { displayName: "がしお", selectedSongIds: ["love", "start"] },
      b: { displayName: "サブ", selectedSongIds: ["citron"] },
      c: { displayName: "未選択さん", selectedSongIds: [] },
      d: { displayName: "フィールド無しさん" }, // selectedSongIds自体が無い参加者
    };
    const breakdown = buildSelectionBreakdownByPlayer(players);
    assertEqual(breakdown.length, 2, "1曲も選んでいない参加者（空配列・フィールド無し）は一覧から除外される");
    assertEqual(
      breakdown.map((entry) => entry.uid).sort(),
      ["a", "b"],
      "選択済みの参加者だけが一覧に残る"
    );
    const gashioEntry = breakdown.find((entry) => entry.uid === "a");
    assertEqual(gashioEntry.displayName, "がしお", "表示名がそのまま引き継がれる");
    assertEqual(gashioEntry.songIds, ["love", "start"], "その人が選んだ曲のid配列がそのまま入る");

    assertEqual(buildSelectionBreakdownByPlayer({}), [], "参加者が1人もいなければ空配列を返す");
    assertEqual(buildSelectionBreakdownByPlayer(undefined), [], "playersがundefinedでも安全に空配列を返す");

    // 表示名が無い場合の安全なフォールバック（displayNameもnameも無い参加者）。
    const noNamePlayers = { x: { selectedSongIds: ["love"] } };
    assertEqual(
      buildSelectionBreakdownByPlayer(noNamePlayers)[0].displayName,
      "参加者",
      "displayName・nameのいずれも無い場合は「参加者」という安全なフォールバック文言になる"
    );
  }

  // ==== buildSelectorUidsBySongId（曲id→選択した参加者一覧、2026-09-14新設）====
  {
    // 同じ曲を複数人が選んでいる場合、その全員のuidが集まる（本人指示：誰が選んだか確認できる）。
    const players = {
      a: { selectedSongIds: ["love", "citron"] },
      b: { selectedSongIds: ["citron", "start"] },
      c: { selectedSongIds: ["citron"] },
    };
    const bySong = buildSelectorUidsBySongId(players);
    assertEqual(bySong.citron.sort(), ["a", "b", "c"], "3人が選んだ曲は、選択した3人全員のuidを持つ");
    assertEqual(bySong.love, ["a"], "1人だけが選んだ曲は、その1人のuidだけを持つ");
    assertEqual(bySong.start, ["b"], "同様に1人だけの曲");
    assertEqual(Object.keys(bySong).sort(), ["citron", "love", "start"], "選ばれた曲だけがキーとして存在する（選ばれていない曲は含まれない）");

    // ---- 自分の解除：本人の選択だけがuid配列から外れ、他人の選択・曲自体は残る ----
    const afterOwnRemoval = {
      a: { selectedSongIds: ["love"] }, // citronを解除した
      b: { selectedSongIds: ["citron", "start"] },
      c: { selectedSongIds: ["citron"] },
    };
    const bySongAfterRemoval = buildSelectorUidsBySongId(afterOwnRemoval);
    assertEqual(
      bySongAfterRemoval.citron.sort(),
      ["b", "c"],
      "aがcitronを解除すると、citronの選択者からaだけが消え、b・cの選択とcitron自体は残る（本人指示：自分の曲だけ解除可能）"
    );

    // ---- 退出者の選択削除：playersオブジェクトから消えれば、その人の分だけ自動的に外れる ----
    const { c: leftPlayer, ...afterLeave } = players;
    void leftPlayer;
    const bySongAfterLeave = buildSelectorUidsBySongId(afterLeave);
    assertEqual(
      bySongAfterLeave.citron.sort(),
      ["a", "b"],
      "cが退出（playersから消える）すると、citronの選択者からcだけが自動的に外れる"
    );

    assertEqual(buildSelectorUidsBySongId({}), {}, "参加者が1人もいなければ空オブジェクトを返す");
    assertEqual(buildSelectorUidsBySongId(undefined), {}, "playersがundefinedでも安全に空オブジェクトを返す");
  }
}
