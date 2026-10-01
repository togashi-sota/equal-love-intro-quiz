// 【2026-10-01新設】「＝LOVEについて」の ANIME SONG（アニメ主題歌）欄の回帰テスト。
//   ・2曲が年代順で出る／OP・EDの表記／作詞作曲編曲／声優出演メンバーと役名
//   ・リンクは https・別タブ・安全属性（rel）、死んだ公式サイトを載せていない
//   ・データが無いときは何も出さない／375px幅ではみ出さない
import { GROUP_INFO } from "../js/data/groupInfo.js";
import { MEMBERS } from "../js/data/members.js";
import { buildAnimeSongSection } from "../js/discographyScreen.js";
import { assertEqual } from "./test-utils.js";

export function runAnimeSongTests() {
  const songs = GROUP_INFO.animeSongs;
  assertEqual(songs.map((song) => song.title), ["アイカツハッピーエンド", "恋人以上、好き未満"], "A: 2曲が年代順で登録されている");
  assertEqual(songs.map((song) => song.themeType), ["ED", "OP"], "A: アイカツ＝ED／恋人以上＝OP");
  assertEqual(songs.every((song) => song.voiceCast.every((entry) => MEMBERS.some((member) => member.id === entry.memberId))), true, "A: 声優出演のmemberIdが実在する");
  assertEqual(new Set(songs.map((song) => song.id)).size, songs.length, "A: IDが重複しない");
  assertEqual(songs.every((song) => /^\d{4}-\d{2}-\d{2}$/.test(song.lastVerifiedDate)), true, "A: 確認日がYYYY-MM-DD");
  assertEqual(songs.some((song) => JSON.stringify(song).includes("hashiyoka.com")), false, "A: 開けない旧公式サイト(hashiyoka.com)を載せていない");

  assertEqual(buildAnimeSongSection([]).childNodes.length, 0, "B: データが無ければ何も出さない");
  assertEqual(buildAnimeSongSection(undefined).childNodes.length, 0, "B: undefinedでも落ちない");

  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-9999px;top:0;width:375px;box-sizing:border-box;";
  host.appendChild(buildAnimeSongSection(songs));
  document.body.appendChild(host);
  try {
    assertEqual(host.querySelector(".section-heading").textContent.includes("ANIME SONG"), true, "C: 見出しにANIME SONG");
    assertEqual(host.querySelector(".section-heading").textContent.includes("アニメ主題歌"), true, "C: 見出しに「アニメ主題歌」");
    const cards = [...host.querySelectorAll(".anime-song-card")];
    assertEqual(cards.length, 2, "C: 2枚のカード");
    assertEqual(cards[0].querySelector(".sister-group-name").textContent, "『アイカツハッピーエンド』", "C: 1枚目の曲名");
    assertEqual(cards[0].textContent.includes("エンディングテーマ（ED）") && cards[0].textContent.includes("『走り続けてよかったって。』"), true, "C: 1枚目はED／走り続けてよかったって。");
    assertEqual(cards[0].textContent.includes("作詞・作曲・編曲：HoneyWorks"), true, "C: HoneyWorksは3役をまとめて表示");
    assertEqual(cards[0].textContent.includes("野口衣織 ／ 大森千歌子 役"), true, "C: 野口衣織＝大森千歌子");
    assertEqual(cards[1].querySelector(".sister-group-name").textContent, "『恋人以上、好き未満』", "C: 2枚目の曲名");
    assertEqual(cards[1].textContent.includes("オープニングテーマ（OP）") && cards[1].textContent.includes("『クラスの大嫌いな女子と結婚することになった。』"), true, "C: 2枚目はOP／クラ婚");
    assertEqual(cards[1].textContent.includes("作詞：指原莉乃 ／ 作曲：中村瑛彦 ／ 編曲：古川貴浩"), true, "C: 2枚目のクレジット");
    assertEqual(
      [...cards[1].querySelectorAll(".anime-song-cast li")].map((item) => item.textContent),
      ["齋藤樹愛羅 ／ 上園桃香 役", "髙松瞳 ／ 長谷川柚希 役", "野口衣織 ／ 奥山梨央 役"],
      "C: 声優出演3人と役名"
    );
    assertEqual(cards.map((card) => [...card.querySelectorAll(".official-link-button")].map((link) => link.textContent)), [["作品情報", "＝LOVE公式情報"], ["アニメ公式サイト", "＝LOVE公式情報"]], "C: ボタンは2つずつ");
    const links = [...host.querySelectorAll("a")];
    assertEqual(links.every((link) => link.href.startsWith("https://") && link.target === "_blank" && link.rel.includes("noopener") && link.rel.includes("noreferrer")), true, "C: 全リンクが https・別タブ・安全属性");
    assertEqual(links.some((link) => link.textContent === "MVを見る" && link.href.includes("SrqqHpWIN9M")), true, "C: アイカツのMVリンク");
    assertEqual(links.some((link) => link.textContent === "MVを見る" && link.href.includes("p-jc9qMpBb4")), true, "C: 恋人以上のMVリンク");
    assertEqual(host.scrollWidth <= host.clientWidth + 1, true, "C: 375px幅で横にはみ出さない");
  } finally {
    host.remove();
  }
}
