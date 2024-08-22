
# Configure your Node Runners Ethereum - Erigon Prysm

To specify the Ethereum client combination you wish to deploy, create your own copy of `.env` file and edit it using your preferred text editor. The contents of your file for a Erigon / Prysm node deployment is as follows, which uses a sample config from the repository:
```bash
# Make sure you are in aws-blockchain-node-runners/lib/ethereum
cd lib/ethereum
pwd
cp ./sample-configs/.env-erigon-prysm .env
nano .env
```
> **NOTE:** *You can find more examples inside the `sample-configs` directory, which illustrate other Ethereum client combinations.*