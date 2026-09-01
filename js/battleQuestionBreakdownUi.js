// js/battleQuestionBreakdown.jsが組み立てた共通形式のデータを、実際の画面へ描画する。
// 対戦結果画面・オンラインプレイ履歴の詳細ビューの両方から、この1つの関数を呼ぶことで、
// 表示ロジックが2箇所でズレることを防ぐ（本人指示：19-25章「結果画面と履歴は共通部品化」）。
//
// 問題数が多くても一覧性を保てるよう、ネイティブの<details>/<summary>要素で
// 1問=1アコーディオンにする（既定では折りたたみ、JS側で開閉状態を管理する必要が無く、
// キーボード操作・スクリーンリーダーにも標準で対応できる）。

// containerを空にした上で、breakdown（[{questionNumber, correctSongTitle?, teamAnswerTitle?, rows}]）を描画する。
// breakdownが空、またはnullの場合は「問題別結果」自体を表示しない（containerを空にするだけ）。
export function renderQuestionBreakdownAccordion(container, breakdown) {
  if (!container) return;
  container.innerHTML = "";
  if (!Array.isArray(breakdown) || breakdown.length === 0) return;

  breakdown.forEach((question) => {
    const item = document.createElement("details");
    item.className = "battle-question-breakdown-item";

    const summary = document.createElement("summary");
    const summaryParts = [`第${question.questionNumber}問`];
    if (question.correctSongTitle) {
      summaryParts.push(`正解：${question.correctSongTitle}`);
    }
    summary.textContent = summaryParts.join(" ");
    item.appendChild(summary);

    const body = document.createElement("div");
    body.className = "battle-question-breakdown-body";

    if (question.teamAnswerTitle) {
      const teamLine = document.createElement("p");
      teamLine.className = "battle-question-breakdown-team-answer";
      teamLine.textContent = `チームの最終回答：${question.teamAnswerTitle}`;
      body.appendChild(teamLine);
    }

    const list = document.createElement("ul");
    list.className = "battle-question-breakdown-rows";
    (question.rows ?? []).forEach((row) => {
      const li = document.createElement("li");
      li.className = "battle-question-breakdown-row";
      if (row.isCorrect === true) li.classList.add("is-correct");
      if (row.isCorrect === false) li.classList.add("is-wrong");

      const nameSpan = document.createElement("span");
      nameSpan.className = "battle-question-breakdown-row-name";
      nameSpan.textContent = `${row.name}${row.isYou ? "（あなた）" : ""}${row.isWinner ? " 🏆" : ""}`;
      li.appendChild(nameSpan);

      const answerSpan = document.createElement("span");
      answerSpan.className = "battle-question-breakdown-row-answer";
      const answerParts = [];
      // 一瞬バトル等、正解曲が問題単位ではなく行単位でしか分からないモードのための表示
      // （音源再生失敗時の予備曲差し替えで、参加者ごとに出題曲が違うことがあるため）。
      if (!question.correctSongTitle && row.correctSongTitle) {
        answerParts.push(`正解：${row.correctSongTitle}`);
      }
      answerParts.push(row.selectedTitle ? `回答：${row.selectedTitle}` : "未回答");
      if (row.hintLevel) answerParts.push(`ヒント${row.hintLevel}段階目`);
      if (row.missCount) answerParts.push(`ミス${row.missCount}回`);
      answerSpan.textContent = answerParts.join(" / ");
      li.appendChild(answerSpan);

      list.appendChild(li);
    });
    body.appendChild(list);

    item.appendChild(body);
    container.appendChild(item);
  });
}
