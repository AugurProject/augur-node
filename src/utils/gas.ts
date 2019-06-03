import BigNumber from "bignumber.js";
import axios from "axios";

export const defaultStandardGasPriceGwei = new BigNumber(5, 10);

let apiStandardGasPriceGwei: undefined | BigNumber;

export function currentStandardGasPriceGwei(): BigNumber {
  return apiStandardGasPriceGwei || defaultStandardGasPriceGwei;
}

let didStart = false;
export function startFetchingGasPrice(): void {
  if (didStart) return;
  didStart = true;
  setInterval(fetchGasPrice, 60 * 1000);
  fetchGasPrice();
}

function fetchGasPrice(): void {
  axios.get("https://ethgasstation.info/json/ethgasAPI.json")
  .then((resp: any) => {
    if (!(resp && resp.data && resp.data.average)) throw new Error(`expected response to contain data.average, response=${resp}`);

    // ethgasstation API uses "10 gwei" units for gas prices,
    // so resp.average needs to be divided by 10 to be gwei.
    apiStandardGasPriceGwei = new BigNumber(resp.data.average / 10.0, 10);
    if (!apiStandardGasPriceGwei || apiStandardGasPriceGwei.isNaN()) {
      apiStandardGasPriceGwei = undefined;
      throw new Error(`failed to parse response.data.average into a BigNumber, response.data.average=${resp.data.average}`);
    }
    // console.log(`fetched ethgasstation standard gas price of ${apiStandardGasPriceGwei.toString()} gwei`);
  })
  .catch((err) => {
    console.error(`error fetching gas price from ethgasstation`, err);
    apiStandardGasPriceGwei = undefined;
  });
}
