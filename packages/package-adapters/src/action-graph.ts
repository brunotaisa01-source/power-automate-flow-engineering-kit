import type { Diagnostic } from "@spflow/core/types/diagnostics";

import type { NormalizedAction, NormalizedFlow } from "./flow-normalizer.ts";

const SUPPORTED_STATUSES = new Set([
  "Cancelled",
  "Failed",
  "Skipped",
  "Succeeded",
  "TimedOut",
]);
const REQUIRED_ROLES = new Set([
  "audit",
  "authorization",
  "completion",
  "failure",
  "mutation",
  "readback",
  "security",
]);
const LOOP_TYPES = new Set(["apply_to_each", "foreach"]);

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function actionPath(flow: NormalizedFlow, actionId: string, suffix = ""): string {
  void flow;
  void actionId;
  return `<flow>#/actions/<action>${suffix}`;
}

function diagnostic(
  code: string,
  path: string,
  message: string,
): Diagnostic {
  return Object.freeze({ code, path, message });
}

interface GraphData {
  readonly outgoing: ReadonlyMap<string, readonly string[]>;
  readonly roots: readonly string[];
  readonly structurallyInvalid: ReadonlySet<string>;
}

function buildGraph(flow: NormalizedFlow, diagnostics: Diagnostic[]): GraphData {
  const outgoing = new Map<string, string[]>();
  const roots: string[] = [];
  const structurallyInvalid = new Set<string>();
  for (const id of flow.actions.keys()) {
    outgoing.set(id, []);
  }

  for (const action of flow.actions.values()) {
    if (action.runAfter.length === 0) {
      if (action.containerIndex === 0) {
        if (action.parentId === undefined) {
          roots.push(action.id);
        } else {
          outgoing.get(action.parentId)?.push(action.id);
        }
      }
    }
    for (const dependency of action.runAfter) {
      const predecessor = flow.actions.get(dependency.actionId);
      if (predecessor === undefined || predecessor.containerId !== action.containerId) {
        structurallyInvalid.add(action.id);
        const message = predecessor === undefined
          ? "An action references a predecessor that does not exist."
          : "An action references a predecessor outside its container.";
        diagnostics.push(diagnostic(
          "PA-GRAPH-001",
          actionPath(
            flow,
            action.id,
            "/runAfter/<predecessor>",
          ),
          message,
        ));
      } else {
        outgoing.get(predecessor.id)?.push(action.id);
      }
      for (const status of dependency.statuses) {
        if (!SUPPORTED_STATUSES.has(status)) {
          structurallyInvalid.add(action.id);
          diagnostics.push(diagnostic(
            "FLOW-STATUS-001",
            actionPath(
              flow,
              action.id,
              "/runAfter/<predecessor>",
            ),
            "An action contains an unsupported runAfter status.",
          ));
        }
      }
    }
  }
  for (const neighbors of outgoing.values()) {
    neighbors.sort(compareText);
  }
  roots.sort(compareText);
  return { outgoing, roots, structurallyInvalid };
}

function reachableNodes(
  flow: NormalizedFlow,
  graph: GraphData,
  excludedRole?: string,
): Set<string> {
  const reached = new Set<string>();
  const queue = [...graph.roots];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined || reached.has(id)) {
      continue;
    }
    const action = flow.actions.get(id);
    if (action === undefined || action.role === excludedRole) {
      continue;
    }
    reached.add(id);
    for (const neighbor of graph.outgoing.get(id) ?? []) {
      if (!reached.has(neighbor)) {
        queue.push(neighbor);
      }
    }
    queue.sort(compareText);
  }
  return reached;
}

function firstCycle(graph: GraphData): readonly string[] | undefined {
  const state = new Map<string, "active" | "complete">();
  const stack: string[] = [];
  const visit = (id: string): readonly string[] | undefined => {
    state.set(id, "active");
    stack.push(id);
    for (const neighbor of graph.outgoing.get(id) ?? []) {
      if (state.get(neighbor) === "active") {
        const start = stack.indexOf(neighbor);
        return [...stack.slice(start), neighbor];
      }
      if (state.get(neighbor) === undefined) {
        const cycle = visit(neighbor);
        if (cycle !== undefined) {
          return cycle;
        }
      }
    }
    stack.pop();
    state.set(id, "complete");
    return undefined;
  };

  for (const id of [...graph.outgoing.keys()].sort(compareText)) {
    if (state.get(id) === undefined) {
      const cycle = visit(id);
      if (cycle !== undefined) {
        return cycle;
      }
    }
  }
  return undefined;
}

function loopAncestor(
  flow: NormalizedFlow,
  action: NormalizedAction,
): NormalizedAction | undefined {
  let parentId = action.parentId;
  while (parentId !== undefined) {
    const parent = flow.actions.get(parentId);
    if (parent === undefined) {
      return undefined;
    }
    if (LOOP_TYPES.has(parent.type.toLowerCase())) {
      return parent;
    }
    parentId = parent.parentId;
  }
  return undefined;
}

export function validateActionGraph(flow: NormalizedFlow): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const graph = buildGraph(flow, diagnostics);
  const reachable = reachableNodes(flow, graph);

  for (const action of flow.actions.values()) {
    if (
      action.role !== undefined
      && REQUIRED_ROLES.has(action.role)
      && !reachable.has(action.id)
      && !graph.structurallyInvalid.has(action.id)
    ) {
      diagnostics.push(diagnostic(
        "PA-GRAPH-001",
        actionPath(flow, action.id),
        "A required operation is unreachable from the trigger.",
      ));
    }
  }

  const cycle = firstCycle(graph);
  if (cycle !== undefined) {
    const cycleStart = cycle[0];
    if (cycleStart !== undefined) {
      diagnostics.push(diagnostic(
        "PA-GRAPH-002",
        actionPath(flow, cycleStart),
        "The action graph contains a cycle.",
      ));
    }
  }

  const withoutAuthorization = reachableNodes(flow, graph, "authorization");
  const withoutReadback = reachableNodes(flow, graph, "readback");
  for (const action of flow.actions.values()) {
    if (action.role === "mutation" && withoutAuthorization.has(action.id)) {
      diagnostics.push(diagnostic(
        "PA-GRAPH-001",
        actionPath(flow, action.id),
        "A mutation action is reachable without authorization.",
      ));
    }
    if (action.role === "completion" && withoutReadback.has(action.id)) {
      diagnostics.push(diagnostic(
        "FLOW-STATUS-001",
        actionPath(flow, action.id),
        "A completion action is reachable without semantic readback.",
      ));
    }
    if (action.type.toLowerCase() === "terminate") {
      const ancestor = loopAncestor(flow, action);
      if (ancestor !== undefined) {
        diagnostics.push(diagnostic(
          "PA-SCOPE-001",
          actionPath(flow, action.id),
          "A Terminate action has a loop ancestor.",
        ));
      }
    }
  }

  return diagnostics.sort((left, right) =>
    compareText(left.code, right.code)
    || compareText(left.path, right.path)
    || compareText(left.message, right.message)
  );
}
