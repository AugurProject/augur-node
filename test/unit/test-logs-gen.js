/* Experimental playground for spike
   "Read in logs for creating orders &
   placing trades &
   run them through log processors"

   Written by Juliya Smith
 */

const augur = require("augur.js");

function sortAndFilterMarketsInfo(marketsInfo, m) {
  marketsInfo.forEach(function (currentMarket) {
    if (currentMarket.reportingState === "PRE_REPORTING") {
      switch (currentMarket.marketType) {
        case "scalar":
          m.scalarMarketsInfo.push(currentMarket);
          break;
        case "yesNo":
          m.yesNoMarketsInfo.push(currentMarket);
          break;
        case "categorical":
          m.categoricalMarketsInfo.push(currentMarket);
          break;
        default:
          break;
      }
    }
  });
}

async function getPreReportingMarketsInfo(marketIds, m) {
  await augur.markets.getMarketsInfo({
    marketIds,
  }, function (error, result) {
    sortAndFilterMarketsInfo(result, m);
  });
  return m;
}

async function getMarkets(universe, m) {
  await augur.markets.getMarkets({
    universe,
  }, function (error, result) {
    getPreReportingMarketsInfo(result, m);
  });
  return m;
}

async function performTrades(universe) {
  let m = { scalarMarketsInfo: [], yesNoMarketsInfo: [], categoricalMarketsInfo: [] };
  m = await getMarkets(universe, m);
  return m;
}

async function genTestLogs() {
  const universe = augur.contracts.addresses[augur.rpc.getNetworkID()].Universe;
  await augur.events.startAugurNodeEventListeners({
    OrderCreated: function (error, result) {
      console.log("A new TokensTransferred event has occurred: ", result);
    },
  }, function () {
    performTrades(universe);
  });
}

module.exports = genTestLogs;
