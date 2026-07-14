import { afterEach, beforeEach } from "vitest";
import { userEvent } from "vitest/browser";

import "@/app/globals.css";

beforeEach(async () => {
  document.documentElement.classList.remove("dark");
  document.body.replaceChildren();
  await userEvent.unhover(document.body);
});

afterEach(() => {
  document.documentElement.classList.remove("dark");
  document.body.replaceChildren();
});
