'use client';
import { useEffect } from 'react';
import { useStore } from '../lib/useStore';
import { useChatContext } from '../lib/ChatContext';

export default function AppContextBridge() {
  const store = useStore();
  const chat = useChatContext();

  useEffect(() => {
    if (!chat || !store.ready) return;

    const entries = store.allWorkspacesEntries;
    const today = new Date().toISOString().split('T')[0];
    const lines: string[] = [];

    for (const entry of entries) {
      const wsId = entry.workspace.id;
      const wsName = entry.workspace.name;
      lines.push(`\n## 워크스페이스: ${wsName} (wsId: ${wsId})`);

      // 기획서 요약 — "기획안 기반 할 일 생성"에 활용
      const plan = entry.plan;
      if (plan) {
        const pl: string[] = [];
        if (plan.mission) pl.push(`미션: ${plan.mission}`);
        if (plan.vision) pl.push(`비전: ${plan.vision}`);
        if (plan.concept) pl.push(`컨셉: ${plan.concept}`);
        if (plan.problems?.length) pl.push(`문제: ${plan.problems.join(' / ')}`);
        if (plan.solutions?.length) pl.push(`솔루션: ${plan.solutions.map(s => s.title).filter(Boolean).join(' / ')}`);
        if (plan.revenueModel?.length) pl.push(`수익모델: ${plan.revenueModel.map(s => s.title).filter(Boolean).join(' / ')}`);
        if (pl.length) { lines.push(`### 기획서`); pl.forEach(l => lines.push(`- ${l}`)); }
      }

      // 업무 영역 목록(id 포함) — 생성한 프로그램을 이 영역들에 workAreaId로 배정
      if (plan?.workAreas?.length) {
        lines.push(`### 업무 영역`);
        for (const a of plan.workAreas) lines.push(`- id:${a.id} | ${a.name}${a.goal ? ` | 목표:${a.goal}` : ''}`);
      }

      if (entry.programs.length > 0) {
        lines.push(`### 프로그램`);
        for (const p of entry.programs) {
          const started = !p.startDate || p.startDate <= today;
          lines.push(`- id:${p.id} | ${p.name} | color:${p.color ?? ''} | weight:${p.weight ?? 1}${p.startDate ? ` | startDate:${p.startDate}` : ''}${started ? '' : ' (미시작)'}`);
        }
      }

      if (entry.routineSystems.length > 0) {
        lines.push(`### 루틴 시스템`);
        for (const rs of entry.routineSystems) {
          const prog = entry.programs.find(p => p.id === rs.programId);
          const progLabel = prog ? ` | program:${prog.name}(programId:${rs.programId})` : '';
          lines.push(`- id:${rs.id} | ${rs.name}${progLabel}${rs.startDate ? ` | startDate:${rs.startDate}` : ''}`);
          for (const t of rs.tasks) {
            const dline = t.deadline ? ` | deadline:${t.deadline}` : '';
            lines.push(`  - taskId:${t.id} | ${t.name}${dline}`);
          }
        }
      }
    }

    chat.setAppContext(lines.join('\n'));
  });

  return null;
}
