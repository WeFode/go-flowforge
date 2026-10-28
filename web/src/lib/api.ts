import type { Event, Run, Workflow } from "@/types";

/** 控制台唯一的 API 入口：集中处理鉴权头、错误信息与幂等键。 */
export class ApiClient {
  constructor(private readonly token: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`/api/v1${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
        ...init?.headers,
      },
    });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error((value as { error?: string }).error || "请求失败");
    }
    return value as T;
  }

  system() {
    return this.request<{ workers: number }>("/system");
  }

  workflows() {
    return this.request<Workflow[]>("/workflows");
  }

  saveWorkflow(workflow: Workflow) {
    const body = JSON.stringify(workflow, null, 2);
    return workflow.version
      ? this.request<Workflow>(`/workflows/${workflow.id}`, {
          method: "PUT",
          body,
        })
      : this.request<Workflow>("/workflows", { method: "POST", body });
  }

  deleteWorkflow(id: string) {
    return this.request<null>(`/workflows/${id}`, { method: "DELETE" });
  }

  runs(page: number, status: string) {
    return this.request<Run[]>(
      `/runs?limit=30&offset=${page * 30}&status=${status}`,
    );
  }

  stats() {
    return this.request<Record<string, number>>("/stats");
  }

  run(id: string) {
    return this.request<Run>(`/runs/${id}`);
  }

  events(id: string) {
    return this.request<Event[]>(`/runs/${id}/events`);
  }

  start(workflowID: string, body: unknown) {
    return this.request<Run>(`/workflows/${workflowID}/runs`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(body, null, 2),
    });
  }

  cancel(id: string) {
    return this.request<Run>(`/runs/${id}/cancel`, { method: "POST" });
  }

  replay(id: string) {
    return this.request<Run>(`/runs/${id}/replay`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });
  }
}
