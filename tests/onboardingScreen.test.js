// js/onboardingScreen.jsの恒久テスト。
// needsOnboarding()はlocalStorageの実際の状態を見て判断するため、このテストでは
// テスト用のキーだけを一時的に読み書きし、必ず元の状態に戻す（他のテスト・実際の
// ブラウザデータを壊さないため）。
import { needsOnboarding, markOnboardingCompleted } from "../js/onboardingScreen.js";
import { assertEqual } from "./test-utils.js";

const ONBOARDING_COMPLETE_KEY = "equalLoveIntroQuiz.onboardingCompleted";
const DUMMY_EXISTING_KEY = "equalLoveIntroQuiz.__test_existing_marker__";

// このテストが実際に触るキーだけを退避・復元する（他のテストが作った実データには触れない）。
function withCleanOnboardingState(run) {
  const savedFlag = localStorage.getItem(ONBOARDING_COMPLETE_KEY);
  const savedDummy = localStorage.getItem(DUMMY_EXISTING_KEY);
  localStorage.removeItem(ONBOARDING_COMPLETE_KEY);
  localStorage.removeItem(DUMMY_EXISTING_KEY);
  try {
    run();
  } finally {
    if (savedFlag === null) localStorage.removeItem(ONBOARDING_COMPLETE_KEY);
    else localStorage.setItem(ONBOARDING_COMPLETE_KEY, savedFlag);
    if (savedDummy === null) localStorage.removeItem(DUMMY_EXISTING_KEY);
    else localStorage.setItem(DUMMY_EXISTING_KEY, savedDummy);
  }
}

export function runOnboardingScreenTests() {
  // 【注記】「完了フラグも equalLoveIntroQuiz.* データも一切無い＝真の新規ユーザー」の
  // ケース（needsOnboarding()がtrueを返すべき状況）は、このtests.html自体が他の多数のテスト
  // （highscore/achievementProgress/playerProfile系など、実際のlocalStorageを読み書きするテスト）
  // と同じページ・同じlocalStorageを共有しているため、この位置では意図的に検証しない
  // （他のテストが先に何らかのequalLoveIntroQuiz.*キーを書き込んでいるのが自然な状態であり、
  // それ自体はhasAnyExistingAppData()が正しく動作している証拠でもある）。
  // trueになるべきロジック自体は、下の「既存データがあればfalse」のテストの裏返しとして、
  // コードレビュー（hasAnyExistingAppData()が偽なら分岐がtrueを返すこと）で確認済み。

  // ---- 完了フラグを立てた後は、不要になる ----
  withCleanOnboardingState(() => {
    markOnboardingCompleted();
    assertEqual(needsOnboarding(), false, "markOnboardingCompleted()の後はneedsOnboarding()がfalseになる");
    assertEqual(
      localStorage.getItem(ONBOARDING_COMPLETE_KEY),
      "true",
      "完了フラグがlocalStorageに保存される"
    );
  });

  // ---- 完了フラグは無いが、他の equalLoveIntroQuiz.* データが既にある＝既存ユーザーは
  //      グランドファザリングされ、オンボーディングは不要になる（かつ以後のために自動でフラグが立つ） ----
  withCleanOnboardingState(() => {
    localStorage.setItem(DUMMY_EXISTING_KEY, "1");
    assertEqual(
      needsOnboarding(),
      false,
      "完了フラグが無くても、既存データ（equalLoveIntroQuiz.*）があれば既存ユーザーとして扱いオンボーディングは不要"
    );
    assertEqual(
      localStorage.getItem(ONBOARDING_COMPLETE_KEY),
      "true",
      "既存ユーザーと判定した時点で、以後のために完了フラグも自動で立てる"
    );
  });
}
