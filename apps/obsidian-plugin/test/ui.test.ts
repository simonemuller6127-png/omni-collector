import { describe, expect, it } from "vitest";
import { filterCollections, nextOrganizeState } from "../src/ui/helpers.js";
import { DATAVIEW_TEMPLATES } from "../src/ui/dataview-templates.js";
import type { CollectionDTO } from "@omni/shared-core";

const items: CollectionDTO[] = [
  {
    id: "a",
    platform: "bilibili",
    platformItemId: "BV-a",
    url: "u",
    title: "A",
    contentType: "video",
    saveType: "favorited",
    contentStatus: "active",
    syncStatus: "full",
    organizeStatus: "unorganized",
    priority: "normal",
    collectedAt: "2026-01-02T00:00:00Z",
  },
  {
    id: "b",
    platform: "youtube",
    platformItemId: "yt-b",
    url: "u2",
    title: "B",
    contentType: "video",
    saveType: "favorited",
    contentStatus: "active",
    syncStatus: "full",
    organizeStatus: "organized",
    priority: "project",
    collectedAt: "2026-01-01T00:00:00Z",
  },
];

describe("ui helpers", () => {
  it("filters and sorts by collected time desc", () => {
    const out = filterCollections(items, {});
    expect(out.map((c) => c.id)).toEqual(["a", "b"]);
    expect(filterCollections(items, { priority: "project" }).map((c) => c.id)).toEqual(["b"]);
    expect(filterCollections(items, { status: "unorganized" }).map((c) => c.id)).toEqual(["a"]);
  });

  it("walks organize state forward", () => {
    expect(nextOrganizeState("unorganized")).toBe("viewed");
    expect(nextOrganizeState("viewed")).toBe("organized");
    expect(nextOrganizeState("organized")).toBe("archived");
    expect(nextOrganizeState("archived")).toBe("archived");
  });

  it("provides dataview templates", () => {
    expect(DATAVIEW_TEMPLATES.unorganized).toContain("organize_status = \"unorganized\"");
    expect(DATAVIEW_TEMPLATES.priority).toContain("priority = \"important\"");
    expect(DATAVIEW_TEMPLATES.all).toContain("FROM #omni/collector");
  });
});
