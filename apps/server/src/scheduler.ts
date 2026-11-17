import cron, { type ScheduledTask } from "node-cron";
import type { Rules } from "@sweep/shared";

const EXPRESSIONS: Record<Rules["schedule"], string | null> = {
  daily: "0 6 * * *",
  weekly: "0 6 * * 0",
  manual: null,
};

/** Computes the next run time for the UI ("Next run tomorrow, 6:00 AM"). */
export function nextRunAt(schedule: Rules["schedule"], from = new Date()): Date | null {
  if (schedule === "manual") return null;
  const next = new Date(from);
  next.setHours(6, 0, 0, 0);
  if (next <= from) next.setDate(next.getDate() + 1);
  if (schedule === "weekly") {
    while (next.getDay() !== 0) next.setDate(next.getDate() + 1);
  }
  return next;
}

/** Owns the cron job; reschedule whenever the user changes the schedule in Rules. */
export class Scheduler {
  private task: ScheduledTask | null = null;
  private running = false;

  constructor(private job: () => Promise<unknown>) {}

  apply(schedule: Rules["schedule"]) {
    this.task?.stop();
    this.task = null;
    const expression = EXPRESSIONS[schedule];
    if (!expression) return;
    this.task = cron.schedule(expression, () => void this.runNow());
  }

  async runNow() {
    if (this.running) return { skipped: true as const };
    this.running = true;
    try {
      return await this.job();
    } finally {
      this.running = false;
    }
  }

  stop() {
    this.task?.stop();
  }
}
