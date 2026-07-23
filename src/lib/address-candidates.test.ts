import { describe, expect, it } from "vitest";
import {
  buildAddressCandidates,
  buildRawCandidate,
  buildSuggestionCandidates,
  stripTrailingSuffix,
  type AddressSuggestion,
} from "./dealmachine";

function suggestion(over: Partial<AddressSuggestion> = {}): AddressSuggestion {
  return {
    address: "7115 Glen Grove Drive",
    city: "San Antonio",
    state: "TX",
    zip: "78239",
    full_address: "7115 Glen Grove Drive, San Antonio, Texas 78239",
    ...over,
  };
}

describe("stripTrailingSuffix", () => {
  it("drops a trailing street-type word", () => {
    expect(stripTrailingSuffix("7115 Glen Grove Drive")).toBe("7115 Glen Grove");
    expect(stripTrailingSuffix("138 West Mariposa Drive")).toBe(
      "138 West Mariposa",
    );
    expect(stripTrailingSuffix("400 Oak Street")).toBe("400 Oak");
  });

  it("handles abbreviations and trailing periods", () => {
    expect(stripTrailingSuffix("7115 Glen Grove Dr")).toBe("7115 Glen Grove");
    expect(stripTrailingSuffix("7115 Glen Grove Dr.")).toBe("7115 Glen Grove");
    expect(stripTrailingSuffix("500 Elm Blvd")).toBe("500 Elm");
  });

  it("is case-insensitive", () => {
    expect(stripTrailingSuffix("7115 GLEN GROVE DRIVE")).toBe("7115 GLEN GROVE");
  });

  it("returns null when the last word is not a street type", () => {
    expect(stripTrailingSuffix("100 Chisholm Trail Ranch")).toBe(null);
    expect(stripTrailingSuffix("742 Evergreen")).toBe(null);
  });

  it("leaves words that are commonly street names, not suffixes", () => {
    // Stripping these would destroy the real street name and could match a
    // different parcel — "7115 Glen Grove" must not become "7115 Glen".
    expect(stripTrailingSuffix("7115 Glen Grove")).toBe(null);
    expect(stripTrailingSuffix("7115 Glen Trail")).toBe(null);
    expect(stripTrailingSuffix("200 Willow Park")).toBe(null);
    expect(stripTrailingSuffix("300 Deer Run")).toBe(null);
  });

  it("never strips down past '<number> <name>'", () => {
    expect(stripTrailingSuffix("7115 Drive")).toBe(null);
  });
});

describe("buildRawCandidate", () => {
  it("returns the raw string when it carries a ZIP", () => {
    const c = buildRawCandidate("138 W Mariposa Dr, San Antonio, TX 78212");
    expect(c?.kind).toBe("raw");
    expect(c?.payload).toEqual({
      full_address: "138 W Mariposa Dr, San Antonio, TX 78212",
    });
  });

  it("returns null without a ZIP, since enrichment requires one", () => {
    expect(buildRawCandidate("7115 Glen Grove San Antonio")).toBe(null);
    expect(buildRawCandidate("138 W Mariposa Dr, San Antonio, TX")).toBe(null);
  });

  it("trims surrounding whitespace", () => {
    expect(buildRawCandidate("  100 Main St, Austin, TX 78704  ")?.label).toBe(
      "100 Main St, Austin, TX 78704",
    );
  });
});

describe("buildSuggestionCandidates", () => {
  it("emits canonical street then the suffix-stripped variant", () => {
    const c = buildSuggestionCandidates(suggestion());
    expect(c).toHaveLength(2);
    expect(c[0].payload).toEqual({
      street: "7115 Glen Grove Drive",
      city: "San Antonio",
      state: "TX",
      zip: "78239",
    });
    // this is the variant that actually matches DealMachine's "7115 GLEN GRV"
    expect(c[1].payload).toEqual({
      street: "7115 Glen Grove",
      city: "San Antonio",
      state: "TX",
      zip: "78239",
    });
  });

  it("emits a single candidate when there is no suffix to strip", () => {
    const c = buildSuggestionCandidates(suggestion({ address: "7115 Glen Grove" }));
    expect(c).toHaveLength(1);
  });

  it("does not duplicate when stripping yields the same street", () => {
    const c = buildSuggestionCandidates(suggestion({ address: "100 Main" }));
    const streets = c.map((x) => (x.payload as { street: string }).street);
    expect(new Set(streets).size).toBe(streets.length);
  });
});

describe("buildAddressCandidates ordering", () => {
  it("puts the raw ZIP-bearing string first, then suggestion variants", () => {
    const c = buildAddressCandidates(
      "7115 Glen Grove Dr, San Antonio, TX 78239",
      [suggestion()],
    );
    expect(c.map((x) => x.kind)).toEqual(["raw", "structured", "structured"]);
    expect(c[0].label).toBe("7115 Glen Grove Dr, San Antonio, TX 78239");
    expect(c[2].label).toContain("7115 Glen Grove,");
  });

  it("omits the raw candidate when the input has no ZIP", () => {
    const c = buildAddressCandidates("7115 Glen Grove San Antonio", [
      suggestion(),
    ]);
    expect(c.map((x) => x.kind)).toEqual(["structured", "structured"]);
  });

  it("expands multiple suggestions in order", () => {
    const c = buildAddressCandidates("7115 Glen Grove", [
      suggestion(),
      suggestion({ address: "7115 Glen Trail", full_address: "7115 Glen Trail" }),
    ]);
    // "Glen Grove Drive" yields 2 (Drive stripped); "Glen Trail" yields 1
    // (Trail is not treated as a strippable suffix). First suggestion's
    // variants come first.
    expect(c).toHaveLength(3);
    expect(c[0].label).toContain("Glen Grove Drive");
    expect(c[1].label).toContain("Glen Grove,");
    expect(c[2].label).toContain("Glen Trail");
  });

  it("returns nothing when there is no ZIP and no suggestions", () => {
    expect(buildAddressCandidates("garbage input", [])).toEqual([]);
  });
});
