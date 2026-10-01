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

// jsdom has no layout or animations. Model a 300px viewport that clamps scrollTop to the roster,
// reports whole pixels like a scaled display, and reads 0 once detached.
const VIEWPORT_HEIGHT = 300;
let rosterHeight = 1000;
const scrollTops = new WeakMap<Element, number>();
Object.defineProperties(Element.prototype, {
  getAnimations: { configurable: true, value: () => [] },
  clientHeight: { configurable: true, get: () => VIEWPORT_HEIGHT },
  scrollHeight: { configurable: true, get: () => rosterHeight },
  scrollTop: {
    configurable: true,
    get(this: Element) {
      return this.isConnected ? (scrollTops.get(this) ?? 0) : 0;
    },
    set(this: Element, value: number) {
      const maxScrollTop = Math.max(0, rosterHeight - VIEWPORT_HEIGHT);
      scrollTops.set(this, Math.floor(Math.min(Math.max(0, value), maxScrollTop)));
    },
  },
});

const resizeCallbacks = new Set<() => void>();
class FakeResizeObserver {
  constructor(private readonly callback: () => void) {}
  observe() {
    resizeCallbacks.add(this.callback);
  }
  unobserve() {}
  disconnect() {
    resizeCallbacks.delete(this.callback);
  }
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  rosterHeight = 1000;
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

async function resizeRoster(height: number) {
  rosterHeight = height;
  await act(async () => resizeCallbacks.forEach((callback) => callback()));
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

    rosterHeight = 699.5;
    await showPanel("env:clamped");
    expect(viewport().scrollTop).toBe(399);
    viewport().dispatchEvent(new Event("scroll"));
    await hidePanel();

    rosterHeight = 1000;
    await showPanel("env:clamped");
    expect(viewport().scrollTop).toBe(510);
  });

  it("keeps the position when the roster empties without unmounting", async () => {
    await showPanel("env:emptied");
    scrollTo(420);

    await showPanel("env:emptied", EMPTY_MODEL);
    await showPanel("env:emptied");
    expect(viewport().scrollTop).toBe(420);
  });

  it("follows a clamped position as the roster grows until the user scrolls", async () => {
    await showPanel("env:growing");
    scrollTo(510);
    await hidePanel();

    rosterHeight = 700;
    await showPanel("env:growing");
    await resizeRoster(1000);
    expect(viewport().scrollTop).toBe(510);

    await hidePanel();
    rosterHeight = 700;
    await showPanel("env:growing");
    scrollTo(200);
    await resizeRoster(1000);
    expect(viewport().scrollTop).toBe(200);
  });

  it("stops following a clamped position once the user expands a section", async () => {
    await showPanel("env:expanded");
    scrollTo(510);
    await hidePanel();

    rosterHeight = 500;
    await showPanel("env:expanded");
    viewport().dispatchEvent(new Event("pointerdown"));
    await resizeRoster(1000);
    expect(viewport().scrollTop).toBe(200);

    await hidePanel();
    await showPanel("env:expanded");
    expect(viewport().scrollTop).toBe(200);
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
