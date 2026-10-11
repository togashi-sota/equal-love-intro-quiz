// 【2026-10-11新設】フレンド画面の「オンライン状態の送信」診断（js/presenceDiagnostics.js）のテスト。
import { describePresenceDiagnostics } from "../js/presenceDiagnostics.js";
import { assertEqual } from "./test-utils.js";

const base = { sharing: true, identity: "ready", profileSync: "ok", tracking: false, connected: false, writeError: null };

export function runPresenceDiagnosticsTests() {
  const d = (patch) => describePresenceDiagnostics({ ...base, ...patch });

  assertEqual(d({ tracking: true, connected: true }).verdict, "動作中", "動作中：送信を開始して接続済み");
  assertEqual(d({ tracking: true, connected: true }).tone, "ok", "動作中は ok");
  assertEqual(d({ tracking: true, connected: false }).verdict, "接続待ち", "送信開始済みで接続待ち");
  assertEqual(d({ sharing: false }).verdict.includes("公開がOFF"), true, "公開OFFなら停止（OFFが理由）");
  assertEqual(d({ sharing: false, tracking: true, connected: true }).verdict.includes("公開がOFF"), true, "公開OFFは他の状態より優先");
  assertEqual(
    d({ tracking: true, connected: true, writeError: "PERMISSION_DENIED" }).verdict,
    "エラー（PERMISSION_DENIED）",
    "在席ノードの書き込み拒否（今のIDに公開プロフィールが無い等）をエラーとして出す"
  );
  assertEqual(
    d({ identity: "unresolved", profileSync: "identity" }).verdict,
    "停止（本人確認が未完了：unresolved）",
    "本人確認が未完了（unresolved）で停止"
  );
  assertEqual(d({ identity: "pending", profileSync: "identity" }).verdict.includes("pending"), true, "pending も理由に出る");
  assertEqual(d({ profileSync: "no-key" }).verdict.includes("本人キー"), true, "本人キーを作れない場合");
  assertEqual(d({ profileSync: "no-uid" }).verdict.includes("ログインID"), true, "ログインIDを取得できない場合");
  assertEqual(d({ profileSync: "error" }).verdict.includes("更新に失敗"), true, "公開プロフィール更新の失敗");
  assertEqual(d({ sharing: null, profileSync: null, identity: null }).verdict, "判定中", "起動直後は判定中");
  assertEqual(d({ profileSync: "ok" }).verdict.includes("理由を特定できません"), true, "ready・同期OKなのに停止のままなら「理由を特定できません」");
  const detail = d({ writeError: "x" }).detail;
  assertEqual(["公開：ON", "本人確認：ready", "プロフィール同期：ok", "接続：未", "書込エラー：x"].every((text) => detail.includes(text)), true, "詳細行に5項目が出る");
  assertEqual(typeof describePresenceDiagnostics().verdict, "string", "引数なしでも落ちない");
}
