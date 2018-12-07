import * as t from "io-ts";
import * as Knex from "knex";
import * as _ from "lodash";
import Augur from "augur.js";
import { groupByAndSum } from "./database";

export const CategoriesParams = t.type({
  universe: t.string,
});

// TODO move to types.ts
// OpenInterestAggregation is an aggregation of various types of open interest
// for markets within some particular context. Eg. all markets within a category.
export interface OpenInterestAggregation<BigNumberType> {
  nonFinalizedOpenInterest: BigNumberType; // sum of open interest for non-finalized markets in this aggregation (ie. markets with ReportingState != FINALIZED)
  openInterest: BigNumberType; // sum of open interest for all markets in this aggregation
}

// TODO move to types.ts
export interface UICategory<BigNumberType> extends OpenInterestAggregation<BigNumberType> {
  categoryName: string;
  tags: Array<TagAggregation<BigNumberType>>;
}

// TODO move to types.ts
// TagAggregation is an aggregation of tag statistics/data for a set of
// markets within some particular context, eg. all markets in a category.
export interface TagAggregation<BigNumberType> extends OpenInterestAggregation<BigNumberType> {
  tagName: string;
  numberOfMarketsWithThisTag: number;
}

interface TagRow {
  category: string;
  tag1: string;
  tag2: string;
}

export interface CategoryPopularity {
  category: string;
  popularity: string;
}

async function getCategoriesPopularity(db: Knex, universe: string): Promise<Array<CategoryPopularity>> {
  const categoriesInfo = await db.select(["category", "popularity"]).from("categories").where({ universe }).orderBy("popularity", "desc");
  // Group categories by upper case in case DB has not been fully sync'd with upper casing code. This can be removed once DB version > 2
  const upperCaseCategoryInfo = categoriesInfo.map((category: CategoryPopularity): CategoryPopularity => {
    return {
      category: category.category.toUpperCase(),
      popularity: category.popularity,
    };
  });
  const groupedCategoryInfo = groupByAndSum(upperCaseCategoryInfo, ["category"], ["popularity"]);
  return groupedCategoryInfo.map((categoryInfo: CategoryPopularity): CategoryPopularity => ({ popularity: categoryInfo.popularity.toString(), category: categoryInfo.category }));
}

// function convertTagsToArray(tagRows: Array<TagRow>): TagCount {
//   return _.chain(tagRows).map((t) => [(t.tag1 || "").toUpperCase(), (t.tag2 || "").toUpperCase()])
//     .flatten()
//     .filter((tag) => tag !== "")
//     .countBy()
//     .value();
// }

// s/getTagsForCategory ?
// async function getTagsCountByCategory(db: Knex, universe: string): Promise<{ [category: string]: TagCount }> {
//   const tagsRows: Array<TagRow> = await db.select(["tag1", "tag2", "category"]).from("markets").where({ universe });
//   return _.chain(tagsRows)
//     // is this `groupBy(...): Map<category, [tag1, tag2, category]>` and incorrectly treat the categories as tags? --> no, because the input is an object and the keys tag1/tag2 are extracted in convertTagsToArray(), discarding the category
//     .groupBy((tagRow) => tagRow.category.toUpperCase())
//     .mapValues(convertTagsToArray)
//     .value();
// }

// TODO post-condition: categories.map(_.category.toUpperCase()).unique.length == categories.length --> ie. everything is uppercased (or titled cased)
export async function getCategories(db: Knex, augur: Augur, params: t.TypeOf<typeof CategoriesParams>): Promise<Array<UICategory<string>>> { // we use UICategory<string> to be consistent with the pre-existing UIMarketInfo<string> in get-markets.ts
  const universeInfo = await db.first(["universe"]).from("universes").where({ universe: params.universe });
  if (universeInfo === undefined) throw new Error(`Universe ${params.universe} does not exist`);
  // const tagCountByCategory = await getTagsCountByCategory(db, params.universe);
  // const categoriesResponse = await getCategoriesPopularity(db, params.universe);
  return Promise.resolve([
    {
      categoryName: "foo",
      nonFinalizedOpenInterest: "39383",
      openInterest: "123",
      tags: [
        {
          tagName: "england",
          numberOfMarketsWithThisTag: 17,
          nonFinalizedOpenInterest: "8837",
          openInterest: "123",
        },
        {
          tagName: "beer",
          numberOfMarketsWithThisTag: 1,
          nonFinalizedOpenInterest: "7",
          openInterest: "123",
        },
        {
          tagName: "football",
          numberOfMarketsWithThisTag: 1,
          nonFinalizedOpenInterest: "123",
          openInterest: "123",
        },
      ],
    },
    {
      categoryName: "no tags romg",
      nonFinalizedOpenInterest: "37",
      openInterest: "123",
      tags: [],
    },
    {
      categoryName: "bar",
      nonFinalizedOpenInterest: "13370023",
      openInterest: "123",
      tags: [
        {
          tagName: "videogames",
          numberOfMarketsWithThisTag: 23,
          nonFinalizedOpenInterest: "0",
          openInterest: "123",
        },
        {
          tagName: "league of legends",
          numberOfMarketsWithThisTag: 12,
          nonFinalizedOpenInterest: "1",
          openInterest: "123",
        },
        {
          tagName: "path of exile",
          numberOfMarketsWithThisTag: 12,
          nonFinalizedOpenInterest: "1337",
          openInterest: "123",
        },
      ],
    },
  ]);
  // return _.map(categoriesResponse, (categoryResponse) => {
  //   const category = categoryResponse.category;
  //   return Object.assign(
  //     { tags: tagCountByCategory[category] || [] },
  //     categoryResponse,
  //   );
  // });
}
