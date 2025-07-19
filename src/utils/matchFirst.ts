type Case<T> = { condition: boolean; value: T };

class MatchFirst<T> {
  private cases: Case<T>[] = [];

  when(cond: boolean, value: T): this {
    this.cases.push({ condition: cond, value });
    return this;
  }

  default(value: T): T {
    const found = this.cases.find((c) => c.condition);
    return found ? found.value : value;
  }
}

export function matchFirst<T = never>() {
  return new MatchFirst<T>();
}
