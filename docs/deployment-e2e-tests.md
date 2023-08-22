## Setup (.env)

- Set `NODE_URL`, `BLOCK_NUMBER`
- Set `DEPLOYER` Use deployer address

```sh
source .env
```

## fork mainnet

```sh
rm  -rf artifacts/ cache/

npx hardhat node --fork $NODE_URL --fork-block-number $BLOCK_NUMBER --no-deploy
```

Impersonate `process.env.DEPLOYER` account

```sh
npx hardhat impersonate-deployer --network localhost
```

## run test before (optional)

```sh
# If the target chain already has contracts deployed
npx hardhat test --network localhost test/E2E.test.ts
```

## run deployment

```sh
# If the target chain already has contracts deployed
cp -r deployments/<NETWORK>/ deployments/localhost
```

Note: If you want to check `deployments/` files changes easier, uncomment `deployments/localhost` line from `.gitignore` and stage them.
All modifications done by the scripts will appear on the git changes area.

```sh
npx hardhat deploy --network localhost > DEPLOYMENT_TEST_OUTPUT.txt
```

## run test after

```sh
npx hardhat test --network localhost test/E2E.test.ts
```
