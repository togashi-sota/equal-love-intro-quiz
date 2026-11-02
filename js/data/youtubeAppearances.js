// 「YouTube 出演図鑑」の設定（2026-11-02新設。2026-11-03 作り直し）。
//
// 【2026-11-03 変更：YouTube API の規約（30日ルール）に合わせて、動画の情報をこのファイルから外した】
// - 動画の情報（タイトル・公開日・公開状態・説明の冒頭・再生リストの名前）と、それを機械で読み取って作った出演の判定は、
//   公開のたびに scripts/youtube/refresh.mjs が作る data/youtube-appearances.json にだけ入る（git に入れない。取得から30日で期限切れ）
// - 本人が動画で確かめた判定は js/data/youtubeVerifiedJudgments.js（git に入る）
// - アプリは js/youtubeAppearanceData.js で data/youtube-appearances.json を読む
// このファイルに残すのは、対象のチャンネル（このアプリが決めた設定）だけ。

export const YOUTUBE_CHANNEL = Object.freeze({
  id: "UCWHh6SdvJWrPuf1oJrHbX3A",
  handle: "@ikonoijoy",
  title: "イコラブ ノイミー ニアジョイ チャンネル",
  url: "https://www.youtube.com/@ikonoijoy",
});

// 規約・プライバシーの表示で使うリンク（YouTube API Services の規約 III.A）
export const YOUTUBE_TERMS_URL = "https://www.youtube.com/t/terms";
export const GOOGLE_PRIVACY_POLICY_URL = "https://policies.google.com/privacy";
