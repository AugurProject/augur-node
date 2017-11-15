import * as Knex from "knex";

exports.up = async (knex: Knex): Promise<any> => {
  return knex.schema.dropTableIfExists("reporting_windows").then( (): PromiseLike<any> => {
    return knex.schema.createTable("reporting_windows", (table: Knex.CreateTableBuilder): void => {
      table.string("reportingWindow", 42).primary().notNullable();
      table.integer("fees");
    });
  });
};

exports.down = async (knex: Knex): Promise<any> => {
  return knex.schema.dropTableIfExists("reporting_windows");
};
