// 「YouTube 出演図鑑」の、本人が動画を見て確かめた判定（2026-11-03新設）。git に入れる「自分たちの判定」はこのファイルだけ。
//
// 【このファイルに書くもの・書かないもの（YouTube API の規約に合わせるため）】
// - 書く：本人が YouTube で動画を見て確かめた事実（誰が出ていたか・出演の形・収録するか）と、その鍵の動画 ID
// - 書かない：YouTube API から取ったデータ（タイトル・説明・公開日・公開状態・再生リストの名前など）と、それを機械で読み取って作った判定。
//   それらは公開のたびに取り直して作るファイル data/youtube-appearances.json（git に入れない。取得から30日で期限切れ）にだけ入る
//   （YouTube API Services Developer Policies III.E.4：API のデータは30日を超えて保存しない。Terms of Service §16.1：API のデータの派生物の扱い）
// - 動画 ID は鍵として必要なので書く（規約に ID の保存期間の明記は無い。ここに書くのは本人が確かめた数本だけ）
//
// 【欄】
// - videoId：動画 ID（11文字）
// - decision："include"（収録）・"exclude"（除外）・"hold"（確かめられないので保留＝出演者未確認）
// - memberIds：企画に直接出演した＝LOVE のメンバー（members.js の id）
// - footageMemberIds：ライブ映像・過去の映像・回想などで、映像に登場したメンバー（企画の出演者とは分けて表示する）
// - verifiedBy："owner"（本人）／verifiedOn：確かめた日／note：何を確かめたか（自分の言葉で短く。説明欄を写さない）
// - thumbnailMemberIds：サムネイル（表紙の画像）に写っているメンバー（R12）。本編に出ているかは別（memberIds・footageMemberIds と分けて表示する）
// - basis：何で確かめたか。"thumbnail"（サムネイルで判断）・"full-video"（本編まで見た）・"live-footage"（映像で確認）など。
//   サムネイルだけで判断したものは、本編の出演（memberIds）に入れない
// - partial：true にすると「一部確認」（書いた人は出ていると確かめたが、ほかにも出ているかは分からない）。省略＝全員を確かめた（R11）
// 足し方：1本につき1行足して、手元で `node scripts/youtube/refresh.mjs --from-raw …` を流して確かめる（scripts/youtube/SETUP.md）

const MEMBERS_AT_3RD_ANNIVERSARY = Object.freeze([
  // 2020年9月（3周年記念コンサート）の＝LOVE の12人
  "otani-emiri",
  "oba-hana",
  "otoshima-risa",
  "saito-kiara",
  "saito-nagisa",
  "sasaki-maika",
  "satake-nonno",
  "takamatsu-hitomi",
  "takiwaki-shoko",
  "noguchi-iori",
  "morohashi-sana",
  "yamamoto-anna",
]);

// 2020年5月（チャンネル開設の月）に在籍していた12人のうち、髙松瞳を除いた11人。
// 髙松瞳は、2020-09-20 の生放送の公式の説明に「YouTube 初登場」とあり、同じ時期の公式の出演者の欄（2020-05-24・08-13）も髙松瞳を除く11人
const MEMBERS_AT_CHANNEL_START_WITHOUT_TAKAMATSU = Object.freeze([
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
]);

export const YOUTUBE_VERIFIED_JUDGMENTS = Object.freeze([
  {
    videoId: "RJtnZdUOIL8",
    decision: "include",
    memberIds: [],
    footageMemberIds: [],
    thumbnailMemberIds: [...MEMBERS_AT_CHANNEL_START_WITHOUT_TAKAMATSU],
    basis: "thumbnail",
    verifiedBy: "owner",
    verifiedOn: "2026-11-03",
    note: "チャンネル始動の回。本人の確認：サムネイルに当時のメンバーが全員写っている。写っているのは11人（2020年5月の12人のうち、この時期 YouTube に出ていない髙松瞳を除く）。本編は未確認",
  },
  {
    videoId: "tzrxr9c2sRI",
    decision: "include",
    memberIds: [],
    footageMemberIds: [...MEMBERS_AT_3RD_ANNIVERSARY],
    basis: "full-video",
    verifiedBy: "owner",
    verifiedOn: "2026-11-03",
    note: "3周年記念コンサートへの潜入の前編。当時の12人全員がライブ映像で登場する（企画の出演者は ≠ME の2人とゲスト）",
  },
]);

// 分類の関数（js/youtubeAppearanceClassifier.js の classifyYoutubeVideo）に渡す形に変える
export function toClassifierManual(judgment) {
  if (!judgment) return null;
  const how = judgment.basis === "thumbnail" ? "本人がサムネイルで確認" : "本人が動画で確認";
  const note = `${how}（${judgment.verifiedOn}）：${judgment.note ?? ""}`;
  if (judgment.decision === "exclude") return { exclude: true, note };
  if (judgment.decision === "hold") return { unconfirmed: true, note };
  return { memberIds: judgment.memberIds ?? [], footageMemberIds: judgment.footageMemberIds ?? [], thumbnailMemberIds: judgment.thumbnailMemberIds ?? [], groupOnly: true, note };
}
