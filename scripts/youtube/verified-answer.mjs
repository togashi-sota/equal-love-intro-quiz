// YouTube 出演図鑑：本人の確認の答え（確認の資料の HTML で作った JSON の1件）を確かめて、登録の形にする（2026-11-03 R12）。
// scripts/youtube/import-verified.mjs と tests から使う。ファイル・通信には触れない。
// 決まり：サムネイルだけで判断したものは、本編の出演（memberIds）に入れない（「サムネイルに登場」にする）
export function normalizeAnswerItem(item, memberIds) {
  const warnings = [];
  if (!/^[A-Za-z0-9_-]{11}$/.test(String(item?.videoId))) throw new Error(`動画 ID の形が違う：${item?.videoId}`);
  const decision = ["include", "exclude", "hold"].includes(item.decision) ? item.decision : null;
  if (!decision) throw new Error(`${item.videoId}：decision は include／exclude／hold のどれか`);
  const pick = (list, label) => {
    const ids = [...new Set(Array.isArray(list) ? list : [])];
    const unknown = ids.filter((id) => !memberIds.has(id));
    if (unknown.length) throw new Error(`${item.videoId}：${label} に知らないメンバー（${unknown.join(", ")}）`);
    return ids;
  };
  let main = pick(item.memberIds, "memberIds");
  const footage = pick(item.footageMemberIds, "footageMemberIds").filter((id) => !main.includes(id));
  let thumbnail = pick(item.thumbnailMemberIds, "thumbnailMemberIds");
  const notAppearing = pick(item.notAppearingMemberIds, "notAppearingMemberIds");
  const basis = ["thumbnail", "full-video", "live-footage"].includes(item.basis) ? item.basis : null;
  if (decision === "include" && !basis) throw new Error(`${item.videoId}：「サムネイルで判断／本編まで見た」のどちらかを選んでください`);
  if (basis === "thumbnail" && main.length) {
    // サムネイルだけで判断したのに「本編」を選んだ人は、本編まで確かめたと書かない
    warnings.push(`${item.videoId}：サムネイルで判断なので、「本編」を選んだ ${main.join(", ")} は「サムネイルに登場」として登録します`);
    thumbnail = [...new Set([...thumbnail, ...main])];
    main = [];
  }
  thumbnail = thumbnail.filter((id) => !main.includes(id) && !footage.includes(id));
  if (decision === "include" && !main.length && !footage.length && !thumbnail.length) warnings.push(`${item.videoId}：メンバーが1人も選ばれていません（＝LOVE の動画として、メンバーなしで登録します）`);
  const note = String(item.note ?? "").trim().slice(0, 200);
  const verifiedOn = /^\d{4}-\d{2}-\d{2}$/.test(String(item.verifiedOn)) ? item.verifiedOn : new Date().toISOString().slice(0, 10);
  return {
    entry: { videoId: item.videoId, decision, memberIds: main, footageMemberIds: footage, thumbnailMemberIds: thumbnail, notAppearingMemberIds: notAppearing, basis, verifiedBy: "owner", verifiedOn, note },
    warnings,
  };
}

