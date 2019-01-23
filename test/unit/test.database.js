const environments = require("knexfile.js");
const Knex = require("knex");
const { postProcessDatabaseResults } = require("src/server/post-process-database-results");
const { processBatchOfLogs } = require("src/blockchain/download-augur-logs");
const Augur = require("augur.js");
const uuid = require("uuid");
const deepmerge = require("deepmerge");
const _ = require("lodash");


function hexify(integer) {
  return "0x" + (integer).toString(16);
}

function getEnv() {
  return Object.assign({}, environments.test, {
    postProcessResponse: postProcessDatabaseResults,
  });
}

function required(args, ...params) {
  args = Object.keys(args);
  const requiredButNotProvided = _.difference(params, args);
  if (requiredButNotProvided.length > 0) {
    throw Error(`Required params were not provided: ${requiredButNotProvided}`);
  }
}

async function seedDb(db) {
  const env = getEnv();
  await db.seed.run(env.seeds);
  return db;
}

async function dumpTable(db, tableName) {
  const rows = await db.from(tableName).select("*");
  console.log(`##### ${tableName} #####\n${JSON.stringify(rows, null, 2)}`);
}

async function dumpTables(db, ...tableNames) {
  for (let i = 0; i < tableNames.length; i++) {
    const tableName = tableNames[i];
    await dumpTable(db, tableName);
  }
}

function makeFakeBlock(number, overrides) {
  return deepmerge({
    difficulty: "0x2",
    extraData: "0xd78301080d846765746887676f312e392e32856c696e757800000000000000006d6799e08b3c1c0f3e73ae84fc3effb6c351b8fc120567d543375ec77ed4bd3f1ab5f2192429c3d56be87e10e4fa46e8f51a0a472b155c62f60d3846ca218fdb01",
    gasLimit: "0x733d84",
    gasUsed: "0x307958",
    hash: uuid.v4(),
    logsBloom: "0x00400000020040080000000000000000000000000000008000000400000000400000000001002002000000000004000000400020c00000400020000000000002000000004020000000000008000000000000000000000004000008000000000001000000025000800040000028800840100005000000600000000210000000020020000000000000080000000000000140000000000000000040000000000000000480000000000048400000000000000000000000000000000410008000000000000002000008000000000000000400000000082008000000000000014021002000000004000400010020000000040022000000000000000800000000040120",
    miner: "0x0000000000000000000000000000000000000000",
    mixHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
    nonce: "0x0000000000000000",
    number: hexify(number),
    timestamp: hexify(number),
    parentHash: "0xb23952935adf39ec4198575fb16cdffe54be970fba0e264eb900896dcae7e2b0",
    receiptsRoot: "0x54f1a38f3fde228e85dab1f53f31be6eeb06391cc98ff7110819adf0907bfd92",
    sha3Uncles: "0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347",
    size: "0x12ce",
    stateRoot: "0x840d89f25125ecbc0c308be4ec99376be568fead2a791907b3493ea0810e4e21",
    totalDifficulty: "0x4d903e",
    transactions: [
      "0xef88f2cef652f5005348ff99c68c0152e2dda275753fe1cfc50f912f24d8aabf",
      "0x5e7013fdcdcf6da910a30c69ca2545e1ab840e724f0d45c13be44bc1d13bca38",
      "0xec40460e77d3e8d1524e2f0cca34cd1235f6cf2d0f8e2669bf7dd1454f59a89a",
      "0xf6a187a2f690e214c81d549ca7fb581e36633de81746eeb72d66d2ac961e924a",
      "0x3c6c8b4dd0f9738f1eca9f398f834007fc112b7134c861d5763f6143c4b06bc2",
      "0xe09c5e91c11ca80626c4bb2767469f3b5bfd62fa061e0cf21af55b977d638fba",
      "0x653a76c8e360484840093e0c53f397bf2f2cb1e4a0e9b1e82c3207a91255377a",
      "0x3c582338674000169bef47f43dd65190418e395a4b9e13108a5c74f99bdfff49",
      "0x5a3ba6d658a61d06d2efc2e6a4cdc17e89b789d03d92c9ac2be78cdf16118c6f",
      "0x5b27bf1f9bdd7afe7b76a59305b1674b2d65294d7bb075a259dfc838357f26d9",
    ],
    transactionsRoot: "0x2ad5b79ead3919e9a7ab6cdc9aa4034ef9d1b147ea5deefec90c2b8a9e2f5eaa",
    uncles: [],
  }, overrides || {});
}

function makeLogFactory(universe) {
  const state = {
    nextBlockNumber: 1,
    blockNumbers: [],
  };

  function buildLog(defaults, overrides) {
    const log = Object.assign({
      transactionHash: uuid.v4(),
      transactionIndex: 0,
      logIndex: 0,
      blockNumber: state.nextBlockNumber++,
      blockHash: uuid.v4(),
      removed: false,
      invalid: false,
      address: "AUGUR_CONTRACT",
      contractName: "Augur",
    }, defaults || {}, overrides || {});
    state.blockNumbers.push(log.blockNumber);
    return log;
  }

  return Object.assign({}, {
    getBlockDetails: () => {
      const blocks = _.map(state.blockNumbers, makeFakeBlock);
      return _.zipObject(state.blockNumbers, blocks);
    },

    UniverseCreated: args => {
      return buildLog({
        eventName: "UniverseCreated",
        parentUniverse: null,  // leave null for root universe
        childUniverse: universe,  // the universe you're creating
        payoutNumerators: [],
      }, args);
    },
    UniverseForked: args => {
      required(args, "universe");  // forking tests should be explicit about their universes
      return buildLog({
        eventName: "UniverseForked",
        universe,
      }, args);
    },
    TokensMinted: args => {
      required(args, "token", "target", "amount", "market");
      return buildLog({
        eventName: "TokensMinted",
        universe,
      }, args);
    },
    FeeWindowCreated: args => {
      required(args, "id", "feeWindow", "startTime", "endTime");
      return Object.assign(buildLog({
        eventName: "FeeWindowCreated",
        universe,
      }, args));
    },
    TokensTransferred: args => {
      required(args, "token", "from", "to", "value", "market");
      return buildLog({
        eventName: "TokensTransferred",
        universe,
      }, args);
    },
    MarketCreated: args => {
      required(args, "market", "marketCreator");
      return buildLog({
        eventName: "MarketCreated",
        universe,
        topic: uuid.v4(),
        description: uuid.v4(),
        extraInfo: {
          resolutionSource: "",
          tags: [],
        },
        marketCreationFee: "0.01",  // how much is extracted from trades as market creator
        minPrice: "0",
        maxPrice: "1",
        // See constants.ts/MarketType enum for details.
        // 0 -> yesNo aka binary
        // 1 -> categorical aka 3-8 outcomes. Log must include "outcomes".
        marketType: "0",
        outcomes: [],  // if marketType=1 then this must be specified
      }, args);
    },
    OrderCreated: args => {
      required(
        args,
        "shareToken",
        "amount",
        "price",
        "creator",
        "moneyEscrowed",
        "sharesEscrowed",
        "tradeGroupId",
      );
      return buildLog({
        eventName: "OrderCreated",
        universe,
        orderType: "0",
        orderId: uuid.v4(),
      }, args);
    },
  });
}

function makeMockAugur(additional) {
  const augur = new Augur();
  augur.api = {
    Universe: {
      getReputationToken: () => "REP_TOKEN",
      getOrCacheReportingFeeDivisor: () => 1,
    },
    Market: {
      getFeeWindow: () => "FEE_WINDOW",
      getEndTime: () => 592903560,
      getDesignatedReporter: () => "DESIGNATED_REPORTER",
      getMarketCreatorMailbox: () => "MARKET_CREATOR_MAILBOX",
      getNumTicks: () => 42,
      getMarketCreatorSettlementFeeDivisor: () => 0.01,
      getValidityBondAttoeth: () => "47",  // must be a number
      getShareToken: args => Promise.resolve(`SHARE_TOKEN_${args._outcome}`),
    },
  };
  augur.rpc = {
    getNetworkID: () => "9090",
  };
  augur.contracts = {
    addresses: {
      9090: {
      },
    },
  };

  return deepmerge(augur, additional || {});
}

function setupTestDb(augur, logs, blockDetails) {
  augur = augur || new Augur();
  logs = logs || [];
  blockDetails = blockDetails || {};

  const env = getEnv();
  const db = Knex(env);
  return db.migrate.latest(env.migrations)
    .then(() => {
      const blockNumbers =_(blockDetails).keys().map(Number).sortBy().value();
      return processBatchOfLogs(db, augur, logs, blockNumbers, Promise.resolve(blockDetails));
    })
    .then(() => db);
}

module.exports = {
  setupTestDb,
  makeLogFactory,
  makeFakeBlock,
  seedDb,
  makeMockAugur,
  dumpTable, dumpTables,
};
