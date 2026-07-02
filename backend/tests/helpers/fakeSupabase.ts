type Row = Record<string, unknown>;

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

function matchesFilters(row: Row, filters: [string, unknown][]): boolean {
  return filters.every(([key, value]) => row[key] === value);
}

class FakeQueryBuilder {
  private filters: [string, unknown][] = [];
  private mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: Row | Row[] | null = null;
  private wantSingle = false;
  private orderBy: { column: string; ascending: boolean } | null = null;
  private conflictColumn: string | null = null;

  constructor(private table: FakeTable) {}

  select(_columns = "*") {
    if (this.mode === "select") return this;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }

  order(column: string, opts: { ascending: boolean } = { ascending: true }) {
    this.orderBy = { column, ascending: opts.ascending };
    return this;
  }

  single() {
    this.wantSingle = true;
    return this;
  }

  insert(payload: Row) {
    this.mode = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Row) {
    this.mode = "update";
    this.payload = payload;
    return this;
  }

  delete() {
    this.mode = "delete";
    return this;
  }

  upsert(payload: Row, opts?: { onConflict?: string }) {
    this.mode = "upsert";
    this.payload = payload;
    this.conflictColumn = opts?.onConflict ?? null;
    return this;
  }

  async execute(): Promise<QueryResult<Row | Row[]>> {
    return this.run();
  }

  then<TResult1 = QueryResult<Row | Row[]>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<Row | Row[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private async run(): Promise<QueryResult<Row | Row[]>> {
    const table = this.table;

    if (this.mode === "select") {
      let rows = table.rows.filter((r) => matchesFilters(r, this.filters));
      if (this.orderBy) {
        const { column, ascending } = this.orderBy;
        rows = [...rows].sort((a, b) => {
          const av = a[column] as string;
          const bv = b[column] as string;
          if (av < bv) return ascending ? -1 : 1;
          if (av > bv) return ascending ? 1 : -1;
          return 0;
        });
      }
      if (this.wantSingle) {
        const row = rows[0] ?? null;
        return { data: row, error: row ? null : { message: "not found" } };
      }
      return { data: rows, error: null };
    }

    if (this.mode === "insert") {
      const row = { id: table.nextId(), ...(this.payload as Row) };
      table.rows.push(row);
      if (this.wantSingle) return { data: row, error: null };
      return { data: [row], error: null };
    }

    if (this.mode === "update") {
      const matched = table.rows.filter((r) => matchesFilters(r, this.filters));
      matched.forEach((r) => Object.assign(r, this.payload));
      if (this.wantSingle) {
        return { data: matched[0] ?? null, error: matched[0] ? null : { message: "not found" } };
      }
      return { data: matched, error: null };
    }

    if (this.mode === "delete") {
      const matched = table.rows.filter((r) => matchesFilters(r, this.filters));
      table.rows = table.rows.filter((r) => !matchesFilters(r, this.filters));
      if (this.wantSingle) {
        return { data: matched[0] ?? null, error: matched[0] ? null : { message: "not found" } };
      }
      return { data: matched, error: null };
    }

    if (this.mode === "upsert") {
      const conflictCol = this.conflictColumn;
      const payload = this.payload as Row;
      let existing: Row | undefined;
      if (conflictCol) {
        existing = table.rows.find((r) => r[conflictCol] === payload[conflictCol]);
      }
      let row: Row;
      if (existing) {
        Object.assign(existing, payload);
        row = existing;
      } else {
        row = { id: table.nextId(), ...payload };
        table.rows.push(row);
      }
      if (this.wantSingle) return { data: row, error: null };
      return { data: [row], error: null };
    }

    return { data: null, error: { message: "unsupported operation" } };
  }
}

class FakeTable {
  rows: Row[] = [];
  private idCounter = 0;

  nextId(): string {
    this.idCounter += 1;
    return `fake-id-${this.idCounter}`;
  }
}

export class FakeSupabaseClient {
  private tables = new Map<string, FakeTable>();
  calls: { table: string }[] = [];

  seed(tableName: string, rows: Row[]) {
    const table = this.getTable(tableName);
    table.rows.push(...rows.map((r) => ({ ...r })));
    return this;
  }

  getRows(tableName: string): Row[] {
    return this.getTable(tableName).rows;
  }

  from(tableName: string) {
    this.calls.push({ table: tableName });
    return new FakeQueryBuilder(this.getTable(tableName));
  }

  private getTable(tableName: string): FakeTable {
    if (!this.tables.has(tableName)) {
      this.tables.set(tableName, new FakeTable());
    }
    return this.tables.get(tableName)!;
  }
}

export function createFakeSupabaseClient() {
  return new FakeSupabaseClient();
}
