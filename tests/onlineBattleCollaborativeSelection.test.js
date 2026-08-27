// js/onlineBattleCollaborativeSelectionPayloads.js（オンライン対戦の共同選曲）のテスト。
//
// 【Firebaseに触れないテストにしている理由】js/onlineBattleSongAvailability.test.jsと
// 同じ理由・同じ分離パターン（冒頭コメント参照）。ここではrooms/{roomId}/playersの
// 生データ形（{ [uid]: { selectedSongIds } }）を模したオブジェクトを直接渡し、
// Firebase・DOMに一切触れない純粋関数だけを検証する。

import {
  computeMergedSelectedSongIds,
  areSongIdSetsEqual,
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
}
