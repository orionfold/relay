import { vi } from "vitest";
import {
  buildNextLaunchArgs,
  buildSidecarUrl,
  isNonLoopbackHost,
  resolveNextEntrypoint,
  resolveSidecarPort,
} from "../sidecar-launch";

describe("desktop sidecar launch helpers", () => {
  it("keeps an explicit wrapper port instead of probing again", async () => {
    const findAvailablePort = vi.fn(async () => 4510);

    const port = await resolveSidecarPort({
      argv: ["--no-open", "--port", "3210"],
      requestedPort: 3210,
      findAvailablePort,
    });

    expect(port).toBe(3210);
    expect(findAvailablePort).not.toHaveBeenCalled();
  });

  it("falls back to port discovery only when no port was passed", async () => {
    const findAvailablePort = vi.fn(async () => 4510);

    const port = await resolveSidecarPort({
      argv: ["--no-open"],
      requestedPort: 3210,
      findAvailablePort,
    });

    expect(port).toBe(4510);
    expect(findAvailablePort).toHaveBeenCalledWith(3210);
  });

  it("launches Next on loopback for production builds", () => {
    expect(
      buildNextLaunchArgs({
        isPrebuilt: true,
        port: 3210,
      }),
    ).toEqual(["start", "--hostname", "127.0.0.1", "--port", "3210"]);
  });

  it("launches Next on loopback for development builds", () => {
    expect(
      buildNextLaunchArgs({
        isPrebuilt: false,
        port: 3210,
      }),
    ).toEqual(["dev", "--hostname", "127.0.0.1", "--port", "3210"]);
  });

  it("resolves the real Next entrypoint instead of the .bin shim", () => {
    const existingPaths = new Set([
      "/workspace/node_modules/next/dist/bin/next",
    ]);

    expect(
      resolveNextEntrypoint(
        "/workspace/apps/ainative",
        (targetPath) => existingPaths.has(targetPath),
      ),
    ).toBe("/workspace/node_modules/next/dist/bin/next");
  });

  it("uses the loopback url that the desktop shell polls", () => {
    expect(buildSidecarUrl(3210)).toBe("http://127.0.0.1:3210");
  });

  it("forwards a custom bind host to Next (for --hostname 0.0.0.0)", () => {
    expect(
      buildNextLaunchArgs({
        isPrebuilt: true,
        port: 3210,
        host: "0.0.0.0",
      }),
    ).toEqual(["start", "--hostname", "0.0.0.0", "--port", "3210"]);
  });

  it("builds a URL against a custom host", () => {
    expect(buildSidecarUrl(3210, "0.0.0.0")).toBe("http://0.0.0.0:3210");
  });

  describe("isNonLoopbackHost — drives the --hostname exposure warning", () => {
    it.each(["127.0.0.1", "localhost", "::1", "LOCALHOST", "127.0.0.5"])(
      "treats %s as loopback (no warning)",
      (host) => {
        expect(isNonLoopbackHost(host)).toBe(false);
      },
    );

    it.each(["0.0.0.0", "::", "192.168.1.10", "10.0.0.4", "0.0.0.0 ", "relay.local"])(
      "treats %s as non-loopback (warn: exposed to network)",
      (host) => {
        expect(isNonLoopbackHost(host)).toBe(true);
      },
    );
  });
});
