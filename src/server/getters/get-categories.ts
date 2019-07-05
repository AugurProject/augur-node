import Augur from "augur.js";
import BigNumber from "bignumber.js";
import * as t from "io-ts";
import * as Knex from "knex";
import { ZERO } from "../../constants";
import { Address, ReportingState, TagAggregation, UICategory } from "../../types";
import { getMarkets, GetMarketsParams } from "./get-markets";
import { MAX_SPREAD_PERCENT } from "../../utils/liquidity";

export const CategoriesParams = t.type({
  universe: t.string,
});

interface MarketsTagRow {
  marketId: string;
  category: string;
  openInterest: BigNumber;
  liquidityTokens: BigNumber;
  reportingState: ReportingState;
  tag1: string;
  tag2: string;
}

export async function getMarketsTagRows(db: Knex, universe: string, spreadPercent: number): Promise<Array<MarketsTagRow>> {
  return db.select([
    "markets.marketId as marketId",
    "markets.category as category",
    "markets.openInterest as openInterest",
    "markets.tag1 as tag1",
    "markets.tag2 as tag2",
    "market_state.reportingState as reportingState",
  ]).from("markets")
    .leftJoin("market_state", "markets.marketStateId", "market_state.marketStateId")
    .innerJoin("markets_liquidity", function() {
      this.on("markets.marketId", "markets_liquidity.marketId")
        .andOn("markets_liquidity.spreadPercent", db.raw("?", spreadPercent));
    }).select("liquidityTokens")
    .where({ universe });
}

function uiCategoryBigNumberToString(uiCat: UICategory<BigNumber>): UICategory<string> {
  return {
    ...uiCat,
    nonFinalizedOpenInterest: uiCat.nonFinalizedOpenInterest.toString(),
    openInterest: uiCat.openInterest.toString(),
    liquidityTokens: uiCat.liquidityTokens.toString(),
    tags: uiCat.tags.map((ta) => {
      return {
        ...ta,
        nonFinalizedOpenInterest: ta.nonFinalizedOpenInterest.toString(),
        openInterest: ta.openInterest.toString(),
        liquidityTokens: ta.liquidityTokens.toString(),
      };
    }),
  };
}

function buildUICategories(marketsTagRows: Array<MarketsTagRow>, marketIdWhitelist: Array<Address>): Array<UICategory<BigNumber>> {
  function upsertTagAggregation(r: MarketsTagRow, tagAggregationByTagName: Map<string, TagAggregation<BigNumber>>, tagProp: "tag1" | "tag2"): void {
    if (!r[tagProp]) {
      return;
    }
    let tagAggregation: TagAggregation<BigNumber> | undefined = tagAggregationByTagName.get(r[tagProp]);
    if (tagAggregation === undefined) {
      tagAggregation = {
        nonFinalizedOpenInterest: ZERO,
        openInterest: ZERO,
        liquidityTokens: ZERO,
        tagName: r[tagProp],
        numberOfMarketsWithThisTag: 0,
      };
      tagAggregationByTagName.set(r[tagProp], tagAggregation);
    }
    if (r.reportingState !== ReportingState.FINALIZED) {
      tagAggregation.nonFinalizedOpenInterest = tagAggregation.nonFinalizedOpenInterest.plus(r.openInterest);
    }
    tagAggregation.openInterest = tagAggregation.openInterest.plus(r.openInterest);
    tagAggregation.liquidityTokens = tagAggregation.liquidityTokens.plus(r.liquidityTokens);
    tagAggregation.numberOfMarketsWithThisTag += 1;
  }

  const marketIdWhitelistSet = new Set(marketIdWhitelist);

  const tagAggregationByTagNameByCategoryName: Map<string, Map<string, TagAggregation<BigNumber>>> = new Map(); // there'll be a parent-child relationship where TagAggregation is the child and category is the parent. Tags aren't aggregated across categories. If two markets share a tag, but have different categories, that tag will build into two different TagAggregations, one for each category.

  const uiCategoryByCategoryName: Map<string, UICategory<BigNumber>> = new Map();

  marketsTagRows.filter((r) => marketIdWhitelistSet.has(r.marketId)).forEach((r: MarketsTagRow) => {
    // 1. build TagAggregations scoped by category; they will each later be assigned as uiCategory.tags
    let tagAggregationByTagName: Map<string, TagAggregation<BigNumber>> | undefined = tagAggregationByTagNameByCategoryName.get(r.category);
    if (tagAggregationByTagName === undefined) {
      tagAggregationByTagName = new Map();
      tagAggregationByTagNameByCategoryName.set(r.category, tagAggregationByTagName);
    }
    upsertTagAggregation(r, tagAggregationByTagName, "tag1");
    upsertTagAggregation(r, tagAggregationByTagName, "tag2");

    // 2. build UICategories to return, but they don't yet have tags assigned
    let uiCat = uiCategoryByCategoryName.get(r.category);
    if (uiCat === undefined) {
      uiCat = {
        categoryName: r.category,
        tags: [], // will be assigned later
        nonFinalizedOpenInterest: ZERO,
        openInterest: ZERO,
        liquidityTokens: ZERO,
      };
      uiCategoryByCategoryName.set(r.category, uiCat);
    }

    if (r.reportingState !== ReportingState.FINALIZED) {
      uiCat.nonFinalizedOpenInterest = uiCat.nonFinalizedOpenInterest.plus(r.openInterest);
    }
    uiCat.openInterest = uiCat.openInterest.plus(r.openInterest);
    uiCat.liquidityTokens = uiCat.liquidityTokens.plus(r.liquidityTokens);
  });

  // 3. assign tags to categories now that both are fully built
  tagAggregationByTagNameByCategoryName.forEach((tagAggregationByTagName, categoryName) => {
    const uiCat = uiCategoryByCategoryName.get(categoryName);
    if (uiCat !== undefined) {
      uiCat.tags = Array.from(tagAggregationByTagName.values());
    }
  });

  const uiCategories = Array.from(uiCategoryByCategoryName.values());
  return uiCategories;
}

export async function getCategories(db: Knex, augur: Augur, params: t.TypeOf<typeof GetMarketsParams>): Promise<Array<UICategory<string>>> {
  const universeInfo = await db.first(["universe"]).from("universes").where({ universe: params.universe });
  if (universeInfo === undefined) throw new Error(`Universe ${params.universe} does not exist`);

  const p1: Promise<Array<MarketsTagRow>> = getMarketsTagRows(db, params.universe, params.liquiditySortSpreadPercent || MAX_SPREAD_PERCENT);
  const p2: Promise<Array<Address>> = getMarkets(db, augur, {
    ...params,
    limit: undefined,
    offset: undefined,
  });
  const ts: Array<MarketsTagRow> = await p1;
  const mids: Array<Address> = await p2;

  const uiCategories = buildUICategories(ts, mids).map(uiCategoryBigNumberToString);
  return uiCategories;
}
