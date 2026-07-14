import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";

function mountButton(label, attributes = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.style.margin = "24px";
  button.style.padding = "16px";
  Object.entries(attributes).forEach(([name, value]) => {
    if (value === true) button.setAttribute(name, "");
    else if (value !== false) button.setAttribute(name, String(value));
  });
  document.body.append(button);
  return button;
}

function computed(element) {
  const style = getComputedStyle(element);
  return {
    background: style.backgroundColor,
    color: style.color,
    outlineColor: style.outlineColor,
    outlineOffset: style.outlineOffset,
    outlineStyle: style.outlineStyle,
    outlineWidth: style.outlineWidth,
  };
}

function setRestBackground(element) {
  if (!document.querySelector("style[data-fixture-rest]")) {
    const style = document.createElement("style");
    style.dataset.fixtureRest = "";
    style.textContent = ".fixture-rest { background-color: var(--background); }";
    document.head.append(style);
  }
  element.classList.add("fixture-rest");
}

describe("compiled interaction states", () => {
  it.each(["light", "dark"])(
    "keeps list-item hover fill-only and keyboard focus stronger in %s mode",
    async (theme) => {
      document.documentElement.classList.toggle("dark", theme === "dark");
      const button = mountButton("Open customer", {
        class: "interactive-list-item",
        "data-interactive-surface": true,
        "data-interactive-outline": "preserve",
      });
      setRestBackground(button);
      const locator = page.getByRole("button", { name: "Open customer" });
      await expect.element(locator).toBeVisible();

      const rest = computed(button);
      await userEvent.hover(locator);
      await expect.poll(() => computed(button).background).not.toBe(rest.background);
      expect(computed(button).outlineWidth).toBe(rest.outlineWidth);

      await userEvent.unhover(locator);
      await userEvent.tab();
      await expect.element(locator).toHaveFocus();
      expect(computed(button)).toMatchObject({
        outlineOffset: "2px",
        outlineStyle: "solid",
        outlineWidth: "2px",
      });
    }
  );

  it("renders dark hover and press through the shared interaction tokens", async () => {
    document.documentElement.classList.add("dark");
    const button = mountButton("Run workflow", {
      "data-interactive-surface": true,
    });
    setRestBackground(button);
    const locator = page.getByRole("button", { name: "Run workflow" });
    const rest = computed(button);

    await userEvent.hover(locator);
    await expect.poll(() => computed(button).background).not.toBe(rest.background);
    await expect.poll(() => computed(button).outlineColor).not.toBe(rest.outlineColor);

    const hover = computed(button);
    const click = locator.click({ delay: 250 });
    await expect.poll(() => computed(button).background).not.toBe(hover.background);
    await click;
  });

  it("does not leak hover treatment into disabled or inert surfaces", async () => {
    document.documentElement.classList.add("dark");
    const disabled = mountButton("Disabled action", {
      disabled: true,
      "data-interactive-surface": true,
    });
    const inert = mountButton("Inert action", {
      inert: true,
      "data-interactive-surface": true,
    });
    const disabledRest = computed(disabled);
    const inertRest = computed(inert);

    await userEvent.hover(page.getByRole("button", { name: "Disabled action" }));
    expect(computed(disabled)).toEqual(disabledRest);
    await userEvent.hover(page.getByRole("button", { name: "Inert action" }), {
      force: true,
    });
    expect(computed(inert)).toEqual(inertRest);
  });

  it("keeps destructive menu hover in the destructive color family", async () => {
    document.documentElement.classList.add("dark");
    const action = mountButton("Delete workflow", {
      "data-slot": "dropdown-menu-item",
      "data-variant": "destructive",
    });
    const destructiveProbe = document.createElement("span");
    destructiveProbe.style.color = "var(--destructive)";
    document.body.append(destructiveProbe);

    const rest = computed(action);
    await userEvent.hover(page.getByRole("button", { name: "Delete workflow" }));
    await expect.poll(() => computed(action).background).not.toBe(rest.background);
    await expect.poll(() => computed(action).color).toBe(computed(destructiveProbe).color);
  });
});
