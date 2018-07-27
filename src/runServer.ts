import Augur from "augur.js";
import { NetworkConfiguration } from "augur-core";
import { AugurNodeController } from "./controller";
import { logger } from "./utils/logger";

const networkName = process.argv[2] || "environment";
const databaseDir = process.env.AUGUR_DATABASE_DIR;
const maxRetries = process.env.MAX_RETRIES || "0";
const propagationDelayWaitMillis = process.env.DELAY_WAIT_MILLIS;
const networkConfig = NetworkConfiguration.create(networkName);
const augur: Augur = new Augur();

let config = networkConfig;
if (maxRetries) config = Object.assign({}, config, { maxRetries });
if (propagationDelayWaitMillis) config = Object.assign({}, config, { propagationDelayWaitMillis });
const retries: number = parseInt(maxRetries, 10);

function start(retries: number, augur: Augur, config: any, databaseDir: any) {
  const augurNodeController = new AugurNodeController(augur, config, databaseDir);

  augur.rpc.setDebugOptions({ broadcast: false });
  augur.events.nodes.ethereum.on("disconnect", (event) => {
    logger.warn("Disconnected from Ethereum node", (event || {}).reason);
  });

  augur.events.nodes.ethereum.on("reconnect", () => {
    logger.warn("Reconnect to Ethereum node");
  });

  function errorCatch(err: any) {
    if (retries > 0) {
      retries--;
      augurNodeController.shutdown();
      setTimeout(start(retries, augur, config, databaseDir), 1000);
    } else {
      process.exit(1);
    }
  }

  augurNodeController.start(errorCatch).catch(errorCatch);
}

start(retries, augur, config, databaseDir);
