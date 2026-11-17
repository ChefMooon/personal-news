import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { findVersionSection, parseReleaseNotes } from "../../shared/release-notes-markdown.mjs";
import { compareVersions, decideWhatsNew, parseReleaseNotesHtml, parseUpdaterReleaseNotes } from "./release-notes";

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

const canonical = (markdown: string) => parseReleaseNotes(markdown).notes;

describe("parseReleaseNotesHtml", () => {
  it("matches the canonical tree for the real 1.5.2 updater capture", () => {
    const section = findVersionSection(readFileSync(resolve(process.cwd(), "CHANGELOG.md"), "utf8"), "1.5.2");
    expect(parseReleaseNotesHtml(FEED_1_5_2)).toEqual(parseReleaseNotes(section.body, { lineOffset: section.bodyStartLine - 1 }).notes);
  });

  it.each([
    ["paragraph", "<p>Overview</p>", "paragraph"],
    ["inline formatting", "<h3>Added</h3><ul><li><code>x</code> <strong>b</strong> <em>i</em></li></ul>", "### Added\n\n- `x` **b** *i*"],
    ["spaces around inline formatting", "<h3>Added</h3><ul><li>Hello <strong>bold</strong> world</li></ul>", "### Added\n\n- Hello **bold** world"],
    ["spaces between inline elements", "<h3>Added</h3><ul><li><em>one</em> <strong>two</strong></li></ul>", "### Added\n\n- *one* **two**"],
    ["italic inside bold", "<h3>Added</h3><ul><li><strong>a <em>b</em> c</strong></li></ul>", "### Added\n\n- **a *b* c**"],
    ["code inside bold", "<h3>Added</h3><ul><li><strong>a <code>b</code></strong></li></ul>", "### Added\n\n- **a `b`**"],
    ["link", '<h3>Added</h3><ul><li><a href="https://example.com/x" rel="nofollow">t</a></li></ul>', "### Added\n\n- [t](https://example.com/x)"],
    ["code link label", '<h3>Added</h3><ul><li><a href="https://example.com/x"><code>t</code></a></li></ul>', "### Added\n\n- [`t`](https://example.com/x)"],
    ["nested list", "<h3>Added</h3><ul><li>Parent<ul><li>Child</li></ul></li></ul>", "### Added\n\n- Parent\n  - Child"],
    ["loose list", "<h3>Added</h3><ul><li><p>x</p></li></ul>", "### Added\n\n- x"],
    ["entities", "<h3>Added</h3><ul><li>&amp;lt; &amp; &#39;x&#39; &#x27;y&#x27;</li></ul>", "### Added\n\n- &lt; & 'x' 'y'"],
  ])("parses %s to the canonical tree", (_name, html, markdown) => {
    const notes = markdown === "paragraph"
      ? { sections: [{ heading: null, blocks: [{ type: "paragraph", inline: [{ type: "text", value: "Overview" }] }] }] }
      : canonical(markdown);
    const expected = notes;
    expect(parseReleaseNotesHtml(html)).toEqual(expected);
  });

  it("preserves safe link and code nodes and ignores unrelated attributes", () => {
    expect(parseReleaseNotesHtml('<ul><li onclick="bad()"><a href="https://example.com"><code>x</code></a></li></ul>')).toEqual({
      sections: [{ heading: null, blocks: [{ type: "list", items: [{ inline: [{ type: "link", href: "https://example.com", children: [{ type: "code", value: "x" }] }], children: [] }] }] }],
    });
  });

  it.each([
    "<script>x</script>", "<img>", "<table></table>", "<ol></ol>", "<blockquote>x</blockquote>", "<pre>x</pre>",
    "<h2>x</h2>", "<h4>x</h4>", "<br>", "<b>x</b>", "<custom-x>x</custom-x>", "<!-- junk -->", "stray <",
    '<ul><li><a href="http://example.com">x</a></li></ul>', '<ul><li><a href="javascript:alert(1)">x</a></li></ul>',
    '<ul><li><a href="data:text/plain,x">x</a></li></ul>', '<ul><li><a href="mailto:a@b">x</a></li></ul>',
    '<ul><li><a>x</a></li></ul>', '<ul><li><a href="https://user:pass@example.com">x</a></li></ul>',
    '<ul><li><a href="https://example.com/?x=&quot;y">x</a></li></ul>',
    '<ul><li><a href="https://example.com/?x=&#32;y">x</a></li></ul>',
    '<ul><li><a href="https://example.com/?x=&lt;y">x</a></li></ul>',
    `<ul><li><a href="https://example.com/${"x".repeat(2050)}">x</a></li></ul>`,
    "<h3>Added</h3><ul><li><p>First</p><p>Second</p></li></ul>",
    '<ul><li><a href="https://example.com"><a href="https://example.com">x</a></a></li></ul>',
    "<ul><li><strong><strong>x</strong></strong></li></ul>",
    "<ul><li><em><em>x</em></em></li></ul>",
    '<ul><li><a href="https://example.com"></a></li></ul>',
    "<ul><li><strong></strong></li></ul>",
    "<h3>Only heading</h3>",
    "<h3>A</h3><h3>B</h3><ul><li>x</li></ul>",
    "<ul><li>Parent<ul></ul><ul><li>Child</li></ul></li></ul>",
    "<ul><li><ul><li><ul><li>x</li></ul></li></ul></li></ul>", "<ul><li>x\u0000</li></ul>", "<ul><li>x\u202e</li></ul>",
    "No content.", "",
  ])("rejects unsupported or unsafe HTML: %s", (html) => {
    expect(() => parseReleaseNotesHtml(html)).not.toThrow();
    expect(parseReleaseNotesHtml(html)).toBeNull();
  });

  it("enforces bullet, text and input limits and rejects hostile inputs quickly", () => {
    expect(parseReleaseNotesHtml(`<ul>${"<li>x</li>".repeat(61)}</ul>`)).toBeNull();
    expect(parseReleaseNotesHtml(`<p>${"x".repeat(8001)}</p>`)).toBeNull();
    expect(parseReleaseNotesHtml("x".repeat(100_001))).toBeNull();
    expect(parseReleaseNotesHtml(`<p>${"x".repeat(100_001)}</p>`)).toBeNull();
    for (const input of ["<".repeat(1e6), "<ul><li>".repeat(1e5)]) {
      const start = performance.now();
      expect(parseReleaseNotesHtml(input)).toBeNull();
      expect(performance.now() - start).toBeLessThan(2000);
    }
  });
});

describe("parseUpdaterReleaseNotes", () => {
  it("concatenates array entries and accepts only valid markdown", () => {
    const html = "<h3>A</h3><ul><li>x</li></ul>";
    expect(parseUpdaterReleaseNotes([{ note: html }, { note: html }])?.sections).toHaveLength(2);
    expect(parseUpdaterReleaseNotes("### Fixed\n\n- thing")).toEqual(canonical("### Fixed\n\n- thing"));
    expect(parseUpdaterReleaseNotes("### Fixed\n\n- raw <b>")).toBeNull();
    expect(parseUpdaterReleaseNotes(42)).toBeNull();
    expect(parseUpdaterReleaseNotes(null)).toBeNull();
    expect(parseUpdaterReleaseNotes([{ note: html }, { note: 7 }])).toBeNull();
    expect(parseUpdaterReleaseNotes([{ note: html }, {}])).toBeNull();
    expect(parseUpdaterReleaseNotes([{ note: html }, { note: "<ul><li><a>bad</a></li></ul>" }])).toBeNull();
    expect(parseUpdaterReleaseNotes([{ note: "<ul>" + "<li>x</li>".repeat(31) + "</ul>" }, { note: "<ul>" + "<li>x</li>".repeat(30) + "</ul>" }])).toBeNull();
    expect(parseUpdaterReleaseNotes([{ note: `<p>${"x".repeat(4000)}</p>` }, { note: `<p>${"y".repeat(4001)}</p>` }])).toBeNull();
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
