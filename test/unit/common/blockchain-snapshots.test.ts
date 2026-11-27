// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';
import * as path from 'path';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { SingleNodeConstruct } from '../../../lib/common/single-node-construct';
import { HANodesConstruct } from '../../../lib/common/ha-nodes-construct';
import { ConfigurationLoader } from '../../../lib/core/configuration-loader';
import { DeploymentConfig, EnvironmentConfig, ProtocolConfig, SnapshotProvider } from '../../../lib/interfaces';
import { extractBootstrapPart, renderUserDataText } from '../assets/render-user-data';

/**
 * SNAPSHOT_PROVIDER=blockchain-snapshots (Blockchain Snapshots on AWS):
 * synth-time resolution of the snapshot ID from the blueprint mapping, the
 * configuration checks, the S3 gateway endpoint check and the IAM grant.
 * Uses the real ethereum and solana blueprints, which carry the mappings.
 */
const BLUEPRINTS = path.join(__dirname, '../../../blueprints');
const USER_DATA_SCRIPT = path.join(__dirname, '../../../assets/common/user-data-ubuntu.sh');
const ACCOUNT = '123456789012';
const REGION = 'us-east-1';

const loader = new ConfigurationLoader(BLUEPRINTS);

function snapshotEnv(protocol: string, sample: string, overrides: Partial<EnvironmentConfig> = {}): EnvironmentConfig {
    const env = loader.loadEnvironmentConfig(path.join(BLUEPRINTS, protocol, 'samples', sample));
    return {
        ...env,
        AWS_ACCOUNT_ID: ACCOUNT,
        AWS_REGION: REGION,
        SNAPSHOT_ENABLED: true,
        SNAPSHOT_PROVIDER: SnapshotProvider.BLOCKCHAIN_SNAPSHOTS,
        ...overrides,
    };
}

describe('Blockchain Snapshots on AWS configuration', () => {
    const ethereum = loader.loadProtocolConfig('ethereum');
    const solana = loader.loadProtocolConfig('solana');

    it.each([
        ['ethereum', '.env-mainnet-geth-lighthouse-full', 'ethereum-mainnet-geth'],
        ['ethereum', '.env-hoodi-geth-lighthouse-full', 'ethereum-hoodi-geth'],
        ['ethereum', '.env-mainnet-nethermind-teku-full', 'ethereum-mainnet-nethermind'],
        ['ethereum', '.env-mainnet-reth-lighthouse-full', 'ethereum-mainnet-reth'],
        ['solana', '.env-mainnet-beta-agave-rpc-base', 'solana-mainnet-agave'],
        ['solana', '.env-mainnet-beta-agave-rpc-extended', 'solana-mainnet-agave'],
        ['solana', '.env-mainnet-beta-frankendancer-rpc-base', 'solana-mainnet-agave'],
    ])('%s %s resolves to %s', (protocol, sample, expectedId) => {
        const env = snapshotEnv(protocol, sample);
        const result = loader.resolveBlockchainSnapshot(protocol === 'ethereum' ? ethereum : solana, env);
        expect(result.errors).toEqual([]);
        expect(env.SNAPSHOT_ID).toBe(expectedId);
        expect(loader.validateConfiguration(env).errors).toEqual([]);
    });

    it.each([
        ['ethereum', '.env-mainnet-reth-lighthouse-archive'],   // snapshot is a full node
        ['ethereum', '.env-sepolia-geth-lighthouse-full'],      // no Sepolia snapshot
        ['ethereum', '.env-mainnet-besu-teku-full'],            // no Besu snapshot
        ['solana', '.env-testnet-agave-rpc-base'],              // mainnet only
    ])('%s %s has no snapshot and is rejected with the supported list', (protocol, sample) => {
        const env = snapshotEnv(protocol, sample);
        const result = loader.resolveBlockchainSnapshot(protocol === 'ethereum' ? ethereum : solana, env);
        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toMatch(/No Blockchain Snapshots on AWS snapshot for CLIENT_CONFIG/);
        expect(result.errors[0]).toMatch(/Supported for/);
        expect(env.SNAPSHOT_ID).toBeUndefined();
    });

    it('does nothing unless SNAPSHOT_ENABLED and the provider are both set', () => {
        for (const overrides of [
            { SNAPSHOT_ENABLED: false },
            { SNAPSHOT_PROVIDER: SnapshotProvider.BLUEPRINT },
            { SNAPSHOT_PROVIDER: undefined },
        ]) {
            const env = snapshotEnv('ethereum', '.env-mainnet-reth-lighthouse-archive', overrides);
            expect(loader.resolveBlockchainSnapshot(ethereum, env).isValid).toBe(true);
            expect(env.SNAPSHOT_ID).toBeUndefined();
        }
    });

    it('defaults SNAPSHOT_PROVIDER to blueprint when the .env does not set it', () => {
        const env = loader.loadEnvironmentConfig(path.join(BLUEPRINTS, 'ethereum/samples/.env-mainnet-geth-lighthouse-full'));
        expect(env.SNAPSHOT_PROVIDER).toBe(SnapshotProvider.BLUEPRINT);
        expect(env.CUSTOM_VARIABLES).not.toHaveProperty('SNAPSHOT_PROVIDER');
    });

    it('rejects an unknown SNAPSHOT_PROVIDER', () => {
        const env = snapshotEnv('ethereum', '.env-mainnet-geth-lighthouse-full', {
            SNAPSHOT_PROVIDER: 'snapshots' as SnapshotProvider,
        });
        expect(loader.validateConfiguration(env).errors).toContainEqual(
            expect.stringMatching(/SNAPSHOT_PROVIDER must be one of: blueprint, blockchain-snapshots/));
    });

    it('rejects a Region without snapshots', () => {
        const env = snapshotEnv('ethereum', '.env-mainnet-geth-lighthouse-full', { AWS_REGION: 'us-west-2' });
        expect(loader.validateConfiguration(env).errors).toContainEqual(
            expect.stringMatching(/not available in AWS_REGION 'us-west-2'.*us-east-1, us-east-2, eu-west-1, ap-northeast-1/));
    });

    it('rejects a snapshot staging volume, which the tool would never use', () => {
        const env = snapshotEnv('ethereum', '.env-mainnet-geth-lighthouse-full', { SNAPSHOT_STAGING_VOL_SIZE: 500 });
        expect(loader.validateConfiguration(env).errors).toContainEqual(
            'SNAPSHOT_STAGING_VOL_SIZE must be 0 with SNAPSHOT_PROVIDER=blockchain-snapshots');
    });

    it('validates blueprint mappings: known network and catalog-style ID', () => {
        const errors: string[] = [];
        (loader as any).validateProtocolConfigStructure({
            ...ethereum,
            availableConfigurations: [
                { name: 'a.yml', blockchainSnapshots: { mainnet: 'ethereum-mainnet-geth' } },
                { name: 'b.yml', blockchainSnapshots: { goerli: 'ethereum-goerli-geth' } },
                { name: 'c.yml', blockchainSnapshots: { mainnet: "x'; rm -rf /" } },
                { name: 'd.yml', blockchainSnapshots: ['ethereum-mainnet-geth'] },
            ],
            defaultConfiguration: 'a.yml',
        }, 'ethereum', errors);
        expect(errors).toEqual([
            "blockchainSnapshots of configuration 'b.yml' uses network 'goerli', which is not in BC_NETWORKS",
            `blockchainSnapshots of configuration 'c.yml' has an invalid snapshot ID for 'mainnet': "x'; rm -rf /"`,
            "blockchainSnapshots of configuration 'd.yml' must be an object mapping BC_NETWORK to a snapshot ID",
        ]);
    });

    it('maps every Solana configuration (Agave and Frankendancer) to the Agave snapshot', () => {
        for (const c of solana.availableConfigurations) {
            expect([c.name, c.blockchainSnapshots]).toEqual([c.name, { 'mainnet-beta': 'solana-mainnet-agave' }]);
        }
    });

    it('passes SNAPSHOT_PROVIDER and SNAPSHOT_ID to /etc/cdk_environment', () => {
        const env = snapshotEnv('ethereum', '.env-mainnet-geth-lighthouse-full');
        loader.resolveBlockchainSnapshot(ethereum, env);
        env.CUSTOM_VARIABLES = {};
        const part = extractBootstrapPart(renderUserDataText(env));
        expect(part).toContain("SNAPSHOT_PROVIDER='blockchain-snapshots'");
        expect(part).toContain("SNAPSHOT_ID='ethereum-mainnet-geth'");
    });

    it('renders empty snapshot values when they are absent from the environment', () => {
        const env = snapshotEnv('ethereum', '.env-mainnet-geth-lighthouse-full', { SNAPSHOT_ENABLED: false });
        delete env.SNAPSHOT_PROVIDER;
        env.CUSTOM_VARIABLES = {};
        const part = extractBootstrapPart(renderUserDataText(env));
        expect(part).toContain("SNAPSHOT_PROVIDER='blueprint'");
        expect(part).toContain("SNAPSHOT_ID=''");
    });
});

/**
 * The endpoint check runs against looked-up context, so these tests provide
 * the VPC and Availability Zone lookups (as the CI synth step does) and, when
 * a case needs it, the Cloud Control endpoint lookup.
 */
describe('S3 gateway endpoint check and IAM', () => {
    const ethereum = loader.loadProtocolConfig('ethereum');

    const VPC_CONTEXT = {
        [`vpc-provider:account=${ACCOUNT}:filter.isDefault=true:region=${REGION}:returnAsymmetricSubnets=true`]: {
            vpcId: 'vpc-0abc',
            vpcCidrBlock: '172.31.0.0/16',
            ownerAccountId: ACCOUNT,
            availabilityZones: [],
            subnetGroups: [{
                name: 'Public',
                type: 'Public',
                subnets: [
                    { subnetId: 'subnet-a', cidr: '172.31.0.0/20', availabilityZone: 'us-east-1a', routeTableId: 'rtb-a' },
                    { subnetId: 'subnet-b', cidr: '172.31.16.0/20', availabilityZone: 'us-east-1b', routeTableId: 'rtb-b' },
                    { subnetId: 'subnet-c', cidr: '172.31.32.0/20', availabilityZone: 'us-east-1c', routeTableId: 'rtb-c' },
                ],
            }],
        },
        [`availability-zones:account=${ACCOUNT}:region=${REGION}`]: ['us-east-1a', 'us-east-1b', 'us-east-1c'],
    };

    type Mode = 'single' | 'ha';
    const SAMPLES: Record<Mode, string> = {
        single: '.env-mainnet-geth-lighthouse-full',
        ha: '.env-mainnet-geth-lighthouse-full-ha',
    };

    function build(mode: Mode, context: Record<string, unknown>, overrides: Partial<EnvironmentConfig> = {}) {
        const app = new cdk.App({ context: { ...VPC_CONTEXT, ...context } });
        const stack = new cdk.Stack(app, 'TestStack', { env: { account: ACCOUNT, region: REGION } });
        const environment = snapshotEnv('ethereum', SAMPLES[mode], overrides);
        const deploymentConfig: DeploymentConfig = { protocol: ethereum as ProtocolConfig, environment };
        const props = { protocolConfig: ethereum, deploymentConfig, userDataScriptPath: USER_DATA_SCRIPT };
        if (mode === 'single') {
            new SingleNodeConstruct(stack, 'Node', props);
        } else {
            new HANodesConstruct(stack, 'Nodes', props);
        }
        return { app, stack };
    }

    /** The context key of the endpoint lookup, as reported missing by a first synthesis. */
    function endpointLookupKey(mode: Mode): string {
        const { app } = build(mode, {});
        const missing = app.synth().manifest.missing ?? [];
        const lookups = missing.filter(m => m.provider === 'cc-api-provider');
        expect(lookups).toHaveLength(1);
        expect(lookups[0].props).toMatchObject({
            typeName: 'AWS::EC2::VPCEndpoint',
            propertyMatch: { VpcId: 'vpc-0abc', ServiceName: 'com.amazonaws.us-east-1.s3', VpcEndpointType: 'Gateway' },
        });
        return lookups[0].key;
    }

    function withEndpoints(mode: Mode, endpoints: unknown[], overrides: Partial<EnvironmentConfig> = {}) {
        return build(mode, { [endpointLookupKey(mode)]: endpoints }, overrides);
    }

    it('requests the endpoint lookup on the first synthesis without failing', () => {
        expect(() => endpointLookupKey('single')).not.toThrow();
    });

    it('fails synthesis with remediation when the VPC has no S3 gateway endpoint', () => {
        expect(() => withEndpoints('single', [])).toThrow(
            /VPC vpc-0abc has no Amazon S3 gateway endpoint \(com\.amazonaws\.us-east-1\.s3\)[\s\S]*npx cdk context --reset 'cc-api-provider:/);
    });

    it('single-node: needs only the route table of the subnet in the chosen AZ', () => {
        // The chosen AZ is the second one (us-east-1b) unless AWS_AZ is set.
        expect(() => withEndpoints('single', [{ Identifier: 'vpce-1', RouteTableIds: ['rtb-b'] }])).not.toThrow();
        expect(() => withEndpoints('single', [{ Identifier: 'vpce-1', RouteTableIds: ['rtb-a'] }])).toThrow(
            /vpce-1 in VPC vpc-0abc are not associated with route table\(s\) rtb-b of subnet\(s\) subnet-b/);
        expect(() => withEndpoints('single', [{ Identifier: 'vpce-1', RouteTableIds: ['rtb-a'] }],
            { AWS_AZ: 'us-east-1a' })).not.toThrow();
    });

    it('ha-nodes: needs the route tables of every public subnet', () => {
        expect(() => withEndpoints('ha', [{ Identifier: 'vpce-1', RouteTableIds: ['rtb-a', 'rtb-b'] }])).toThrow(
            /route table\(s\) rtb-c of subnet\(s\) subnet-c/);
        expect(() => withEndpoints('ha', [
            { Identifier: 'vpce-1', RouteTableIds: ['rtb-a', 'rtb-b'] },
            { Identifier: 'vpce-2', RouteTableIds: ['rtb-c'] },
        ])).not.toThrow();
    });

    it.each(['single', 'ha'] as Mode[])('%s: grants read on the Region snapshot bucket only', (mode) => {
        const { stack } = withEndpoints(mode, [{ Identifier: 'vpce-1', RouteTableIds: ['rtb-a', 'rtb-b', 'rtb-c'] }]);
        const template = Template.fromStack(stack);
        template.hasResourceProperties('AWS::IAM::Policy', {
            PolicyDocument: {
                Statement: Match.arrayWith([
                    { Effect: 'Allow', Action: 's3:ListBucket', Resource: 'arn:aws:s3:::blockchain-snapshots-us-east-1' },
                    { Effect: 'Allow', Action: 's3:GetObject', Resource: 'arn:aws:s3:::blockchain-snapshots-us-east-1/*' },
                ]),
            },
        });
    });

    it('without the provider: no endpoint lookup and no snapshot bucket access', () => {
        const { app, stack } = build('single', {}, { SNAPSHOT_PROVIDER: SnapshotProvider.BLUEPRINT });
        expect((app.synth().manifest.missing ?? []).filter(m => m.provider === 'cc-api-provider')).toEqual([]);
        const policies = JSON.stringify(Template.fromStack(stack).findResources('AWS::IAM::Policy'));
        expect(policies).not.toContain('blockchain-snapshots-');
    });
});

describe('Blockchain Snapshots on AWS blueprint wiring', () => {
    const solanaConfigs = path.join(BLUEPRINTS, 'solana/configurations');

    it.each(fs.readdirSync(solanaConfigs).filter(f => f.startsWith('frankendancer-')))(
        '%s sets snapshot_fetch = false only after a restore, until the first start completes', (file) => {
            const script = fs.readFileSync(path.join(solanaConfigs, file), 'utf-8');
            expect(script).toContain(
                'if [ -f /data/data/ledger.snapshot-restored ] && [ ! -f /data/data/init-completed ]; then\n' +
                '    SNAPSHOT_FETCH="false"');
            expect(script).toMatch(/\[consensus\]\n(.*\n)*    snapshot_fetch = \$\{SNAPSHOT_FETCH\}\n/);
        });

    it.each(fs.readdirSync(solanaConfigs).filter(f => f.startsWith('agave-')))(
        '%s starts with --no-snapshot-fetch only after a restore, until the first start completes', (file) => {
            const script = fs.readFileSync(path.join(solanaConfigs, file), 'utf-8');
            expect(script).toContain(
                'if [ -f /data/data/ledger.snapshot-restored ] && [ ! -f /data/data/init-completed ]; then\n' +
                '    SNAPSHOT_FETCH_FLAG="--no-snapshot-fetch"');
            expect(script).toMatch(/exec \/home\/bcuser\/bin\/agave-validator \\\n(.*\\\n)*    \$\{SNAPSHOT_FETCH_FLAG\} \\\n/);
        });

    it.each([
        ['ethereum', '"$SNAPSHOT_OUT"'],
        ['solana', '"$LEDGER"'],
    ])('%s node.sh restores into %s only for the blockchain-snapshots provider', (protocol, out) => {
        const script = fs.readFileSync(path.join(BLUEPRINTS, protocol, 'user-data/node.sh'), 'utf-8');
        expect(script).toMatch(/if \[ "\$SNAPSHOT_ENABLED" = "true" \] && \[ "\$\{?SNAPSHOT_PROVIDER(:-)?\}?" = "blockchain-snapshots" \]; then/);
        expect(script).toContain(`bash /opt/assets/common/blockchain-snapshots.sh ${out}`);
    });

    // Verified on mainnet-beta: with the snapshot set's genesis.tar.bz2 but no
    // genesis.bin, Agave never fetches genesis and retries forever.
    it('solana node.sh removes the restored genesis archive unless genesis.bin exists', () => {
        const script = fs.readFileSync(path.join(BLUEPRINTS, 'solana/user-data/node.sh'), 'utf-8');
        expect(script).toContain('LEDGER=/data/data/ledger\n');
        expect(script).toContain(
            '    if [ ! -f "$LEDGER/genesis.bin" ]; then\n' +
            '        rm -f "$LEDGER/genesis.tar.bz2"\n');
    });

    // The snapshots' root is the client's database directory (verified
    // against the ethPandaOps-built manifests), so the output directory
    // depends on the client. Every mapped configuration needs a case.
    it('ethereum node.sh picks the database directory of every mapped client', () => {
        const script = fs.readFileSync(path.join(BLUEPRINTS, 'ethereum/user-data/node.sh'), 'utf-8');
        expect(script).toContain('geth-*) SNAPSHOT_OUT=/data/execution/geth ;;');
        expect(script).toContain('nethermind-*) SNAPSHOT_OUT=/data/execution/nethermind_db ;;');
        expect(script).toContain('reth-*) SNAPSHOT_OUT=/data/execution ;;');
        const ethereum = loader.loadProtocolConfig('ethereum');
        for (const c of ethereum.availableConfigurations.filter(c => c.blockchainSnapshots)) {
            expect(['geth', 'nethermind', 'reth']).toContain(c.name.split('-')[0]);
        }
    });
});
