// firebase/database.rules.json の presence.$uid.write ルール（2026-09-09修正版）の
// 意図をそのまま再現した、Firebase接続を伴わないJSシミュレーター。
// js/onlineBattleCapacitySecurityRules.js等、このプロジェクトの他のRulesシミュレーターと
// 同じ考え方：本番のRules文言と論理的に一致しているかを自動テストで確認するための、
// あくまで「意図の再現」であり、実際にデプロイされたFirebase Rulesそのものではない
// （実際の文言との一致はtests/presenceStage1Regression.test.jsが別途確認する）。
//
// 【ルールの意図】
// ・presenceへの新規作成・更新（newDataが存在する書き込み）は、本人のuidであり、
//   かつpublicProfiles/{uid}が存在する場合だけ許可する（公開プロフィールをONにした
//   人だけがオンライン状態を書き込める、というStage1の目的）。
// ・presenceの削除（newDataが存在しない書き込み）は、publicProfilesの有無に関係なく、
//   本人のuidであれば常に許可する（2026-09-09追記：削除までpublicProfiles存在必須にすると、
//   先にpublicProfilesが消えた場合にpresenceを二度と削除できなくなる「詰み」状態が
//   実機で再現したため、削除だけは例外的に無条件許可する設計へ修正した）。
export function canWritePresence({ authUid, targetUid, newDataExists, publicProfileExists }) {
  if (!authUid) return false;
  if (authUid !== targetUid) return false;
  if (!newDataExists) return true;
  return publicProfileExists === true;
}
