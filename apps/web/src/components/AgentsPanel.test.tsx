// @vitest-environment jsdom

import type { AgentPanelModel } from "@t3tools/client-runtime/state/subagentRuntime";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("~/state/orchestration", () => ({ orchestrationEnvironment: {} }));

import { AgentsPanel } from "./AgentsPanel";

const EMPTY_MODEL: AgentPanelModel = {
  workflows: [],
  directAgents: [],
  runningCount: 0,
  waitingCount: 0,
  idleCount: 0,
  settledCount: 0,
  totalTokens: 0,
  hasAgents: false,
  liveCount: 0,
};

const ROSTER_MODEL: AgentPanelModel = { ...EMPTY_MODEL, hasAgents: true };

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function showPanel(threadKey: string | null, model = ROSTER_MODEL) {
  await act(async () =>
    root.render(<AgentsPanel key={threadKey} threadKey={threadKey} model={model} />),
  );
}

async function hidePanel() {
  await act(async () => root.render(<div>Files</div>));
}

function viewport() {
  const element = container.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
  if (!element) throw new Error("Agents roster viewport was not rendered");
  return element;
}

function scrollTo(scrollTop: number) {
  const element = viewport();
  element.scrollTop = scrollTop;
  element.dispatchEvent(new Event("scroll"));
}

describe("AgentsPanel scroll position", () => {
  it("restores each thread's position when its panel remounts", async () => {
    await showPanel("env:thread-a");
    scrollTo(420);

    await showPanel("env:thread-b");
    expect(viewport().scrollTop).toBe(0);

    await hidePanel();
    await showPanel("env:thread-a");
    expect(viewport().scrollTop).toBe(420);
  });

  it("restores once the roster appears", async () => {
    await showPanel("env:late-roster");
    scrollTo(510);
    await hidePanel();

    await showPanel("env:late-roster", EMPTY_MODEL);
    expect(container.querySelector('[data-slot="scroll-area-viewport"]')).toBeNull();

    await showPanel("env:late-roster");
    expect(viewport().scrollTop).toBe(510);
  });

  it("keeps a deeper position that a shorter layout clamped", async () => {
    await showPanel("env:clamped");
    scrollTo(510);
    await hidePanel();

    await showPanel("env:clamped");
    const shorter = viewport();
    Object.defineProperty(shorter, "scrollHeight", { value: 700 });
    Object.defineProperty(shorter, "clientHeight", { value: 300 });
    scrollTo(399.5);
    await hidePanel();

    await showPanel("env:clamped");
    expect(viewport().scrollTop).toBe(510);
  });

  it("forgets the least recently visited thread after 100 others", async () => {
    await showPanel("env:evicted");
    scrollTo(300);

    for (let index = 0; index < 100; index++) {
      await showPanel(`env:visited-${index}`);
      scrollTo(10);
    }

    await showPanel("env:evicted");
    expect(viewport().scrollTop).toBe(0);
  });
});
