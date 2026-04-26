import type { Binding, InstrumentDef } from "../ast/nodes.js";

export type SymbolEntry = Binding | InstrumentDef;

export class SymbolTable {
  private scopes: Map<string, SymbolEntry>[] = [new Map()];

  pushScope(): void {
    this.scopes.push(new Map());
  }

  popScope(): void {
    if (this.scopes.length === 1) throw new Error("cannot pop root scope");
    this.scopes.pop();
  }

  define(name: string, sym: SymbolEntry): void {
    const top = this.scopes[this.scopes.length - 1];
    if (!top) throw new Error("symbol table is empty");
    if (top.has(name)) throw new Error(`'${name}' already defined in this scope`);
    top.set(name, sym);
  }

  lookup(name: string): SymbolEntry | null {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const scope = this.scopes[i];
      if (!scope) continue;
      const found = scope.get(name);
      if (found) return found;
    }
    return null;
  }

  listAll(): string[] {
    const seen = new Set<string>();
    for (const scope of this.scopes) for (const k of scope.keys()) seen.add(k);
    return [...seen];
  }
}
