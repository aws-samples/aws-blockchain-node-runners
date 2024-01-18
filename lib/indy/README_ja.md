# Sample AWS Blockchain Node Runner app for Hyperledger Indy

[English](./README.md)

## Architecture Overview

![Architecture](./doc/assets/Architecture.png)

Hyperledger Indy のネットワークを AWS 上に構築するサンプルである。
全体像は下図の通り、処理自体は ４ つの Steward (Validator Node) で行われ、ネットワークの管理は Trustee で行われる。実体は Steward 用の ４ つの EC2 インスタンスと、Trustee 用の １ つの EC2 インスタンスである。

## Solution Walkthrough

### Setup Cloud9

We will use AWS Cloud9 to execute the subsequent commands. Follow the instructions in [Cloud9 Setup](../../docs/setup-cloud9.md)

### Clone this repository and install dependencies

```bash
git clone https://github.com/aws-samples/aws-blockchain-node-runners.git
cd aws-blockchain-node-runners
npm install
```

**NOTE:** In this tutorial we will set all major configuration through environment variables, but you also can modify parameters in `config/config.ts`.

### Deploy Indy Nodes

Indy Network を Steward 用の４つの EC2 インスタンスと、Trustee 用の１つの EC2 インスタンスを用いて構築する。下記手順の中で DID など各種情報を取得し、それらを[こちらの Community のスプレッドシート](https://docs.google.com/spreadsheets/d/1LDduIeZp7pansd9deXeVSqGgdf0VdAHNMc7xYli3QAY/edit#gid=0)を参考にコピーしてまとめる。

#### リソースの構築

1. npm の依存パッケージをインストール

```bash
cd lib/indy
pwd
# Make sure you are in aws-blockchain-node-runners/lib/indy
npm install
```

2. AWS Cloud Development Kit (CDK) の初期設定

下記のコマンドはデプロイを実施するリージョンで AWS CDK を使用していない場合のみ実施する

```bash
npx cdk bootstrap
```

3. CDK でリソースの構築

```bash
npx cdk deploy

Outputs:
IndyNodeStack.Node1InstanceId = i-xxxxxxxxxxxxxxxxx
IndyNodeStack.Node2InstanceId = i-xxxxxxxxxxxxxxxxx
IndyNodeStack.Node3InstanceId = i-xxxxxxxxxxxxxxxxx
IndyNodeStack.Node4InstanceId = i-xxxxxxxxxxxxxxxxx
IndyNodeStack.TrusteeInstanceId = i-xxxxxxxxxxxxxxxxx
```

**NOTE:** Steward インスタンスのユーザーデータは [Community の Doc](https://github.com/hyperledger/indy-node/blob/main/docs/source/install-docs/AWS-NodeInstall-20.04.md) を参考に作成している。

#### Trustee の設定

EC2 (もしくは Systems Manager) のコンソールから Session Manager 経由で Trustee インスタンスにログインし、Trustee/Steward の DID を生成する。
​

```bash
cd /
./indy-cli-rs
​
# 下記の操作を Trustee 用に 3回、Steward 用に 4回の計７回実施
wallet create <WALLET_NAME> key=<KEY>
wallet open <WALLET_NAME> key=<KEY>
did new seed=<SEED>
wallet close
```

#### Steward の設定​

EC2 (もしくは Systems Manager) のコンソールから Session Manager 経由で Steward インスタンスにログインして、Validator verkey, BLS key, BLS POP を生成する。

```bash
sudo init_indy_node <ALIAS> <NODE_IP> 9701 <CLIENT_IP> 9702 <SEED>
```

**NOTE:** ここでは Steward は Validator Node のことを表す ([参考情報](https://github.com/pSchlarb/indy-node/blob/documentationUpdate/docs/source/installation-and-configuration.md#32-validator-node-installation))。

#### Genesis Files の生成

1. これまでの手順で生成した情報を記載したスプレッドシートの各シート (Stewards / Trustees) をダウンロード
   - File → Download → .csv
2. `trustees.csv` / `stewards.csv` を Trustee インスタンスに保存

**NOTE:** ローカルにダウンロードした CSV ファイルを Session Manager 経由で転送するには AWS CLI に加えて Session Manager Plugin を用いて下記コマンドで転送する ([参考情報](https://dev.classmethod.jp/articles/ssm-session-manager-support-for-tunneling-ssh-scp-on-windows10/))。

```bash
scp -i <PATH_TO_PEM> <PATH_TO_CSV> ec2-user@<i-xxxxxxxx>:~/
```

​
3. Genesis Files 生成

上記 2 つの CSV ファイルを用いて、`genesis_from_files.py` によって Genesis files (`pool_transactions_genesis`, `domain_transactions_genesis`) を生成する

```bash
cd ~/
wget -nc https://raw.githubusercontent.com/sovrin-foundation/steward-tools/master/create_genesis/genesis_from_files.py
​
chmod +x genesis_from_files.py
./genesis_from_files.py --stewards stewards.csv --trustees trustees.csv

DEBUG:root:new line check for file: ./pool_transactions_genesis
INFO:root:Starting ledger...
INFO:root:Recovering tree from transaction log
INFO:root:Recovered tree in 0.00010979999979099375 seconds
DEBUG:root:new line check for file: ./domain_transactions_genesis
INFO:root:Starting ledger...
INFO:root:Recovering tree from transaction log
INFO:root:Recovered tree in 8.670999977766769e-05 seconds
```

#### Node の設定

各 Validator Node (Steward) の立ち上げを行う

1. Genesis Files のダウンロードと各種ファイルの権限設定

Genesis Files を Node インスタンスにダウンロードもしくはコピーする。そして、`/var/lib/indy/` 配下の全ファイルの権限を indy に設定する ([参考情報](https://github.com/pSchlarb/indy-node/blob/documentationUpdate/docs/source/NewNetwork/NewNetwork.md#iv-create-and-distribute-genesis-transaction-files)​)。

```bash
cd  /var/lib/indy/sample-network

# domain_transactions_genesis と pool_transactions_genesis を保存
# sudo curl -o domain_transactions_genesis <URL_TO_THE_RAW_DOMAIN_TRANSACTIONS_GENESIS_FILE>
# sudo curl -o pool_transactions_genesis  <URL_TO_THE_RAW_POOL_TRANSACTIONS_GENESIS_FILE>

sudo chown -R indy:indy ../
```

**NOTE:** `/var/lib/indy/sample-network` のディレクトリ名 は `lib/indy/lib/assets/user-data/steward.sh` で設定している `NETWORK_NAME` である。

2. indy-node の起動と動作確認

```bash
sudo systemctl start indy-node
sudo systemctl status indy-node
sudo systemctl enable indy-node
​
sudo validator-info
```

**NOTE:** [ドキュメント](https://github.com/pSchlarb/indy-node/blob/documentationUpdate/docs/source/installation-and-configuration.md#35-add-node-to-a-pool)の 3.5.2 以降を実施している
​

#### 参考情報

- [Indy Network の構築](https://github.com/pSchlarb/indy-node/blob/documentationUpdate/docs/source/NewNetwork/NewNetwork.md)
- [Indy Node のための EC2 セットアップ](https://github.com/hyperledger/indy-node/blob/main/docs/source/install-docs/AWS-NodeInstall-20.04.md)
- [Indy Node のセットアップ](https://github.com/pSchlarb/indy-node/blob/documentationUpdate/docs/source/installation-and-configuration.md)
​

### 考慮事項

本サンプルを利用するにあたり追加開発などで検討する事項を記載する。

- インスタンスタイプを M 系に変更
  - 現状は T 系インスタンスであるが本番環境では M 系などへの変更を推奨
- Steward (Validator Node) にアタッチされている Node NIC の Security Group を修正
  - Source IP を他ノードの Node IP に制限する (現在は VPC 内にオープンになっており、Client からもアクセスできる)
  - Node の Private IP を固定
- 必要に応じて Node の属するサブネットを Public Subnet にする
- Steward と Node を別インスタンスにする
