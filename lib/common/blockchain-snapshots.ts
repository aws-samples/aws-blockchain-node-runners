// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * CDK side of SNAPSHOT_PROVIDER=blockchain-snapshots (Blockchain Snapshots on
 * AWS, https://awslabs.github.io/blockchain-snapshots/). The instance side is
 * assets/common/blockchain-snapshots.sh.
 *
 * The snapshot buckets are reachable only through an Amazon S3 gateway VPC
 * endpoint. The endpoint is a prerequisite the stack does not create, so
 * synthesis fails when the target VPC has none on the instances' subnets.
 */

import * as cdk from "aws-cdk-lib";
import * as constructs from "constructs";
import * as cxschema from "aws-cdk-lib/cloud-assembly-schema";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import { BlockchainSnapshotsBucketPrefix } from "../interfaces";

/** VPC ID Vpc.fromLookup returns before the real lookup has run. */
const DUMMY_LOOKUP_VPC_ID = "vpc-12345";
/** Marks the placeholder result returned before the endpoint lookup has run. */
const DUMMY_ENDPOINT_ID = "pending-s3-gateway-endpoint-lookup";

interface EndpointLookupResult {
    Identifier: string;
    RouteTableIds?: string[];
}

/**
 * Grant read access to this Region's snapshot bucket: ListBucket for the
 * catalog and size checks, GetObject for the snapshot data.
 */
export function grantBlockchainSnapshotsRead(role: iam.IRole, region: string): void {
    const bucketArn = `arn:aws:s3:::${BlockchainSnapshotsBucketPrefix}${region}`;
    role.addToPrincipalPolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:ListBucket"],
        resources: [bucketArn],
    }));
    role.addToPrincipalPolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject"],
        resources: [`${bucketArn}/*`],
    }));
}

/**
 * Fail synthesis unless an S3 gateway endpoint in `vpc` is associated with
 * the route table of every subnet in `subnets`.
 *
 * Uses the Cloud Control context provider, so the result is cached in
 * cdk.context.json like any other lookup.
 */
export function assertS3GatewayEndpoint(scope: constructs.Construct, vpc: ec2.IVpc, subnets: ec2.ISubnet[]): void {
    if (cdk.Token.isUnresolved(vpc.vpcId)) {
        throw new Error(
            "SNAPSHOT_PROVIDER=blockchain-snapshots needs a VPC that is looked up at synth " +
            "(the default VPC or Vpc.fromLookup), so the stack can check it has an S3 gateway endpoint."
        );
    }
    // The VPC lookup has not run yet; check again on the next synthesis pass.
    if (vpc.vpcId === DUMMY_LOOKUP_VPC_ID) {
        return;
    }

    const region = cdk.Stack.of(scope).region;
    const serviceName = `com.amazonaws.${region}.s3`;
    const lookup = {
        provider: cxschema.ContextProvider.CC_API_PROVIDER,
        props: {
            typeName: "AWS::EC2::VPCEndpoint",
            propertyMatch: {
                VpcId: vpc.vpcId,
                ServiceName: serviceName,
                VpcEndpointType: "Gateway",
            },
            propertiesToReturn: ["RouteTableIds"],
        },
    };
    const endpoints = cdk.ContextProvider.getValue(scope, {
        ...lookup,
        dummyValue: [{ Identifier: DUMMY_ENDPOINT_ID, RouteTableIds: [] }],
    }).value as EndpointLookupResult[];
    if (endpoints.some(e => e.Identifier === DUMMY_ENDPOINT_ID)) {
        return;
    }

    const routeTableIds = new Set(endpoints.flatMap(e => e.RouteTableIds ?? []));
    const uncovered = subnets.filter(s => !routeTableIds.has(s.routeTable.routeTableId));
    if (uncovered.length === 0) {
        return;
    }

    const cacheKey = cdk.ContextProvider.getKey(scope, lookup).key;
    const routeTables = [...new Set(uncovered.map(s => s.routeTable.routeTableId))].join(", ");
    const subnetIds = uncovered.map(s => s.subnetId).join(", ");
    const problem = endpoints.length === 0
        ? `VPC ${vpc.vpcId} has no Amazon S3 gateway endpoint (${serviceName}).`
        : `The S3 gateway endpoint(s) ${endpoints.map(e => e.Identifier).join(", ")} in VPC ${vpc.vpcId} ` +
          `are not associated with route table(s) ${routeTables} of subnet(s) ${subnetIds}.`;
    throw new Error(
        `SNAPSHOT_PROVIDER=blockchain-snapshots: ${problem}\n` +
        `Blockchain Snapshots on AWS buckets are reachable only through an S3 gateway endpoint ` +
        `in the target VPC. Create one, or update an existing one, so that it is associated with ` +
        `route table(s) ${routeTables} (used by subnet(s) ${subnetIds}). Then clear the cached ` +
        `lookup and synthesize again:\n` +
        `  npx cdk context --reset '${cacheKey}'\n` +
        `See docs/blockchain-snapshots.md.`
    );
}
