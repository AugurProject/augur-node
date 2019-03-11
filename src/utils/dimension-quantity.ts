import { BigNumber } from "bignumber.js";

const ZERO = new BigNumber(0);
const ONE = new BigNumber(1);

/*
// TODO update outdated doc

Idea here is
  1. centralize financial formulas instead of inlining them elsewhere, especially to ensure formula correctness
  2. use domain-specific types like `Ether` instead of BigNumber, to help ensure formula correctness

Long term vision might be to split into two separate libraries:
  1. domain-specific types for reuse in other projects
  2. augur-math library for use in other Augur projects

For domain-specific types like `Ether`, we'd prefer compile-time type safety, but
settle for runtime checks. https://github.com/jscheiny/safe-units is an excellent
project that provides compile-time type safety and could be extended to include Ether,
but unfortunately is impractical due to increasing project build time by _minutes_.
*/

type Dimension = "tokens" | "shares";
const Dimensions: Array<Dimension> = ["tokens", "shares"];

type DimensionVector = {
  [k in Dimension]: number;
};

function isEqual(a: DimensionVector, b: DimensionVector): boolean {
  for (const d of Dimensions) {
    if (a[d] !== b[d]) {
      return false;
    }
  }
  return true;
}

abstract class Quantity<T extends Quantity<T>> {
  // TODO an idea is to carry a history of dimension changes through operations so that when a dynamic dimension/type check fails, can give an explanation of where it came from
  public readonly magnitude: BigNumber;
  public readonly dimension: DimensionVector;
  public readonly derivedConstructor: QuantityConstructor<T>;
  protected constructor(derivedConstructor: QuantityConstructor<T>, magnitude: BigNumber, dimension: DimensionVector) {
    // TODO allow magnitude to be a number for convenience
    this.derivedConstructor = derivedConstructor;
    this.magnitude = magnitude;
    this.dimension = dimension;
  }
  public multipliedBy(other: Percent): T;
  public multipliedBy(other: Scalar): T extends (Percent) ? Scalar : T;
  public multipliedBy<B extends Quantity<B>>(other: B): T extends (Scalar | Percent) ? B : UnverifiedQuantity;
  public multipliedBy<B extends Quantity<B>>(other: B): B | T | UnverifiedQuantity {
    const newMagnitude = this.magnitude.multipliedBy(other.magnitude);
    // TODO doc lack of symmtery between Scalar/Percent is why we need these special cases. Scalar is stronger than Percent because Scalar*Percent=Scalar
    if (this instanceof Scalar && other instanceof Percent) {
      return new this.derivedConstructor(newMagnitude);
    }
    if (other instanceof Scalar && this instanceof Percent) {
      return new other.derivedConstructor(newMagnitude);
    }
    if (this instanceof Scalar || this instanceof Percent) {
      return new other.derivedConstructor(newMagnitude);
    }
    if (other instanceof Scalar || other instanceof Percent) {
      return new this.derivedConstructor(newMagnitude);
    }
    const c = Object.assign({}, this.dimension);
    Dimensions.forEach((u) => c[u] += other.dimension[u]);
    return new UnverifiedQuantity(newMagnitude, c);
  }
  public plus<B extends Quantity<B>>(other: B): T {
    if (!isEqual(this.dimension, other.dimension)) {
      throw new Error(`plus failed: expected dimensions to be equal, this=${this}, other=${other}`);
    }
    const newMagnitude = this.magnitude.plus(other.magnitude);
    return new this.derivedConstructor(newMagnitude);
  }
}

interface QuantityConstructor<T extends Quantity<T>> {
  new(magnitude: BigNumber): T;
}

interface VerifiableQuantity<T extends Quantity<T>> extends QuantityConstructor<T> {
  sentinel: T;
  isValidMagnitude?(magnitude: BigNumber): undefined | Error; // TODO doc
}

class UnverifiedQuantity extends Quantity<UnverifiedQuantity> {
  constructor(magnitude: BigNumber, dimension: DimensionVector) {
    class Copy extends UnverifiedQuantity {
      constructor(magnitude: BigNumber) {
        super(magnitude, dimension);
      }
    }
    super(Copy, magnitude, dimension);
  }
  // TODO consider renaming verify() to is() or shouldBe() or isIn()
  public verify<T extends Quantity<T>>(vu: VerifiableQuantity<T>): T {
    if (!isEqual(vu.sentinel.dimension, this.dimension)) {
      throw new Error(`verify failed: dimensions not equal, expected=${vu}, actual=${this}`);
    }
    if (vu.isValidMagnitude !== undefined) {
      const maybeErr = vu.isValidMagnitude(this.magnitude);
      if (maybeErr !== undefined) {
        // TODO wrap maybeErr with dimension context
        throw maybeErr;
      }
    }
    return new vu(this.magnitude);
  }
}

export class Scalar extends Quantity<Scalar> {
  public static sentinel: Scalar = new Scalar(ZERO);
  protected static readonly unitDimension: DimensionVector = {
    tokens: 0,
    shares: 0,
  };
  public scalar: true; // this unique field makes this unit disjoint with other units so that you can't `a: Tokens = new Scalar()`
  constructor(magnitude: BigNumber) {
    super(Scalar, magnitude, Scalar.unitDimension);
  }
}

export class Percent extends Quantity<Percent> {
  public static sentinel: Percent = new Percent(ZERO);
  public static isValidMagnitude(magnitude: BigNumber): undefined | Error {
    if (magnitude.isLessThan(ZERO) || magnitude.isGreaterThan(ZERO)) {
      return new Error(`expected Percent to be between 0 and 1.0, actual: ${magnitude}`);
    }
    return;
  }
  protected static readonly unitDimension: DimensionVector = {
    tokens: 0,
    shares: 0,
  };
  public percent: true; // this unique field makes this unit disjoint with other units so that you can't `a: Tokens = new Percent2()`
  constructor(magnitude: BigNumber) {
    super(Percent, magnitude, Percent.unitDimension);
  }
}

class Tokens extends Quantity<Tokens> {
  public static sentinel: Tokens = new Tokens(ZERO);
  protected static readonly unitDimension: DimensionVector = {
    tokens: 1,
    shares: 0,
  };
  public tokens: true; // this unique field makes this unit disjoint with other units so that you can't `a: Tokens = new Scalar()`
  constructor(magnitude: BigNumber) {
    super(Tokens, magnitude, Tokens.unitDimension);
  }
}

class Shares extends Quantity<Shares> {
  public static sentinel: Shares = new Shares(ZERO);
  protected static readonly unitDimension: DimensionVector = {
    tokens: 0,
    shares: 1,
  };
  public shares: true; // this unique field makes this unit disjoint with other units so that you can't `a: Shares = new Scalar()`
  constructor(magnitude: BigNumber) {
    super(Shares, magnitude, Shares.unitDimension);
  }
}

// ****************************************************************
// tests/scratch below here

const t = new Tokens(ZERO);
const t2 = new Tokens(new BigNumber(3));
const t3: Tokens = t.plus(t2);
const s = new Scalar(ZERO);
const p = new Percent(ZERO);

// TODO these need unit tests too to check for stuff like `v5.tokens == "tokens"`
const v5: Tokens = t.multipliedBy(s);
const v6: Tokens = s.multipliedBy(t);
const v7: UnverifiedQuantity = t.multipliedBy(t);
const v8: Scalar = s.multipliedBy(s);

const v111: Percent = p.multipliedBy(p);
const v112: Scalar = s.multipliedBy(p);
const v113: Scalar = p.multipliedBy(s);
const v114: Tokens = p.multipliedBy(t);
const v115: Tokens = t.multipliedBy(p);

const uq2 = new UnverifiedQuantity(ONE, {
  tokens: 1,
  shares: 0,
});

const t8: Tokens = uq2.verify(Tokens);
