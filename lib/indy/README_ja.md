# Sample AWS Blockchain Node Runner app for Hyperledger Indy

[English](./README.md)

## Architecture Overview

![Architecture](./doc/assets/Architecture.png)

Hyperledger Indy のネットワークを AWS 上に構築するサンプルである。
全体像は下図の通り、処理自体は ４ つの Steward (Validator Node) で行われ、ネットワークの管理は Trustee で行われる。実体は Steward 用の ４ つの EC2 インスタンスと、Trustee 用の 3 つの EC2 インスタンスである。

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

#### リソースの構築

1. Configure  your setup

Create your own copy of `.env` file and edit it:
```bash
   # Make sure you are in aws-blockchain-node-runners/lib/ethereum
   cd lib/indy
   pwd
   cp .env-sample .env
   nano .env
```

2. AWS Cloud Development Kit (CDK) の初期設定

下記のコマンドはデプロイを実施するリージョンで AWS CDK を使用していない場合のみ実施する

```bash
npx cdk bootstrap
```

3. CDK でリソースの構築

```bash
npx cdk deploy --json --outputs-file indy-test-deploy-output.json

Outputs:
IndyNetworkStack.AnsibleFileTransferBucketName = 111122223333-ansible-file-transfer-bucket
IndyNetworkStack.steward1steward1InstanceId2F9F8910 = i-1234567890abcdef1
IndyNetworkStack.steward2steward2InstanceId995438F2 = i-1234567890abcdef2
IndyNetworkStack.steward3steward3InstanceIdB5D10BBE = i-1234567890abcdef3
IndyNetworkStack.steward4steward4InstanceIdB3DD7753 = i-1234567890abcdef4
IndyNetworkStack.trustee1trustee1InstanceId8FDDE052 = i-1234567890abcdef5
IndyNetworkStack.trustee2trustee2InstanceIdE12079EA = i-1234567890abcdef6
IndyNetworkStack.trustee3trustee3InstanceId508C4E4C = i-1234567890abcdef7
```

**NOTE:** Steward インスタンスのユーザーデータは [Community の Doc](https://github.com/hyperledger/indy-node/blob/main/docs/source/install-docs/AWS-NodeInstall-20.04.md) を参考に作成している。

# Ansibleを使用した環境構築

Macで実行する場合は次の環境変数を設定する。

> export OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES

## Ansibleの事前準備

- pythonの仮想環境を作成しansibleを導入する
  ```
  $ cd ansible
  $ python3 -m venv venv
  $ source venv/bin/activate
  ```

  ```
  $ pip install -r requirements.txt
  ```

##### Describe instance information to be built in inventory.yml

- Create an indentory file containing information on the EC2 instance that will build the environment. Enter the instance ID described in the CDK output results in the settings column for each node. The value of `indyNetworkStack.ansibleFileTransferBucketName` described in CDK output results is inputted to `ansible_aws_ssm_bucket_name`. When Ansible transfers files to the target host, the Amazon Simple Storage Service (Amazon S3) bucket specified here is used.

  ```
  cd ..
  ./configure-ansible-inventory.sh 
  ```

## Ansibleの設定
Open `inventory/group_vars/all.yml` file and define the parameters referred to by Ansible in the configuration file. Set Indy's network name

```
INDY_NETWORK_NAME: sample-network
```
​
## Ansibleによる環境構築の実行

- inventory/inventory.ymlで設定したインスタンスにansibleが接続できることをansibleの `ping` モジュールを使用して確認する
  ```
  $ ansible -m ping all -i inventory/inventory.yml  
  steward2 | SUCCESS => {
      "changed": false,
      "ping": "pong"
  }
  steward3 | SUCCESS => {
      "changed": false,
      "ping": "pong"
  }
  trustee1 | SUCCESS => {
      "changed": false,
      "ping": "pong"
  }
  steward4 | SUCCESS => {
      "changed": false,
      "ping": "pong"
  }
  trustee2 | SUCCESS => {
      "changed": false,
      "ping": "pong"
  }
  trustee3 | SUCCESS => {
      "changed": false,
      "ping": "pong"
  }
  steward1 | SUCCESS => {
      "changed": false,
      "ping": "pong"
  }
  ```

- ansibleで `inventory/inventory.yml` で定義した対象のEC2インスタンスに対してHyperledger Indyの環境構築を実行する
  ```
  $ ansible-playbook playbook/site.yml
  ```


## 参考情報
- [Indy Network の構築](https://github.com/pSchlarb/indy-node/blob/documentationUpdate/docs/source/NewNetwork/NewNetwork.md)
- [Indy Node のための EC2 セットアップ](https://github.com/hyperledger/indy-node/blob/main/docs/source/install-docs/AWS-NodeInstall-20.04.md)
- [Indy Node のセットアップ](https://github.com/pSchlarb/indy-node/blob/documentationUpdate/docs/source/installation-and-configuration.md)

### 考慮事項

本サンプルを利用するにあたり追加開発などで検討する事項を記載する。

-   インスタンスタイプを M 系に変更
    -   現状は T 系インスタンスであるが本番環境では M 系などへの変更を推奨
-   Steward (Validator Node) にアタッチされている Node NIC の Security Group を修正
    -   Source IP を他ノードの Node IP に制限する (現在は VPC 内にオープンになっており、Client からもアクセスできる)
    -   Node の Private IP を固定
-   必要に応じて Node の属するサブネットを Public Subnet にする
-   Steward と Node を別インスタンスにする
