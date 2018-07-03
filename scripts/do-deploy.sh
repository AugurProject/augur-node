#!/bin/bash

[ -z "$DIGITALOCEAN_ACCESS_TOKEN" ] && echo "Need to set DIGITALOCEAN_ACCESS_TOKEN" && exit 1;

echo "preparing env"

# create droplet augur-node
docker-machine inspect augur-node > /dev/null 2>&1 || docker-machine create --driver digitalocean augur-node

eval $(docker-machine env augur-node)

# kill augur-node if running
docker kill augur-node 2>/dev/null

echo "running docker"
# run docker in droplet
docker run -d --rm -p 9001:9001 -p 9002:9002 -e "ETHEREUM_WS=wss://websocket-rinkeby.ethereum.nodes.augur.net" --name augur-node augurproject/augur-node:stable

echo "http://$(docker-machine ip augur-node):9001 is up"
