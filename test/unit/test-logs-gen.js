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

function getPreReportingMarketsInfo(marketIds, m) {
  augur.markets.getMarketsInfo({
    marketIds,
  }, function (error, result) {
    sortAndFilterMarketsInfo(result, m);
  });
}

function getMarkets(universe, m) {
  augur.markets.getMarkets({
    universe,
  }, function (error, result) {
    getPreReportingMarketsInfo(result, m);
  });
}

async function performTrades(universe) {
  const m = { scalarMarketsInfo: [], yesNoMarketsInfo: [], categoricalMarketsInfo: [] };
  await getMarkets(universe, m);
  console.log(m);
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
