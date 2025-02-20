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
            stacksBootstrapNode: "02da7a464ac770ae8337a343670778b93410f2f3fef6bea98dd1c3e9224459d36b@seed-0.mainnet.stacks.co:20444,02afeae522aab5f8c99a00ddf75fbcb4a641e052dd48836408d9cf437344b63516@seed-1.mainnet.stacks.co:20444,03652212ea76be0ed4cd83a25c06e57819993029a7b9999f7d63c36340b34a4e62@seed-2.mainnet.stacks.co:20444",
            stacksChainstateArchive: "https://archive.hiro.so/mainnet/stacks-blockchain/mainnet-stacks-blockchain-latest.tar.gz",
            stacksP2pPort: 20444,
            stacksRpcPort: 20443,
            bitcoinPeerHost: "bitcoin.mainnet.stacks.org",
            bitcoinRpcUsername: "stacks",
            bitcoinRpcPassword: "foundation",
            bitcoinP2pPort: 8333,
            bitcoinRpcPort: 8332,
        }
        : {
            stacksNetwork: "testnet",
            stacksBootstrapNode: "047435c194e9b01b3d7f7a2802d6684a3af68d05bbf4ec8f17021980d777691f1d51651f7f1d566532c804da506c117bbf79ad62eea81213ba58f8808b4d9504ad@testnet.stacks.co:20444",
            stacksChainstateArchive: "https://archive.hiro.so/testnet/stacks-blockchain/testnet-stacks-blockchain-latest.tar.gz",
            stacksP2pPort: 20444,
            stacksRpcPort: 20443,
            bitcoinPeerHost: "bitcoin.testnet.stacks.org",
            bitcoinRpcUsername: "stacks",
            bitcoinRpcPassword: "foundation",
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
