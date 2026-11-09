import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractChangelogSection,
  parseReleaseNotesMarkdown,
} from "../../shared/changelog-notes.mjs";
import {
  compareVersions,
  decideWhatsNew,
  parseReleaseNotesHtml,
  parseUpdaterReleaseNotes,
} from "./release-notes";

// Decoded <content> of the 1.5.2 entry from the live releases.atom feed.
const FEED_1_5_2 = `<h3>Added</h3>
<ul>
<li>Save links from across the web directly to Saved Posts, with previews where available.</li>
<li>Improved saving X and Bluesky posts, including clearer post previews and duplicate handling.</li>
</ul>
<h3>Fixed</h3>
<ul>
<li>Reddit links can now be saved without API access.</li>
<li>Fixed card header spacing and scrollbar shifts that could disrupt widget layouts.</li>
</ul>
<h3>Security</h3>
<ul>
<li>Strengthened app isolation and safeguards for requests made by content sources.</li>
</ul>`;

describe("parseReleaseNotesHtml", () => {
  it("parses the 1.5.2 feed entry to the same document as the changelog markdown", () => {
    const changelog = readFileSync(resolve(process.cwd(), "CHANGELOG.md"), "utf8");
    const expected = parseReleaseNotesMarkdown(extractChangelogSection(changelog, "1.5.2"));
    expect(parseReleaseNotesHtml(FEED_1_5_2)).toEqual(expected);
  });

  it("decodes entities exactly once", () => {
    const doc = parseReleaseNotesHtml(
      "<h3>A &amp; B</h3><ul><li>&lt;b&gt; &#39;x&#39; &#x27;y&#x27; &quot;z&quot;</li><li>&amp;lt;</li></ul>",
    );
    expect(doc).toEqual({
      sections: [
        { heading: "A & B", items: ["<b> 'x' 'y' \"z\"", "&lt;"] },
      ],
    });
  });

  it("returns null for the sentinel and empty input", () => {
    expect(parseReleaseNotesHtml("No content.")).toBeNull();
    expect(parseReleaseNotesHtml("")).toBeNull();
  });

  it("puts items without a heading in a null-heading section", () => {
    expect(parseReleaseNotesHtml("<ul><li>one</li></ul>")).toEqual({
      sections: [{ heading: null, items: ["one"] }],
    });
  });

  it("drops scripts, keeps inline tag text, and ignores unknown tags", () => {
    const doc = parseReleaseNotesHtml(
      "<h3>H</h3><ul><li>a <strong>bold</strong> <custom-x foo='1'>b</custom-x><script>alert(1)</script> c</li></ul>",
    );
    expect(doc).toEqual({ sections: [{ heading: "H", items: ["a bold b c"] }] });
    expect(JSON.stringify(doc)).not.toContain("<");
  });

  it("strips HTML comments", () => {
    expect(parseReleaseNotesHtml("<ul><li>x <!-- c --> y</li></ul>")).toEqual({
      sections: [{ heading: null, items: ["x y"] }],
    });
  });

  it("treats br and block tags as word boundaries", () => {
    expect(parseReleaseNotesHtml("<ul><li>one<br>two</li></ul>")).toEqual({
      sections: [{ heading: null, items: ["one two"] }],
    });
    expect(parseReleaseNotesHtml("<ul><li><p>a</p><p>b</p></li></ul>")).toEqual({
      sections: [{ heading: null, items: ["a b"] }],
    });
  });

  it("decodes a numeric apostrophe entity", () => {
    expect(parseReleaseNotesHtml("<ul><li>it&#39;s</li></ul>")).toEqual({
      sections: [{ heading: null, items: ["it's"] }],
    });
  });

  it("drops sections with no items", () => {
    expect(parseReleaseNotesHtml("<h3>Empty</h3><h3>Full</h3><ul><li>x</li></ul>")).toEqual({
      sections: [{ heading: "Full", items: ["x"] }],
    });
  });
});

describe("parseUpdaterReleaseNotes", () => {
  it("concatenates array input", () => {
    const html = "<h3>A</h3><ul><li>x</li></ul>";
    expect(parseUpdaterReleaseNotes([{ note: html }, { note: html }])).toEqual({
      sections: [
        { heading: "A", items: ["x"] },
        { heading: "A", items: ["x"] },
      ],
    });
  });

  it("falls back to markdown and rejects other input", () => {
    expect(parseUpdaterReleaseNotes("### Fixed\n\n- thing")).toEqual({
      sections: [{ heading: "Fixed", items: ["thing"] }],
    });
    expect(parseUpdaterReleaseNotes(42)).toBeNull();
    expect(parseUpdaterReleaseNotes(null)).toBeNull();
    expect(parseUpdaterReleaseNotes("  ")).toBeNull();
    expect(parseUpdaterReleaseNotes([])).toBeNull();
  });
});

describe("compareVersions", () => {
  it("compares numerically and strips suffixes", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBe(1);
    expect(compareVersions("1.9.0", "1.10.0")).toBe(-1);
    expect(compareVersions("1.5.2", "1.5.2")).toBe(0);
    expect(compareVersions("1.5.2-beta.1", "1.5.2")).toBe(0);
  });

  it("returns null for invalid versions", () => {
    expect(compareVersions("abc", "1.0.0")).toBeNull();
    expect(compareVersions("1.0.0", "")).toBeNull();
    expect(compareVersions("1.0", "1.0.0")).toBeNull();
    expect(compareVersions("1.5.2.1", "1.5.2")).toBeNull();
    expect(compareVersions("1.5.2abc", "1.5.2")).toBeNull();
  });
});

describe("decideWhatsNew", () => {
  it("seeds on a fresh install", () => {
    expect(decideWhatsNew(null, "1.5.2")).toBe("seed");
  });

  it("seeds an existing profile that has no last-seen value", () => {
    expect(decideWhatsNew(null, "1.6.0")).toBe("seed");
    expect(decideWhatsNew("", "1.6.0")).toBe("seed");
  });

  it("returns none for the same version", () => {
    expect(decideWhatsNew("1.5.2", "1.5.2")).toBe("none");
  });

  it("shows for a newer version", () => {
    expect(decideWhatsNew("1.5.2", "1.6.0")).toBe("show");
    expect(decideWhatsNew("1.9.0", "1.10.0")).toBe("show");
  });

  it("returns none for a downgrade", () => {
    expect(decideWhatsNew("1.6.0", "1.5.2")).toBe("none");
    expect(decideWhatsNew("1.10.0", "1.9.0")).toBe("none");
  });

  it("handles garbage input", () => {
    expect(decideWhatsNew("garbage", "1.5.2")).toBe("seed");
    expect(decideWhatsNew("1.5.2", "garbage")).toBe("none");
    expect(decideWhatsNew(null, "1.5.2.1")).toBe("none");
  });
});
