import { describe, it, expect } from "bun:test";
import {
  matchesExcludePattern,
  filterExcludedFiles,
} from "./utils";

describe("matchesExcludePattern", () => {
  // ==============================================================================
  // BACKWARD COMPATIBILITY - Existing patterns must continue to work
  // ==============================================================================
  describe("backward compatibility", () => {
    it("matches exact file paths", () => {
      expect(matchesExcludePattern("src/index.ts", ["src/index.ts"])).toBe(true);
      expect(matchesExcludePattern("src/index.ts", ["src/other.ts"])).toBe(false);
    });

    it("matches directory prefixes (trailing /)", () => {
      expect(matchesExcludePattern("node_modules/pkg/index.js", ["node_modules/"])).toBe(true);
      expect(matchesExcludePattern("src/node_modules/pkg.js", ["node_modules/"])).toBe(false);
      expect(matchesExcludePattern("dist/bundle.js", ["dist/"])).toBe(true);
    });

    it("matches directory prefixes without trailing /", () => {
      expect(matchesExcludePattern("src/lib/utils.ts", ["src/lib"])).toBe(true);
      expect(matchesExcludePattern("src/lib.ts", ["src/lib"])).toBe(false);
    });

    it("matches simple glob patterns with *", () => {
      expect(matchesExcludePattern("src/index.ts", ["*.ts"])).toBe(true);
      expect(matchesExcludePattern("src/index.ts", ["*.js"])).toBe(false);
      expect(matchesExcludePattern("src/utils/helper.test.ts", ["*.test.ts"])).toBe(true);
    });

    it("matches glob patterns with path prefix", () => {
      expect(matchesExcludePattern("src/index.ts", ["src/*.ts"])).toBe(true);
      expect(matchesExcludePattern("src/lib/index.ts", ["src/*.ts"])).toBe(false);
      expect(matchesExcludePattern("src/lib/index.ts", ["src/**/*.ts"])).toBe(true);
    });
  });

  // ==============================================================================
  // REGEX SUPPORT - /pattern/flags syntax
  // ==============================================================================
  describe("regex /pattern/flags syntax", () => {
    it("matches basic regex patterns", () => {
      expect(matchesExcludePattern("src/index.test.ts", ["/\\.test\\.ts$/"])).toBe(true);
      expect(matchesExcludePattern("src/index.ts", ["/\\.test\\.ts$/"])).toBe(false);
    });

    it("matches regex with case-insensitive flag", () => {
      expect(matchesExcludePattern("README.md", ["/readme/i"])).toBe(true);
      expect(matchesExcludePattern("readme.md", ["/readme/i"])).toBe(true);
      expect(matchesExcludePattern("README.md", ["/readme/"])).toBe(false);
    });

    it("matches complex regex patterns", () => {
      // Match .test.ts or .spec.ts files
      expect(matchesExcludePattern("foo.test.ts", ["/\\.(test|spec)\\.ts$/"])).toBe(true);
      expect(matchesExcludePattern("foo.spec.ts", ["/\\.(test|spec)\\.ts$/"])).toBe(true);
      expect(matchesExcludePattern("foo.ts", ["/\\.(test|spec)\\.ts$/"])).toBe(false);
    });

    it("matches regex anchored to start of path", () => {
      expect(matchesExcludePattern("test/foo.ts", ["/^test\\//"])).toBe(true);
      expect(matchesExcludePattern("src/test/foo.ts", ["/^test\\//"])).toBe(false);
    });

    it("supports multiple flags", () => {
      expect(matchesExcludePattern("TEST.TS", ["/test\\.ts/gi"])).toBe(true);
    });

    it("handles regex that matches mid-path", () => {
      expect(matchesExcludePattern("src/__mocks__/api.ts", ["/__mocks__/"])).toBe(true);
      expect(matchesExcludePattern("src/mocks/api.ts", ["/__mocks__/"])).toBe(false);
    });
  });

  // ==============================================================================
  // REGEX SUPPORT - regex:pattern syntax
  // ==============================================================================
  describe("regex:pattern syntax", () => {
    it("matches basic regex patterns", () => {
      expect(matchesExcludePattern("src/index.test.ts", ["regex:\\.test\\.ts$"])).toBe(true);
      expect(matchesExcludePattern("src/index.ts", ["regex:\\.test\\.ts$"])).toBe(false);
    });

    it("matches regex with alternation", () => {
      expect(matchesExcludePattern("foo.spec.tsx", ["regex:\\.(spec|test)\\.(ts|tsx)$"])).toBe(true);
      expect(matchesExcludePattern("foo.test.tsx", ["regex:\\.(spec|test)\\.(ts|tsx)$"])).toBe(true);
      expect(matchesExcludePattern("foo.unit.tsx", ["regex:\\.(spec|test)\\.(ts|tsx)$"])).toBe(false);
    });

    it("matches paths containing specific segments", () => {
      expect(matchesExcludePattern("src/__tests__/foo.ts", ["regex:__tests__"])).toBe(true);
      expect(matchesExcludePattern("src/tests/foo.ts", ["regex:__tests__"])).toBe(false);
    });
  });

  // ==============================================================================
  // ERROR HANDLING - Invalid patterns should be handled gracefully
  // ==============================================================================
  describe("error handling", () => {
    it("handles invalid regex patterns gracefully (returns false)", () => {
      // Invalid regex - unclosed group
      expect(matchesExcludePattern("foo.ts", ["/[invalid/"])).toBe(false);
      expect(matchesExcludePattern("foo.ts", ["regex:[invalid"])).toBe(false);
    });

    it("handles empty patterns", () => {
      expect(matchesExcludePattern("foo.ts", [""])).toBe(false);
      expect(matchesExcludePattern("foo.ts", [])).toBe(false);
    });

    it("continues matching after invalid pattern", () => {
      // Invalid pattern first, then valid pattern
      expect(matchesExcludePattern("foo.test.ts", ["/[invalid/", "*.test.ts"])).toBe(true);
    });
  });

  // ==============================================================================
  // EDGE CASES
  // ==============================================================================
  describe("edge cases", () => {
    it("handles patterns with special regex characters literally in globs", () => {
      // The dot in glob should be escaped properly
      expect(matchesExcludePattern("foo.test.ts", ["*.test.ts"])).toBe(true);
      expect(matchesExcludePattern("footestXts", ["*.test.ts"])).toBe(false);
    });

    it("does not treat normal patterns as regex", () => {
      // Pattern without / delimiters or regex: prefix is not regex
      expect(matchesExcludePattern("src/index.ts", ["index"])).toBe(false);
      expect(matchesExcludePattern("index", ["index"])).toBe(true);
    });

    it("handles pattern with only slash delimiters but no content", () => {
      expect(matchesExcludePattern("foo.ts", ["//"])).toBe(false);
    });

    it("handles regex:prefix with empty pattern", () => {
      expect(matchesExcludePattern("foo.ts", ["regex:"])).toBe(true); // empty regex matches everything
    });

    it("does not confuse file paths containing 'regex:' with regex patterns", () => {
      // A file literally named "regex:foo.ts" - unlikely but edge case
      expect(matchesExcludePattern("src/regex:foo.ts", ["regex:foo"])).toBe(true);
    });

    it("glob patterns with ? wildcard", () => {
      expect(matchesExcludePattern("src/a.ts", ["?.ts"])).toBe(true);
      expect(matchesExcludePattern("src/ab.ts", ["?.ts"])).toBe(false);
    });

    it("glob patterns with character classes [...]", () => {
      expect(matchesExcludePattern("src/test1.ts", ["test[0-9].ts"])).toBe(true);
      expect(matchesExcludePattern("src/testA.ts", ["test[0-9].ts"])).toBe(false);
    });
  });

  // ==============================================================================
  // MULTIPLE PATTERNS
  // ==============================================================================
  describe("multiple patterns", () => {
    it("matches if any pattern matches", () => {
      const patterns = ["dist/", "*.test.ts", "/\\.spec\\.ts$/"];
      expect(matchesExcludePattern("dist/bundle.js", patterns)).toBe(true);
      expect(matchesExcludePattern("src/foo.test.ts", patterns)).toBe(true);
      expect(matchesExcludePattern("src/bar.spec.ts", patterns)).toBe(true);
      expect(matchesExcludePattern("src/index.ts", patterns)).toBe(false);
    });
  });
});

describe("filterExcludedFiles", () => {
  it("filters files matching patterns", () => {
    const files = [
      "src/index.ts",
      "src/utils.test.ts",
      "dist/bundle.js",
      "README.md",
    ];
    const patterns = ["dist/", "*.test.ts"];
    const result = filterExcludedFiles(files, patterns);

    expect(result).toEqual(["src/index.ts", "README.md"]);
  });

  it("filters files using regex patterns", () => {
    const files = [
      "src/index.ts",
      "src/utils.spec.ts",
      "src/helpers.test.tsx",
      "README.md",
    ];
    const patterns = ["/\\.(test|spec)\\.(ts|tsx)$/"];
    const result = filterExcludedFiles(files, patterns);

    expect(result).toEqual(["src/index.ts", "README.md"]);
  });

  it("returns all files if no patterns provided", () => {
    const files = ["a.ts", "b.ts"];
    expect(filterExcludedFiles(files, [])).toEqual(files);
    expect(filterExcludedFiles(files, undefined as any)).toEqual(files);
  });
});
