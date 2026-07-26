// 背景演出（キラキラの粒）を担当するファイル。
// ゲームの状態には関係ない、見た目だけの飾りをここに集約する。

// 生成するキラキラの数。多すぎると背景がうるさくなるので控えめにしている。
const SPARKLE_COUNT = 18;

// キラキラの色は、配色トークンの3色（ピンク・ブルー・イエロー）を順番に使い回す。
const SPARKLE_COLORS = ["var(--color-primary)", "var(--color-secondary)", "var(--color-accent)"];

// 音符・星・ハートを織り交ぜて、単調にならないようにする。
const NOTE_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 18V6.4a1 1 0 0 1 .79-.98l8-1.8A1 1 0 0 1 19 4.6V15a3 3 0 1 1-2-2.83V7.1l-6 1.35v9.55a3 3 0 1 1-2-2.83Z"/></svg>';
const STAR_ICON =
  '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0 9.4 6.6 16 8 9.4 9.4 8 16 6.6 9.4 0 8 6.6 6.6Z"/></svg>';
const HEART_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-6.7-4.35-9.3-8.1C1 10.1 1.6 6.6 4.6 5.1c2.2-1.1 4.6-.3 5.9 1.6l1.5 2.1 1.5-2.1c1.3-1.9 3.7-2.7 5.9-1.6 3 1.5 3.6 5 1.9 7.8C18.7 16.65 12 21 12 21Z"/></svg>';
const SPARKLE_ICONS = [NOTE_ICON, STAR_ICON, HEART_ICON];

// #sparkle-field の中に、ランダムな位置・大きさ・タイミングでキラキラの粒を敷き詰める。
// ページを開くたびに配置が少し変わるので、毎回微妙に違う表情になる。
export function renderBackgroundSparkles() {
  const field = document.getElementById("sparkle-field");
  if (!field) return;

  for (let i = 0; i < SPARKLE_COUNT; i++) {
    const spark = document.createElement("span");
    spark.className = "spark";
    spark.style.setProperty("--x", `${Math.random() * 100}%`);
    spark.style.setProperty("--y", `${Math.random() * 100}%`);
    spark.style.setProperty("--s", `${6 + Math.random() * 9}px`);
    spark.style.setProperty("--d", `${(Math.random() * 3.2).toFixed(2)}s`);
    spark.style.setProperty("--spark-color", SPARKLE_COLORS[i % SPARKLE_COLORS.length]);
    spark.innerHTML = SPARKLE_ICONS[i % SPARKLE_ICONS.length];
    field.appendChild(spark);
  }
}
