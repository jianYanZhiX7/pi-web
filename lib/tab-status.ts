/**
 * 标签页的运行指示与标题文字。标题只有文字，颜色只体现在 favicon 上：运行中是盲文转圈，
 * 结束后是字形加彩色圆点。名字部分是目录名加上它所在的分支。纯函数，
 * `hooks/useTabRunIndicator.ts` 负责写入。
 */
export type TabRunPhase = "idle" | "running" | "done" | "failed";
export type TabRunStatus = "done" | "failed";

export const TAB_SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
/** 一帧的时长：肉眼连续，又不至于每秒重写十几次标题。 */
export const TAB_SPINNER_INTERVAL_MS = 120;
export const TAB_RUN_GLYPHS: Record<TabRunStatus, string> = { done: "●", failed: "✕" };
/** 与侧栏的状态点一致：已完成为绿，失败为红。 */
export const TAB_RUN_COLORS: Record<TabRunStatus, string> = { done: "#16a34a", failed: "#dc2626" };

export function tabRunStatus(phase: TabRunPhase): TabRunStatus | null {
  return phase === "done" || phase === "failed" ? phase : null;
}

export function tabRunPrefix(phase: TabRunPhase, frame = 0): string {
  if (phase === "running") {
    const index = ((Math.trunc(frame) % TAB_SPINNER_FRAMES.length) + TAB_SPINNER_FRAMES.length) % TAB_SPINNER_FRAMES.length;
    return TAB_SPINNER_FRAMES[index];
  }
  const status = tabRunStatus(phase);
  return status ? TAB_RUN_GLYPHS[status] : "";
}

export function formatTabTitle(baseTitle: string, phase: TabRunPhase, frame = 0): string {
  const base = baseTitle.trim() === "" ? "Pi Web" : baseTitle;
  const prefix = tabRunPrefix(phase, frame);
  return prefix ? `${prefix} ${base}` : base;
}

/**
 * 标题的名字部分：页面所示检出的目录名，其后是它所在的分支。运行标记加在它前面。
 */
export function formatTabBaseTitle(projectName: string | null | undefined, branch: string | null | undefined): string {
  const name = projectName?.trim() || "Pi Web";
  const ref = branch?.trim() ?? "";
  return ref ? `${name} · ${ref}` : name;
}

export interface CwdBranchSources {
  /** 打开的对话：它的分支随会话列表一起由服务端解析。 */
  selected: { cwd: string; branch?: string | null } | null;
  /** 全部会话：文件工作区停在没有对话打开的目录时用。 */
  sessions: readonly { cwd: string; branch?: string | null }[];
  /** 侧栏对它自己 cwd 的报告：检出列表只出现在检出顶层。 */
  context: {
    cwd: string;
    currentWorktreePath: string | null;
    worktrees: readonly { path: string; branch: string | null }[] | null;
  } | null;
}

/**
 * 跟在目录名后的分支：先取打开对话的，再取该 cwd 任一会话的，最后取新目录的
 * 检出列表（顶层才有，子目录给不出）。非 git 目录、detached HEAD 为 null。
 */
export function cwdBranch(cwd: string | null, sources: CwdBranchSources): string | null {
  if (!cwd) return null;
  const branchIn = (session: { cwd: string; branch?: string | null } | null | undefined) =>
    session && session.cwd === cwd && session.branch ? session.branch : null;
  const fromSelected = branchIn(sources.selected);
  if (fromSelected) return fromSelected;
  for (const session of sources.sessions) {
    const branch = branchIn(session);
    if (branch) return branch;
  }
  const context = sources.context;
  if (context?.cwd === cwd && context.currentWorktreePath) {
    return context.worktrees?.find((worktree) => worktree.path === context.currentWorktreePath)?.branch ?? null;
  }
  return null;
}

export interface TabRunEnd {
  aborted?: boolean;
  subagentsActive?: boolean;
  failed?: boolean;
}

/**
 * 一次运行结束后的阶段：中止不算结果；子代理还在工作说明任务没结束，继续转圈。
 */
export function tabRunPhaseAfterEnd(end: TabRunEnd): TabRunPhase {
  if (end.aborted) return "idle";
  if (end.subagentsActive) return "running";
  return end.failed ? "failed" : "done";
}
