import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as configTypes from "./stacksConfig.interface";

export const DEFAULT_STACKS_NETWORK: configTypes.StacksNetwork = "mainnet";
export const DEFAULT_STACKS_NODE_CONFIGURATION: configTypes.StacksNodeConfiguration = "follower";

export function stacksNodeConfigDefaults(
    stacksNetwork: configTypes.StacksNetwork,
    stacksNodeConfiguration: configTypes.StacksNodeConfiguration
): configTypes.StacksHAConfig {

    const isMainnet: boolean = stacksNetwork === "mainnet";

    const defaultDataVolume: configTypes.StacksVolumeConfig = {
        sizeGiB: isMainnet ? 512 : 256,
        type: ec2.EbsDeviceVolumeType.GP3,
        iops: 12000,
        throughput: 700
    }

    // It takes around an hour and a half for a mainnet follower node to start up.
    const defaultHeartBeatDelayMin: number = isMainnet ? 100 : 60;

    // In the case of the signer a larger instance type may be required.
    // TODO: Benchmark the signing performance under different instance types.
    const defaultInstanceType: string = stacksNodeConfiguration === "signer"
        ? "c4.4xlarge"
        : "m5.large";

    // Generate deatult configurations based on recommended parameters in
    // https://docs.stacks.co/stacks-in-depth/nodes-and-miners.
    const defaultStacksNetworkConfig: configTypes.StacksNetworkConfig = stacksNetwork === "mainnet"
        ? {
            stacksNetwork: "mainnet",
            stacksBootstrapNode: "02196f005965cebe6ddc3901b7b1cc1aa7a88f305bb8c5893456b8f9a605923893@seed.mainnet.hiro.so:20444,02539449ad94e6e6392d8c1deb2b4e61f80ae2a18964349bc14336d8b903c46a8c@cet.stacksnodes.org:20444,02ececc8ce79b8adf813f13a0255f8ae58d4357309ba0cedd523d9f1a306fcfb79@sgt.stacksnodes.org:20444,0303144ba518fe7a0fb56a8a7d488f950307a4330f146e1e1458fc63fb33defe96@est.stacksnodes.org:20444",
            stacksChainstateArchive: "https://archive.hiro.so/mainnet/stacks-blockchain/mainnet-stacks-blockchain-latest.tar.gz",
            stacksP2pPort: 20444,
            stacksRpcPort: 20443,
            bitcoinPeerHost: "bitcoind.stacks.co",
            bitcoinRpcUsername: "blockstack",
            bitcoinRpcPassword: "blockstacksystem",
            bitcoinP2pPort: 8333,
            bitcoinRpcPort: 8332,
        }
        : {
            stacksNetwork: "testnet",
            stacksBootstrapNode: "047435c194e9b01b3d7f7a2802d6684a3af68d05bbf4ec8f17021980d777691f1d51651f7f1d566532c804da506c117bbf79ad62eea81213ba58f8808b4d9504ad@testnet.stacks.co:20444",
            stacksChainstateArchive: "https://archive.hiro.so/testnet/stacks-blockchain/testnet-stacks-blockchain-latest.tar.gz",
            stacksP2pPort: 20444,
            stacksRpcPort: 20443,
            bitcoinPeerHost: "bitcoind.testnet.stacks.co",
            bitcoinRpcUsername: "blockstack",
            bitcoinRpcPassword: "blockstacksystem",
            bitcoinP2pPort: 18333,
            bitcoinRpcPort: 18332,
        }

    return {
        ...defaultStacksNetworkConfig,
        stacksNodeConfiguration: stacksNodeConfiguration,
        instanceType: new ec2.InstanceType(defaultInstanceType),
        instanceCpuType: ec2.AmazonLinuxCpuType.X86_64,
        stacksVersion: "latest",
        stacksSignerSecretArn: "none",
        stacksMinerSecretArn: "none",
        buildFromSource: false,
        downloadChainstate: true,
        dataVolume: defaultDataVolume,
        // High availability configs defaults.
        albHealthCheckGracePeriodMin: 10,
        heartBeatDelayMin: defaultHeartBeatDelayMin,
        numberOfNodes: 2,
    };
}
