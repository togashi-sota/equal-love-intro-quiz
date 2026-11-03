// 「YouTube 出演図鑑」の、推定の判定（2026-11-03新設・本人の依頼 R12 の最終の調整）。git に入れる。
//
// 【これは何か】動画の文字（説明欄の公式の出演者の表記など）だけでは決められないが、サムネイルの人数・公式の説明の文などから推して、
//   本人が「この推定で載せてよい」と採用したもの。**本人が一人ずつ確かめた判定ではない**ので、画面では「推定」と表示する
//   （「本人が確認」とは出さない）。
// 【本人の確認に変える】本人が動画・サムネイルで全員を特定できたら、確認の資料（tools の youtube-review.html）の答えを
//   scripts/youtube/import-verified.mjs で js/data/youtubeVerifiedJudgments.js に足す。同じ動画は本人の確認が優先される
//   （このファイルの1行は、そのあとで消してよい）。
// 【書かないもの】YouTube API のデータ（タイトル・説明など）。書くのは動画 ID・メンバー・推定の理由（自分の言葉）だけ。
//
// 【欄】
// - videoId：動画 ID
// - thumbnailMemberIds：サムネイルに登場したと推定されるメンバー（本編の出演 memberIds とは別）
// - memberIds・footageMemberIds：本編の出演・映像で登場（推定のときは、ふつうは空）
// - basis："thumbnail-count-and-official-text"（サムネイルの人数と公式の説明からの推定）など
// - source："inference"（推定）／approvedBy："owner"（本人がこの推定で載せることを採用）／approvedOn：採用した日
// - note：推定の理由（自分の言葉で短く。説明欄を写さない）

export const YOUTUBE_INFERRED_JUDGMENTS = Object.freeze([
  {
    videoId: "RJtnZdUOIL8",
    memberIds: [],
    footageMemberIds: [],
    // 2020年5月に在籍していた12人（members.js）のうち、髙松瞳を除いた11人
    thumbnailMemberIds: [
      "otani-emiri",
      "oba-hana",
      "otoshima-risa",
      "saito-kiara",
      "saito-nagisa",
      "sasaki-maika",
      "satake-nonno",
      "takiwaki-shoko",
      "noguchi-iori",
      "morohashi-sana",
      "yamamoto-anna",
    ],
    basis: "thumbnail-count-and-official-text",
    source: "inference",
    approvedBy: "owner",
    approvedOn: "2026-11-03",
    note: "チャンネル始動の回。サムネイルに写っているのは11人。2020年5月の在籍は12人だが、髙松瞳は 2020-09-20 の回の公式の説明で「YouTube 初登場」とあり、同じ時期の公式の出演者の欄も髙松瞳を除く11人なので、その11人と推定（一人ずつの特定はまだ）",
  },
]);

export const INFERRED_BASIS_LABELS = Object.freeze({
  "thumbnail-count-and-official-text": "サムネイルの人数と公式の説明からの推定",
});

// 分類の関数に渡す形に変える（本人の確認と同じ形。推定の印は buildYoutubePublishedData が付ける）
export function inferredToClassifierManual(judgment) {
  if (!judgment) return null;
  const note = `推定（${INFERRED_BASIS_LABELS[judgment.basis] ?? judgment.basis}）：${judgment.note ?? ""}`;
  return { memberIds: judgment.memberIds ?? [], footageMemberIds: judgment.footageMemberIds ?? [], thumbnailMemberIds: judgment.thumbnailMemberIds ?? [], groupOnly: true, note };
}
