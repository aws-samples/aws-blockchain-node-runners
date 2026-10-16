// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as path from 'path';
import { ConfigurationLoader } from '../../../lib/core/configuration-loader';
import { UserDataManager, USER_DATA_BOOTSTRAP_FILENAME, USER_DATA_MIME_BOUNDARY } from '../../../lib/core/user-data-manager';
import { CFNandCDKUserDataConfig, EnvironmentConfig } from '../../../lib/interfaces';

export const BLUEPRINTS_PATH = path.join(__dirname, '../../../blueprints');
export const USER_DATA_SCRIPT = path.join(__dirname, '../../../assets/common/user-data-ubuntu.sh');
export const DUMMY_SINGLE_NODE_ENV = path.join(BLUEPRINTS_PATH, 'dummy/samples/.env-mainnet-single-node');

/** Representative values for the CDK-provided (token) variables. */
export const SAMPLE_CFN_CONFIG: CFNandCDKUserDataConfig = {
    STACK_NAME: 'dummy-mainnet-single-node-stack',
    LOGICAL_RESOURCE_ID: 'SingleNodesinglenode5C10AEE9',
    ASG_NAME: 'none',
    LIFECYCLE_HOOK_NAME: 'none',
    COMMON_ASSETS_S3_PATH: 's3://cdk-hnb659fds-assets-123456789012-us-east-1/' + 'a'.repeat(64) + '.zip',
    PROTOCOL_ASSETS_S3_PATH: 's3://cdk-hnb659fds-assets-123456789012-us-east-1/' + 'b'.repeat(64) + '.zip',
    SNAPSHOT_STAGING_VOL_ID: 'none',
};

/**
 * Load a sample .env the way the app does: CUSTOM_VARIABLES holds only the
 * blueprint's prefixed variables (loadEnvironmentConfig alone, without a
 * protocol config, also copies generic keys such as CLIENT_CONFIG there).
 */
export function loadDummyEnvironment(envPath: string = DUMMY_SINGLE_NODE_ENV, protocol = 'dummy'): EnvironmentConfig {
    const loader = new ConfigurationLoader(BLUEPRINTS_PATH);
    const env = loader.loadEnvironmentConfig(envPath);
    const prefix = loader.loadProtocolConfig(protocol).customEnvVarsNamePrefix;
    env.CUSTOM_VARIABLES = Object.fromEntries(
        Object.entries(env.CUSTOM_VARIABLES ?? {}).filter(([key]) => key.startsWith(`${prefix}_`)));
    return env;
}

/**
 * Render user data exactly as an instance receives it from IMDS: resolve the
 * Fn::Sub token and perform CloudFormation's substitution (including the
 * `${!Literal}` escape).
 */
export function renderUserDataText(env: EnvironmentConfig, cfn: CFNandCDKUserDataConfig = SAMPLE_CFN_CONFIG): string {
    const token = new UserDataManager(USER_DATA_SCRIPT).renderUserData(env, cfn);
    return resolveFnSub(token);
}

export function resolveFnSub(token: string): string {
    const resolved: any = new cdk.Stack(new cdk.App(), 'ResolveStack').resolve(token);
    const [body, vars] = resolved['Fn::Sub'] as [string, Record<string, string>];
    return body.replace(/\$\{(!?)([A-Za-z0-9_]+)\}/g, (_m, bang: string, name: string) => {
        if (bang) {
            return '${' + name + '}';
        }
        if (!(name in vars)) {
            throw new Error(`Fn::Sub reference to unknown variable ${name}`);
        }
        return vars[name];
    });
}

/** The bootstrap script part of a rendered MIME user data. */
export function extractBootstrapPart(userData: string): string {
    const header = `Content-Disposition: attachment; filename="${USER_DATA_BOOTSTRAP_FILENAME}"\n\n`;
    const start = userData.indexOf(header);
    const end = userData.lastIndexOf(`\n--${USER_DATA_MIME_BOUNDARY}--`);
    if (start < 0 || end < 0) {
        throw new Error('bootstrap part not found');
    }
    return userData.substring(start + header.length, end) + '\n';
}
