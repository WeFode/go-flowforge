import { makeStep, makeWorkflow, typeNames, type Workflow } from "@/types";

export const pretty = (value: unknown) => JSON.stringify(value, null, 2);
export const clone = <T>(value: T): T => structuredClone(value);

/** 校验导入或 JSON 编辑的内容，补齐缺省字段后再交给设计器。 */
export function parseDraft(raw: unknown): Workflow {
  if (!raw || typeof raw !== "object") throw new Error("流程必须是 JSON 对象");
  const draft = raw as Workflow;
  if (
    !draft.id ||
    !draft.name ||
    !Array.isArray(draft.steps) ||
    !draft.steps.length
  )
    throw new Error("流程需要 id、name 和非空 steps");
  const steps = draft.steps.map((step) => {
    if (
      !step ||
      typeof step.id !== "string" ||
      !step.id ||
      !typeNames[step.type]
    )
      throw new Error("每个步骤需要有效的 id 和 type");
    if (
      step.depends_on &&
      (!Array.isArray(step.depends_on) ||
        step.depends_on.some((value) => typeof value !== "string"))
    )
      throw new Error("depends_on 必须是步骤 ID 数组");
    if (
      step.config &&
      (typeof step.config !== "object" || Array.isArray(step.config))
    )
      throw new Error("config 必须是 JSON 对象");
    const defaults = makeStep(step.type, step.id);
    return {
      ...defaults,
      ...step,
      retry: { ...defaults.retry, ...step.retry },
      depends_on: step.depends_on || [],
      config: step.config || defaults.config,
    };
  });
  return { ...makeWorkflow(), ...draft, steps };
}

export function downloadJSON(name: string, value: string) {
  const url = URL.createObjectURL(
    new Blob([value], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
