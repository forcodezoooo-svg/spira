// AI 응답 내 구조화 데이터 마커 (Single Source of Truth)
export const PLAN_MARKER = '%%%PLAN_UPDATE%%%';
export const ROUTINE_MARKER = '%%%ROUTINE_ADD%%%';
export const GOALS_MARKER = '%%%GOALS_UPDATE%%%';
export const QUARTER_PLAN_MARKER = '%%%QUARTER_PLAN%%%';
export const AREA_ASSIGN_MARKER = '%%%AREA_ASSIGN%%%';
export const PROJECT_ASSIGN_MARKER = '%%%PROJECT_ASSIGN%%%';
export const ITEM_REVISE_MARKER = '%%%ITEM_REVISE%%%'; // 특정 항목 하나를 대화로 다듬어 반영
export const FIN_REPLAN_MARKER = '%%%FIN_REPLAN%%%'; // 재무 재조정안(배분·Reserve)을 재무계획에 반영
