import { Augur } from "augur.js";
import { ErrorCallback } from "../types";

const POLLING_FREQUENCY_IN_MS = 5000;

// This should really go on augur.js
function getNetworkAddresses(augur: Augur) {
  const networkId: string = augur.rpc.getNetworkID();
  const addresses = augur.contracts.addresses[networkId];
  if (addresses === undefined) throw new Error(`getNetworkID result does not map to a set of contracts: ${networkId}`);
  return addresses;
}

export async function monitorEthereumNodeHealth(augur: Augur, errorCallback: ErrorCallback | undefined) {
  try {
    const { Universe: universe, Controller: controller } = getNetworkAddresses(augur);
    setTimeout(() => monitorEthereumNodeHealth(augur, errorCallback), POLLING_FREQUENCY_IN_MS);
  } catch (err) {
    if (errorCallback) errorCallback(err);
  }
}
