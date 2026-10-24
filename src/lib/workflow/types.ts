export type TaskStatus = "open" | "in-progress" | "blocked" | "done";

export interface TaskStep {
  id: string;
  label: string;
  done: boolean;
  doneAt?: number;
  doneBy?: string;
}

export interface Note {
  id: string;
  /** Simulated time the note was recorded. */
  at: number;
  by: string;
  text: string;
}

export interface HistoryEntry {
  at: number;
  by: string;
  action: string;
}

export interface MaintenanceTask {
  id: string;
  incidentId: string;
  templateId: string;
  title: string;
  description: string;
  /** 1 = do first. */
  priority: number;
  status: TaskStatus;
  assigneeId?: string;
  assetIds: string[];
  steps: TaskStep[];
  notes: Note[];
  history: HistoryEntry[];
  createdAt: number;
  completedAt?: number;
  workOrderId?: string;
}

export interface WorkOrder {
  id: string;
  taskId?: string;
  incidentId: string;
  assetId: string;
  title: string;
  description: string;
  priority: "P1" | "P2" | "P3";
  assigneeId?: string;
  requestedActions: string[];
  createdAt: number;
  createdBy: string;
  status: "draft" | "issued";
  /** Facts captured from the simulation when the work order was raised. */
  context: string[];
}

export interface IncidentMeta {
  incidentId: string;
  ownerId?: string;
  acknowledgedAt?: number;
  acknowledgedBy?: string;
  notes: Note[];
}

export interface HandoverReport {
  id: string;
  createdAt: number;
  createdBy: string;
  markdown: string;
}

export interface ActivityEntry {
  id: string;
  at: number;
  by: string;
  text: string;
  incidentId?: string;
  taskId?: string;
}
