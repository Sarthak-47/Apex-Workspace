// Agent Manager runner — launches agent tasks that stream a model response in
// the background, tracked as "runs" so multiple can run concurrently and be
// reviewed later. v1 is reasoning-only (no autonomous tool execution — that
// needs an explicit approval design since agent tools can edit files / run
// shell commands).
import { streamChat } from "./ollama";
import { getAgentById } from "./agents";
import { useAppStore } from "@/store";

export type RunStatus = "running" | "done" | "error" | "cancelled";

export interface AgentRun {
  id: string;
  agentId: string;
  agentName: string;
  agentColor: string;
  agentIcon: string;
  prompt: string;
  model: string;
  status: RunStatus;
  output: string;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

const controllers = new Map<string, AbortController>();

function newId(): string {
  try { return crypto.randomUUID(); } catch { return `run_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
}

/** Launch an agent task in the background. Returns the run id.
 *  `modelOverride` pins the model for this one run (per-task selection). */
export function launchAgentRun(agentId: string, prompt: string, modelOverride?: string): string {
  const store = useAppStore.getState();
  const agent = getAgentById(agentId, store.userAgents);
  const model = (modelOverride && modelOverride.trim()) || agent.model || store.ollamaSelectedModel || "qwen2.5-coder:7b";
  const id = newId();

  store.addAgentRun({
    id, agentId, agentName: agent.name, agentColor: agent.color, agentIcon: agent.icon,
    prompt, model, status: "running", output: "", startedAt: Date.now(),
  });

  const ctrl = new AbortController();
  controllers.set(id, ctrl);

  // Abort a run that makes no progress (model unreachable / not loaded) so it
  // doesn't stay "running" forever. Reset on each streamed token.
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const NO_PROGRESS_MS = 45_000;
  const resetTimer = () => { clearTimeout(timer); timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, NO_PROGRESS_MS); };

  (async () => {
    resetTimer();
    try {
      const messages = [
        { role: "system" as const, content: agent.systemPrompt },
        { role: "user" as const, content: prompt },
      ];
      for await (const chunk of streamChat(model, messages, ctrl.signal)) {
        resetTimer();
        useAppStore.getState().appendAgentRunOutput(id, chunk);
      }
      useAppStore.getState().finishAgentRun(id, "done");
      useAppStore.getState().addToast(`Agent "${agent.name}" finished`, "success");
    } catch (e) {
      if (timedOut) { useAppStore.getState().finishAgentRun(id, "error", "Timed out waiting for the model — is Ollama running and the model loaded?"); useAppStore.getState().addToast(`Agent "${agent.name}" timed out`, "error"); }
      else if (ctrl.signal.aborted) useAppStore.getState().finishAgentRun(id, "cancelled");
      else { useAppStore.getState().finishAgentRun(id, "error", e instanceof Error ? e.message : String(e)); useAppStore.getState().addToast(`Agent "${agent.name}" failed`, "error"); }
    } finally {
      clearTimeout(timer);
      controllers.delete(id);
    }
  })();

  return id;
}

export function cancelAgentRun(id: string): void {
  controllers.get(id)?.abort();
}
