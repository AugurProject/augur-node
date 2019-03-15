import { BigNumber } from "bignumber.js";

const ZERO = new BigNumber(0);
const ONE = new BigNumber(1);

// TODO toString() method "20 tokens", "20 tokens/share", "20 tokens^2*shares^-3"
// TODO <BigNumberType>
// TODO ETH/attoETH/erc20
// TODO can this be assemblyscript?
// TODO support derivation for non-unit quantity types, similar to safe-units. Eg. `export const Price = Tokens.dividedBy(Shares)`
// TODO can we create something like NonNegative<T extends Quantity<T>> and use isValidMagnitude?

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
  // TODO can we implement a fair bit of BigNumber interface so that this is mostly a drop-in replacement?
  // TODO an idea is to carry a history of dimension changes through operations so that when a dynamic dimension/type check fails, can give an explanation of where it came from
  public readonly derivedConstructor: QuantityConstructor<T>;
  public readonly magnitude: BigNumber;
  public readonly dimension: DimensionVector;
  public readonly sign: -1 | 1;
  protected constructor(derivedConstructor: QuantityConstructor<T>, magnitude: BigNumber, dimension: DimensionVector) {
    // TODO allow magnitude to be a number for convenience
    this.derivedConstructor = derivedConstructor;
    this.magnitude = magnitude;
    this.dimension = dimension;
    if (magnitude.s === -1) {
      this.sign = -1;
    } else if (magnitude.s === 1) {
      this.sign = 1;
    } else {
      throw new Error(`expected BigNumber.s to be -1 or 1, was ${this.magnitude.s}`);
    }
  }
  public multipliedBy(other: Percent): T;
  public multipliedBy(other: Scalar): T extends (Percent) ? Scalar : T;
  public multipliedBy<B extends Quantity<B>>(other: B): T extends (Scalar | Percent) ? B : UnverifiedQuantity;
  public multipliedBy<B extends Quantity<B>>(other: B): B | T | UnverifiedQuantity {
    const newMagnitude = this.magnitude.multipliedBy(other.magnitude);
    // TODO doc lack of symmtery between Scalar/Percent is why we need these special cases. Scalar is stronger than Percent because Scalar*Percent=Scalar
    // UPDATE - TODO maybe this should be opposite: Scalar*Percent=Percent
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
    const newDimension = Object.assign({}, this.dimension);
    Dimensions.forEach((u) => newDimension[u] += other.dimension[u]);
    return new UnverifiedQuantity(newMagnitude, newDimension);
  }
  public dividedBy(other: Percent): T;
  public dividedBy(other: Scalar): T extends (Percent) ? Scalar : T;
  public dividedBy<B extends Quantity<B>>(other: B): T extends (Scalar | Percent) ? B : UnverifiedQuantity;
  public dividedBy<B extends Quantity<B>>(other: B): B | T | UnverifiedQuantity {
    const newMagnitude = this.magnitude.dividedBy(other.magnitude);
    // TODO doc lack of symmtery between Scalar/Percent is why we need these special cases. Scalar is stronger than Percent because Scalar*Percent=Scalar
    // UPDATE - TODO maybe this should be opposite: Scalar*Percent=Percent
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
    const newDimension = Object.assign({}, this.dimension);
    Dimensions.forEach((u) => newDimension[u] -= other.dimension[u]);
    return new UnverifiedQuantity(newMagnitude, newDimension);
  }
  public plus<B extends Quantity<B>>(other: B): T {
    if (!isEqual(this.dimension, other.dimension)) {
      throw new Error(`plus failed: expected dimensions to be equal, this=${this}, other=${other}`);
    }
    const newMagnitude = this.magnitude.plus(other.magnitude);
    return new this.derivedConstructor(newMagnitude);
  }
  public minus<B extends Quantity<B>>(other: B): T {
    if (!isEqual(this.dimension, other.dimension)) {
      throw new Error(`minus failed: expected dimensions to be equal, this=${this}, other=${other}`);
    }
    const newMagnitude = this.magnitude.minus(other.magnitude);
    return new this.derivedConstructor(newMagnitude);
  }
  public isZero(): boolean {
    return this.magnitude.isZero();
  }
  public lt<B extends Quantity<B>>(other: B): boolean {
    if (!isEqual(this.dimension, other.dimension)) {
      throw new Error(`lt failed: expected dimensions to be equal, this=${this}, other=${other}`);
    }
    return this.magnitude.lt(other.magnitude);
  }
  public gt<B extends Quantity<B>>(other: B): boolean {
    if (!isEqual(this.dimension, other.dimension)) {
      throw new Error(`gt failed: expected dimensions to be equal, this=${this}, other=${other}`);
    }
    return this.magnitude.gt(other.magnitude);
  }
  public abs(): T {
    return new this.derivedConstructor(this.magnitude.abs());
  }
  // TODO generalized min(array)
  public min<B extends Quantity<B>>(other: B): T {
    if (!isEqual(this.dimension, other.dimension)) {
      throw new Error(`min failed: expected dimensions to be equal, this=${this}, other=${other}`);
    }
    return new this.derivedConstructor(BigNumber.min(this.magnitude, other.magnitude));
  }

  // TODO there is a general pattern among some functions eg. plus/minus/min: ensure dimensions equal and then return derivedConstructor(some new magnitude); can probably simplify this code and it'd be worth it once more functions are added
}

interface QuantityConstructor<T extends Quantity<T>> {
  new(magnitude: BigNumber): T;
}

interface VerifiableQuantity<T extends Quantity<T>> extends QuantityConstructor<T> {
  ZERO: T;
  isValidMagnitude?(magnitude: BigNumber): undefined | Error; // TODO doc
}

// TODO the name UnverifiedQuantity shows up when a user fails to expect(); it could probably be named something more instructive, like NeedToExpectQuantity
// `Type 'UnverifiedQuantity' is not assignable to type 'Tokens'. Property 'tokens' is missing in type 'UnverifiedQuantity'.`
class UnverifiedQuantity extends Quantity<UnverifiedQuantity> {
  constructor(magnitude: BigNumber, dimension: DimensionVector) {
    class Copy extends UnverifiedQuantity {
      constructor(magnitude: BigNumber) {
        super(magnitude, dimension);
      }
    }
    super(Copy, magnitude, dimension);
  }
  /*
  TODO an expect failure currently looks like
  ```
    Error: expect failed: dimensions not equal, expected=class Tokens extends Quantity {
    constructor(magnitude) {
        super(Tokens, magnitude, TokensUnitDimension);
    }
  }, actual=[object Object]
    at UnverifiedQuantity.expect (/Users/ryanandlyndsey/projects/augur-node/src/utils/dimension-quantity.ts:153:13)
    at Object.<anonymous> (/Users/ryanandlyndsey/projects/augur-node/src/blockchain/log-processors/profit-loss/update-profit-loss.ts:176:73)
    at Generator.next (<anonymous>)
    at fulfilled (/Users/ryanandlyndsey/projects/augur-node/src/blockchain/log-processors/profit-loss/update-profit-loss.ts:4:58)
    at <anonymous>
  ```
    instead it should look something like
      "expect failed: dimensions not equal, expected Price and got Shares"
      "expect failed: dimensions not equal, expected Price and got { tokens: 1, shares: -5 }"
  */
  public expect<T extends Quantity<T>>(vq: VerifiableQuantity<T>): T {
    if (!isEqual(vq.ZERO.dimension, this.dimension)) {
      throw new Error(`expect failed: dimensions not equal, expected=${vq}, actual=${this}`);
    }
    if (vq.isValidMagnitude !== undefined) {
      const maybeErr = vq.isValidMagnitude(this.magnitude);
      if (maybeErr !== undefined) {
        // TODO wrap maybeErr with dimension context
        throw maybeErr;
      }
    }
    return new vq(this.magnitude);
  }
}

// ************************************************************************
// **** specific units below here; a lot of this could be generated code

export function scalar(magnitude: number | BigNumber): Scalar {
  if (typeof magnitude === "number") {
    return new Scalar(new BigNumber(magnitude));
  }
  return new Scalar(magnitude);
}
const ScalarUnitDimension: DimensionVector = Object.freeze({
  tokens: 0,
  shares: 0,
});
export class Scalar extends Quantity<Scalar> {
  public static ZERO: Scalar = new Scalar(ZERO);
  public scalar: true; // this unique field makes this unit disjoint with other units so that you can't `a: Tokens = new Scalar()`
  constructor(magnitude: BigNumber) {
    super(Scalar, magnitude, ScalarUnitDimension);
  }
}

export function percent(magnitude: number | BigNumber): Percent {
  if (typeof magnitude === "number") {
    return new Percent(new BigNumber(magnitude));
  }
  return new Percent(magnitude);
}
export class Percent extends Quantity<Percent> {
  public static ZERO: Percent = new Percent(ZERO);
  public percent: true; // this unique field makes this unit disjoint with other units so that you can't `a: Tokens = new Percent2()`
  constructor(magnitude: BigNumber) {
    super(Percent, magnitude, ScalarUnitDimension);
  }
}

export function tokens(magnitude: number | BigNumber): Tokens {
  if (typeof magnitude === "number") {
    return new Tokens(new BigNumber(magnitude));
  }
  return new Tokens(magnitude);
}
const TokensUnitDimension: DimensionVector = Object.freeze({
  tokens: 1,
  shares: 0,
});
export class Tokens extends Quantity<Tokens> {
  public static ZERO: Tokens = new Tokens(ZERO);
  public tokens: true; // this unique field makes this unit disjoint with other units so that you can't `a: Tokens = new Scalar()`
  constructor(magnitude: BigNumber) {
    super(Tokens, magnitude, TokensUnitDimension);
  }
}

export function shares(magnitude: number | BigNumber): Shares {
  if (typeof magnitude === "number") {
    return new Shares(new BigNumber(magnitude));
  }
  return new Shares(magnitude);
}
const SharesUnitDimension: DimensionVector = Object.freeze({
  tokens: 0,
  shares: 1,
});
export class Shares extends Quantity<Shares> {
  public static ZERO: Shares = new Shares(ZERO);
  public shares: true; // this unique field makes this unit disjoint with other units so that you can't `a: Shares = new Scalar()`
  constructor(magnitude: BigNumber) {
    super(Shares, magnitude, SharesUnitDimension);
  }
}

export function price(magnitude: number | BigNumber): Price {
  if (typeof magnitude === "number") {
    return new Price(new BigNumber(magnitude));
  }
  return new Price(magnitude);
}
const PriceUnitDimension: DimensionVector = Object.freeze({
  tokens: 1,
  shares: -1,
});
export class Price extends Quantity<Price> {
  public static ZERO: Price = new Price(ZERO);
  public price: true; // this unique field makes this unit disjoint with other units so that you can't `a: Price = new Scalar()`
  constructor(magnitude: BigNumber) {
    super(Price, magnitude, PriceUnitDimension);
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
const v112: Scalar = s.multipliedBy(p); // TODO : Percent instead?
const v113: Scalar = p.multipliedBy(s); // TODO : Percent instead?
const v114: Tokens = p.multipliedBy(t);
const v115: Tokens = t.multipliedBy(p);

const uq2 = new UnverifiedQuantity(ONE, {
  tokens: 1,
  shares: 0,
});

const t8: Tokens = uq2.expect(Tokens);

const pr: Price = new UnverifiedQuantity(ONE, {
  tokens: 1,
  shares: -1,
}).expect(Price);

const shouldBePrice: Price = t.dividedBy(new Shares(ONE)).expect(Price);
