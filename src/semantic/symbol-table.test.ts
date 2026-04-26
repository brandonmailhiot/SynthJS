import { describe, expect, it } from "vitest";
import type { Binding } from "../ast/nodes.js";
import { SymbolTable } from "./symbol-table.js";

const span = { start: 0, end: 0, line: 1, column: 1 };
const makeBinding = (name: string, value?: string): Binding => ({
  kind: "Binding",
  name,
  body: { kind: "EventList", events: [], span },
  span,
  ...(value !== undefined ? { doc: value } : {}),
});

describe("SymbolTable", () => {
  it("lookup finds binding in current scope", () => {
    const t = new SymbolTable();
    t.define("intro", makeBinding("intro"));
    expect(t.lookup("intro")?.name).toBe("intro");
  });

  it("lookup returns null for unknown", () => {
    const t = new SymbolTable();
    expect(t.lookup("nope")).toBeNull();
  });

  it("inner scope inherits outer", () => {
    const t = new SymbolTable();
    t.define("intro", makeBinding("intro"));
    t.pushScope();
    expect(t.lookup("intro")?.name).toBe("intro");
  });

  it("inner scope shadows outer", () => {
    const t = new SymbolTable();
    t.define("x", makeBinding("x", "outer"));
    t.pushScope();
    t.define("x", makeBinding("x", "inner"));
    const inner = t.lookup("x") as Binding;
    expect(inner.doc).toBe("inner");
    t.popScope();
    const outer = t.lookup("x") as Binding;
    expect(outer.doc).toBe("outer");
  });

  it("re-define same name in same scope throws", () => {
    const t = new SymbolTable();
    t.define("intro", makeBinding("intro"));
    expect(() => t.define("intro", makeBinding("intro"))).toThrow(/already defined/);
  });

  it("popScope on root scope throws", () => {
    const t = new SymbolTable();
    expect(() => t.popScope()).toThrow();
  });

  it("listAll returns all visible names", () => {
    const t = new SymbolTable();
    t.define("a", makeBinding("a"));
    t.pushScope();
    t.define("b", makeBinding("b"));
    expect(t.listAll().sort()).toEqual(["a", "b"]);
  });
});
