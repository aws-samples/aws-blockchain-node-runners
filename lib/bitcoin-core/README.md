## Sample AWS Blockchain Node Runner app for Bitcoin Nodes

|          Contributed by          |
|:--------------------------------:|
| [Simon Goldberg](https://github.com/racket2000)|

### Overview

This guide walks you through deploying a Bitcoin Core mainnet node in a **Virtual Private Cloud (VPC)** using **Docker**, leveraging **AWS Secrets Manager** for secure credential handling. This configuration ensures robust security and performance while optimizing data transfer costs.

---

### Getting Started

#### Cloning the Repository

First, clone the repository from GitHub to get the necessary files and configurations:

```
git clone https://github.com/aws-samples/aws-blockchain-node-runners.git
cd aws-blockchain-node-runners/lib/bitcoin-core
```

#### Installing Dependencies

Make sure you have AWS CLI installed and configured. Run the following to install any additional dependencies:

```
npm install
```

### Configuration Management - Generating RPC Authentication

To interact with the Bitcoin Core RPC endpoint within your isolated VPC environment, run the following command before deploying the Bitcoin Node via CDK:

```
node generateRPCAuth.js
```

For a deeper dive and an overview of credential rotation, see [RPC Authentication -- Deep Dive](#rpc-authentication----deep-dive).


### Deploying the Node

To deploy a single node setup, use the following command:

```
npx cdk deploy SingleNodeBitcoinCoreStack
```

For High Availability (HA) node deployment, use:

```
npx cdk deploy HABitcoinCoreNodeStack
```

### Deployment Architectures for Bitcoin Nodes

#### Single Node Setup

- A **Bitcoin node** deployed in a **public subnet** continuously synchronizes with the Bitcoin network using outbound connections through a **NAT Gateway**.
- Outbound communication flows through an **Internet Gateway (IGW)**, but the node itself does not have a **public IP address** or **Elastic IP (EIP)**.
- The **NAT Gateway** translates the node's private IP into a public IP for outbound connections, but inbound connections are blocked. This ensures that the node functions as an **outbound-only node**, increasing security and reducing data transfer costs.

#### High Availability (HA) Setup

- Deploying **multiple Bitcoin nodes** in an **Auto Scaling Group** enhances fault tolerance and availability.
- The nodes communicate internally through **private IP addresses** and synchronize through a shared **Application Load Balancer (ALB)**.
- HA nodes maintain synchronization through the **NAT Gateway** without exposing the RPC endpoint to the public internet.

---

### Optimizing Data Transfer Costs

By deploying as an **outbound-only node**, data transfer costs are significantly reduced since the node does not serve blockchain data to external peers. With its outbound connections, the node(s) are able to maintain full blockchain synchronization.

---
### Accessing and Using RPC with a Single Node Bitcoin Core Instance 

To interact with your Bitcoin Core instance, you'll need to use AWS Systems Manager, as direct SSH access is not available. 

Follow these steps to make an RPC call:

1. **Access the Instance:**
   - Open the AWS Console and navigate to EC2 Instances.
   - Locate and select the instance named `SingleNodeBitcoinCoreStack/BitcoinSingleNode`.
   - Click the "Connect" button.
   - Choose "Session Manager" from the connection options.
   - Select "Connect" to establish a session.

2. **Execute an RPC Call:**
Once connected, you can interact with the Bitcoin Core node using Docker commands.

To test the RPC interface, use the following command:

```
sudo docker exec -it bitcoind bitcoin-cli getblockchaininfo
```

   This command executes the `getblockchaininfo` RPC method, which returns current state information about the blockchain.

3. **Interpreting Results:**
   - The output will provide detailed information about the current state of the blockchain, including the current block height, difficulty, and other relevant data.
   - You can use similar commands to execute other RPC methods supported by Bitcoin Core.

---
### Secure RPC with AWS Secrets Manager

To securely interact with the Bitcoin Core RPC endpoint from a private subnet within your isolated VPC environment, AWS Secrets Manager is leveraged for credential storage and retrieval.

**Important**: Ensure that you execute the following commands from within a private subnet in the Bitcoin Core Node VPC. A VPC CloudShell environment is suitable for testing purposes.

#### Retrieving Credentials
First, retrieve the RPC credentials from AWS Secrets Manager:

```
export BTC_RPC_AUTH=$(aws secretsmanager get-secret-value --secret-id bitcoin_rpc_credentials --query SecretString --output text)
```

#### Single node RPC Call using credentials
To make an RPC call to a single Bitcoin node, use the following command. Replace <Bitcoin-Node-Private-IP> with the actual private IP address of your Bitcoin node: `<Bitcoin-Node-Private-IP>`. 

```
curl --user "$BTC_RPC_AUTH" \
     --data-binary '{"jsonrpc": "1.0", "id": "curltest", "method": "getblockchaininfo", "params": []}' \
     -H 'content-type: text/plain;' http://<Bitcoin-Node-Private-IP>:8332/
```

#### High Availability (HA) RPC Call using credentials

For high availability setups utilizing an Application Load Balancer (ALB), use the following command. Replace <Load-Balancer-DNS-Name> with your ALB's DNS name:

```
curl --user "$BTC_RPC_AUTH" \
     --data-binary '{"jsonrpc": "1.0", "id": "curltest", "method": "getblockchaininfo", "params": []}' \
     -H 'content-type: text/plain;' \
     <Load Balancer DNS Name>
```

---


### **Bitcoin Core: Creating an Encrypted Wallet for Payments**

This guide covers how to create an encrypted Bitcoin Core wallet specifically designed for receiving and managing payments in a secure and efficient way.

---

#### **1. Create an Encrypted Payment Wallet**

To create a wallet specifically for handling payments, use the following command:

```
sudo docker exec -it bitcoind bitcoin-cli createwallet "payments" false false "my_secure_passphrase"
```

- **payments:** The wallet name, indicating its purpose.  
- **passphrase:** A secure, memorable phrase to protect your funds.  

##### **Why Encrypt?**
- Protects against unauthorized access.  
- Ensures funds are safe even if the server is compromised.  

---

#### **2. Generate a Receiving Address**

To receive payments, generate a new address. You do not need to unlock the wallet for this step:

```
sudo docker exec -it bitcoind bitcoin-cli -rpcwallet="payments" getnewaddress "customer1" "bech32"
```

- **customer1:** Label to identify payments from this customer.  
- **bech32:** Generates a SegWit address for lower transaction fees.  

**Example Output:**
```
bc1qxyzabc123... (Bech32 address)
```

---

#### **3. Monitor Incoming Payments**

To check the balance and verify received payments:

```
sudo docker exec -it bitcoind bitcoin-cli -rpcwallet="payments" getbalance
```

- Displays the total balance held in the wallet.  

To view detailed transactions:

```
sudo docker exec -it bitcoind bitcoin-cli -rpcwallet="payments" listtransactions
```

---

#### **4. Sending Payments (Requires Unlocking)**

When making a payout or transferring funds, you need to unlock the wallet:

```
sudo docker exec -it bitcoind bitcoin-cli -rpcwallet="payments" walletpassphrase "my_secure_passphrase" 600
```

- Unlocks the wallet for **600 seconds (10 minutes)**.  

#### **Send Bitcoin to a specified address:**

```
sudo docker exec -it bitcoind bitcoin-cli -rpcwallet="payments" sendtoaddress "bc1qrecipientaddress" 0.01 "Payment for service"
```

- Sends **0.01 BTC** with an optional label for record-keeping.  


#### **5. Lock the Wallet After Use**

For enhanced security, immediately lock the wallet after transactions:

```
sudo docker exec -it bitcoind bitcoin-cli -rpcwallet="payments" walletlock
```



#### **6. Backup the Wallet**

To protect your payment data, back up the encrypted wallet regularly:

```
sudo docker exec -it bitcoind bitcoin-cli -rpcwallet="payments" backupwallet "/path/to/backup/payments.dat"
```


#### **Security Tips for Payment Wallets**
- Use strong passphrases and store them securely offline.  
- Regularly backup your wallet after creating new addresses or receiving payments.  
- Consider setting up automated wallet backups to ensure data integrity.  

---
### RPC Authentication -- Deep Dive

The `generateRPCAuth.js` script is responsible for generating secure authentication credentials for your Bitcoin node. This script creates a randomly generated **username** and **password** along with a **salt**. The password and salt are then combined and hashed using the **SHA256** algorithm to produce a secure **hash**. This hash is combined with the username to generate the final **rpcauth** parameter that is appended to the `bitcoin.conf` file.

The final `rpcauth` line in `bitcoin.conf` looks like this:

```
rpcauth=user_258:c220c5f38690bf880f0dd177547e55f7$77c6ec2dd90e792d60450b01a84cc8c2563a7fb1d0fbd73de49be818fde4b407
```

- The **rpcauth** part consists of a **username**, **salt**, and a **hashed password**, providing robust protection in the case that your `bitcoin.conf` is accessed by an unauthorized entity.
- The randomly generated **username** and **password** are securely stored in **AWS Secrets Manager**.

By using this script, it ensures that your node has unique and secure credentials.

### Rotating RPC Secrets

To maintain security, rotate RPC credentials periodically using the `generateRPCAuth.js` script:

```
node generateRPCAuth.js
```

This will update the value of your credentials in Secrets Manager. 

**Replacing the Credentials and Restarting the Node to Apply Updates**

- Replace the old `rpcauth` value from the `bitcoin.conf` file with the new one:
  ```
  sudo docker exec -it bitcoind sh -c "sed -i 's/^rpcauth=.*/rpcauth=<new rpcauth string with escape char>/' /root/.bitcoin/bitcoin.conf"
  ```
- Restart the Bitcoin node to apply changes:
  ```
  sudo docker restart bitcoind
  ```

#### Verifying the Credential Rotation

Make an RPC call to ensure the new credentials are active:

```
curl --user "$BTC_RPC_AUTH" \
     --data-binary '{"jsonrpc": "1.0", "id": "curltest", "method": "getblockchaininfo", "params": []}' \
     -H 'content-type: text/plain;' http://<Bitcoin-Node-Private-IP>:8332/
```

---

### Monitoring and Troubleshooting

Keep your node healthy by monitoring logs and configurations:

- Check recent Bitcoin logs:
  ```
  sudo docker logs -f --tail 100 bitcoind
  ```

- Check first 100 Bitcoin logs:
  ```
  sudo docker logs bitcoind | head -n 100
  ```

- View the configuration file:
  ```
  sudo docker exec -it cat /home/bitcoin/.bitcoin/bitcoin.conf
  ```
- View user data logs:
  ```
  sudo cat /var/log/cloud-init-output.log
  ```
  

---

### Additional Tips and Best Practices

- Regularly rotate secrets and always remove old `rpcauth` entries before restarting the node.
- Use **CloudWatch** to monitor node performance and detect issues promptly.

---

### Conclusion

Deploying and managing a Bitcoin node on AWS requires careful configuration to ensure security, cost efficiency, and high availability. By following the best practices outlined in this guide, you can maintain a robust and secure node while minimizing costs. Stay proactive with monitoring and regularly update credentials to keep your node running smoothly.

