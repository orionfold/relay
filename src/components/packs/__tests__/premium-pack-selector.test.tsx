import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PremiumPackSelector,
  type SelectablePremiumPack,
} from "../premium-pack-selector";

const { refresh, toast } = vi.hoisted(() => ({
  refresh: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast }));

const KEY = "relay:premium-pack-selection:v1";
const OFFER = {
  price: { intro: "$349/year", list: "$499/year" },
  purchaseUrl: "https://orionfold.com/relay/",
  premiumPackCount: 3,
};
const PACKS: SelectablePremiumPack[] = [
  {
    id: "relay-cre",
    name: "Relay CRE",
    bundle: [],
    decision: {
      job: "Run CRE delivery.",
      chooseWhen: "You manage leases and renewals.",
      includes: "2 profiles · 3 workflows",
      worksWith: "Builds on Relay Agency.",
    },
  },
  {
    id: "relay-agency-cre",
    name: "Relay Agency for CRE",
    bundle: ["relay-agency", "relay-cre"],
    decision: {
      job: "Run an agency and CRE delivery together.",
      chooseWhen: "You want one composed app.",
      includes: "2 Packs in one app",
      worksWith: "Contains Relay Agency and Relay CRE.",
    },
  },
  {
    id: "relay-social",
    name: "Relay Social",
    bundle: [],
    decision: {
      job: "Run the demand engine.",
      chooseWhen: "You publish campaigns.",
      includes: "2 profiles · 2 workflows",
      worksWith: "Pairs with Relay CRM.",
    },
  },
];

function renderSelector(
  overrides: Partial<React.ComponentProps<typeof PremiumPackSelector>> = {},
) {
  return render(
    <PremiumPackSelector
      packs={PACKS}
      visiblePackIds={PACKS.map((pack) => pack.id)}
      offer={OFFER}
      offerError={null}
      packsEntitled={false}
      licenseLifecycle="none"
      {...overrides}
    />,
  );
}

describe("PremiumPackSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("shows one catalog price and saves Community selection for activation return", async () => {
    renderSelector();

    expect(screen.getAllByText("$349/year")).toHaveLength(1);
    expect(
      screen.getByRole("heading", {
        name: "Unlock all premium Packs for one reasonable price",
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Relay CRE" }));

    const purchase = await screen.findByRole("link", {
      name: /Get one license for selected Packs/,
    });
    expect(purchase).toHaveAttribute("href", OFFER.purchaseUrl);
    expect(screen.getByText(/Selection saved in this browser/)).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual(["relay-cre"]);
  });

  it("restores known selections while preserving them across a filter with no premium cards", async () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify(["relay-social", "unknown-pack"]),
    );
    renderSelector({
      visiblePackIds: [],
      packsEntitled: true,
      licenseLifecycle: "active",
    });

    expect(
      await screen.findByText("1 Pack selected."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Install selected" })).toBeEnabled();
    expect(
      screen.getByText("No uninstalled premium Packs in this filter."),
    ).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual([
      "relay-social",
    ]);
  });

  it("normalizes bundle and component overlap and announces the adjustment", async () => {
    renderSelector();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Relay CRE" }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Relay Agency for CRE" }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "replaces the overlapping selection: Relay CRE",
    );
    expect(
      screen.getByRole("checkbox", { name: "Select Relay CRE" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Select Relay Agency for CRE" }),
    ).toBeChecked();
  });

  it("also prevents two selected bundles from installing a shared child twice", async () => {
    const nonprofitBundle: SelectablePremiumPack = {
      id: "relay-agency-nonprofit",
      name: "Relay Agency for Nonprofits",
      bundle: ["relay-agency", "relay-nonprofit"],
      decision: {
        job: "Run an agency and nonprofit delivery.",
        chooseWhen: "You want one composed app.",
        includes: "2 Packs in one app",
        worksWith: "Contains Relay Agency and Relay Nonprofit.",
      },
    };
    const packs = [...PACKS, nonprofitBundle];
    renderSelector({
      packs,
      visiblePackIds: packs.map((pack) => pack.id),
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Relay Agency for CRE" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Select Relay Agency for Nonprofits",
      }),
    );

    expect(
      await screen.findByRole("status"),
    ).toHaveTextContent("Relay Agency for CRE");
    expect(
      screen.getByRole("checkbox", { name: "Select Relay Agency for CRE" }),
    ).not.toBeChecked();
  });

  it("keeps only failed installs selected and retries without replaying successes", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Pack files unavailable." }), {
          status: 500,
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    renderSelector({ packsEntitled: true, licenseLifecycle: "active" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Relay CRE" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Relay Social" }));
    fireEvent.click(screen.getByRole("button", { name: "Install selected" }));

    const resultList = await screen.findByRole("list", {
      name: "Pack install results",
    });
    expect(within(resultList).getByText("Relay CRE:").closest("li")).toHaveTextContent(
      "Installed successfully.",
    );
    expect(
      within(resultList).getByText("Relay Social:").closest("li"),
    ).toHaveTextContent("Pack files unavailable.");
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual([
      "relay-social",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Install selected" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual([]);
    expect(
      fetch.mock.calls.map((call) => JSON.parse(call[1]!.body as string).id),
    ).toEqual(["relay-cre", "relay-social", "relay-social"]);
  });

  it("guards a slow batch against a second click", async () => {
    let release: ((response: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetch = vi.fn(() => pending);
    vi.stubGlobal("fetch", fetch);
    renderSelector({ packsEntitled: true, licenseLifecycle: "active" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Relay Social" }));
    const install = screen.getByRole("button", { name: "Install selected" });
    fireEvent.click(install);
    fireEvent.click(install);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Installing selected…" })).toBeDisabled();
    release?.(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("names a stale entitlement refusal and links to license recovery", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            code: "license_required",
            error: "The premium Pack license is no longer current.",
          }),
          { status: 402 },
        ),
      ),
    );
    renderSelector({ packsEntitled: true, licenseLifecycle: "active" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Relay Social" }));
    fireEvent.click(screen.getByRole("button", { name: "Install selected" }));

    expect(
      await screen.findByText("The premium Pack license is no longer current."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Review or activate the license" }),
    ).toHaveAttribute("href", "/settings#settings-license");
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual([
      "relay-social",
    ]);
  });

  it("explains the all-installed state without asking for an impossible selection", () => {
    renderSelector({
      packs: [],
      visiblePackIds: [],
      packsEntitled: true,
      licenseLifecycle: "active",
    });

    expect(
      screen.getByRole("button", { name: "All premium Packs installed" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Install selected" }),
    ).not.toBeInTheDocument();
  });

  it("uses renewal copy for a lapsed term and blocks purchase when offer truth is unavailable", async () => {
    const { rerender } = renderSelector({ licenseLifecycle: "lapsed" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Relay Social" }));
    expect(
      await screen.findByRole("link", { name: /Renew to install selected/ }),
    ).toBeInTheDocument();

    rerender(
      <PremiumPackSelector
        packs={PACKS}
        visiblePackIds={PACKS.map((pack) => pack.id)}
        offer={null}
        offerError="Premium price metadata does not agree."
        packsEntitled={false}
        licenseLifecycle="none"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Premium price metadata does not agree.",
    );
    expect(
      screen.queryByRole("link", { name: /Get one license/ }),
    ).not.toBeInTheDocument();
  });
});
