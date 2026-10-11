// 【2026-10-11新設・本人指示】フレンド画面に出す「オンライン状態の送信」診断。
// 「オンライン対戦はできるのに、フレンド一覧で自分がオンラインにならない」原因を、実機の画面1枚で
// 特定できるようにするための表示専用の仕組み（abekunの不具合調査がきっかけ）。
// presence・公開プロフィールの動作自体は一切変えない。各所が「いま何が起きたか」を setPresenceFact() で
// 記録するだけで、ここは Firebase にも DOM にも触れない（テストで直接検証できるようにするため）。
//
// facts のキー：
//   sharing      … 公開プロフィールの設定（true=ON / false=OFF / null=未判定）
//   identity     … 本人確認の関門の状態（"ready" | "pending" | "migrating" | "unresolved" | null）
//   profileSync  … 公開プロフィールの同期結果（"ok" | "identity" | "no-key" | "no-uid" | "error" | null）
//   tracking     … presence の送信を開始しているか（true/false）
//   connected    … Firebase の接続が確立して在席ノードを作ったか（true/false）
//   writeError   … 在席ノードの書き込みが拒否・失敗したときのエラーコード（なければ null）
const facts = {
  sharing: null,
  identity: null,
  profileSync: null,
  tracking: false,
  connected: false,
  writeError: null,
};

export function setPresenceFact(key, value) {
  if (Object.prototype.hasOwnProperty.call(facts, key)) {
    facts[key] = value;
  }
}

export function getPresenceFacts() {
  return { ...facts };
}

// 診断結果を { verdict, tone, detail } にまとめる。tone は "ok"（動作中）／"wait"（待ち）／"ng"（停止・エラー）。
export function describePresenceDiagnostics(input = facts) {
  const f = { ...facts, ...input };
  const detail = [
    `公開：${f.sharing === null ? "未判定" : f.sharing ? "ON" : "OFF"}`,
    `本人確認：${f.identity ?? "未判定"}`,
    `プロフィール同期：${f.profileSync ?? "未実行"}`,
    `接続：${f.connected ? "済" : "未"}`,
    `書込エラー：${f.writeError ?? "なし"}`,
  ].join(" ／ ");

  if (f.sharing === false) {
    return { verdict: "停止（公開がOFFのため送信しません）", tone: "ng", detail };
  }
  if (f.writeError) {
    return { verdict: `エラー（${f.writeError}）`, tone: "ng", detail };
  }
  if (f.tracking && f.connected) {
    return { verdict: "動作中", tone: "ok", detail };
  }
  if (f.tracking) {
    return { verdict: "接続待ち", tone: "wait", detail };
  }
  if (f.profileSync === "identity" || (f.identity && f.identity !== "ready")) {
    return { verdict: `停止（本人確認が未完了：${f.identity ?? "不明"}）`, tone: "ng", detail };
  }
  if (f.profileSync === "no-key") return { verdict: "停止（本人キーを作れず公開プロフィールを更新できません）", tone: "ng", detail };
  if (f.profileSync === "no-uid") return { verdict: "停止（ログインIDを取得できません）", tone: "ng", detail };
  if (f.profileSync === "error") return { verdict: "停止（公開プロフィールの更新に失敗）", tone: "ng", detail };
  if (f.sharing === null && f.profileSync === null) return { verdict: "判定中", tone: "wait", detail };
  return { verdict: "停止（理由を特定できません）", tone: "ng", detail };
}
