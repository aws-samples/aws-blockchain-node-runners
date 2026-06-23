// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as path from 'path';
import { 
    IUserDataManager, 
    EnvironmentConfig, 
    CFNandCDKUserDataConfig
} from '../interfaces';
import * as cdk from "aws-cdk-lib";

/**
 * UserDataManager handles loading and processing of user data scripts for EC2 instances.
 * 
 * This class is responsible for:
 * - Loading the universal user data script template from assets/common/
 * - Injecting deployment-specific variables into the script template
 * - Generating complete user data scripts ready for EC2 instance deployment
 * 
 * Variable placeholders in the template use the format ${VARIABLE_NAME} and are
 * replaced with actual values during script generation.
 */
export class UserDataManager implements IUserDataManager {
    private readonly userDataScriptPath: string;

    /**
     * Creates a new UserDataManager instance.
     * 
     * @param userDataScriptPath - Full path to user-data script inside assetsPath (defaults to '$(pwd)/assets/common/user-data-ubuntu.sh')
     */
    constructor(userDataScriptPath?: string) {
        const defaultAssetsPath = path.join(process.cwd(), 'assets', 'common');
        const defaultUserDataScriptFileName = 'user-data-ubuntu.sh';
        const defaultUserDataScriptPath = path.join(defaultAssetsPath, defaultUserDataScriptFileName);

        this.userDataScriptPath = userDataScriptPath ? userDataScriptPath : defaultUserDataScriptPath;
        if (!fs.existsSync(this.userDataScriptPath)) {
            throw new Error(`User data script not found: ${this.userDataScriptPath}`);
        }
    }

    /**
     * Inject variables into a user data script template.
     * 
     * Variables in the template are expected to be in the format ${VARIABLE_NAME}
     * and will be replaced with the corresponding values from the variables object.
     * 
     * @param userDataScript - The script template with variable placeholders
     * @param environment - An object containing EnvironmentConfig
     * @param cfnandCDKUserDataConfig - An object containing CFNandCDKUserDataConfig objects
     * @returns The script with variables injected as stringified values of 1-s level parameters of the original objects
     */
    injectVariables(userDataScript: string, environment: EnvironmentConfig, cfnandCDKUserDataConfig: CFNandCDKUserDataConfig): string {

        const variables: { [key: string]: string } = {};
        
        // Extract nested JSON objects from environment
        const { HA_CONFIG, DATA_VOLUMES, CUSTOM_VARIABLES, ...environmentOnlyConfig } = environment;
        
        // Flatten DATA_VOLUMES array into individual environment variables as
        // single-quoted KEY='value' lines (safe to write and to source).
        let flattenedDataVolumes = '';
        if (DATA_VOLUMES && Array.isArray(DATA_VOLUMES)) {
            DATA_VOLUMES.forEach((volume, index) => {
                const volNum = index + 1;
                flattenedDataVolumes += this.formatEnvLine(`DATA_VOL_${volNum}_TYPE`, volume.TYPE || '');
                flattenedDataVolumes += this.formatEnvLine(`DATA_VOL_${volNum}_SIZE`, String(volume.SIZE ?? ''));
                flattenedDataVolumes += this.formatEnvLine(`DATA_VOL_${volNum}_FILESYSTEM`, volume.FILESYSTEM || 'ext4');
                flattenedDataVolumes += this.formatEnvLine(`DATA_VOL_${volNum}_MOUNT_PATH`, volume.MOUNT_PATH || '');
                flattenedDataVolumes += this.formatEnvLine(`DATA_VOL_${volNum}_DEVICE_NAME`, volume.DEVICE_NAME || '');
                if (volume.IOPS) {
                    flattenedDataVolumes += this.formatEnvLine(`DATA_VOL_${volNum}_IOPS`, String(volume.IOPS));
                }
                if (volume.THROUGHPUT) {
                    flattenedDataVolumes += this.formatEnvLine(`DATA_VOL_${volNum}_THROUGHPUT`, String(volume.THROUGHPUT));
                }
            });
        }
        
        // Flatten CUSTOM_VARIABLES object into single-quoted KEY='value' lines.
        // Keys are operator-controlled (from .env), so they are validated as
        // shell identifiers and values are single-quote-escaped.
        let flattenedCustomVars = '';
        if (CUSTOM_VARIABLES && typeof CUSTOM_VARIABLES === 'object') {
            for (const [key, value] of Object.entries(CUSTOM_VARIABLES)) {
                flattenedCustomVars += this.formatEnvLine(key, value);
            }
        }
        
        // Replace placeholders in the user data script
        userDataScript = userDataScript.replace('##FLATTENED_DATA_VOLUMES##', flattenedDataVolumes.trimEnd());
        userDataScript = userDataScript.replace('##FLATTENED_CUSTOM_VARIABLES##', flattenedCustomVars.trimEnd());
        
        // Merge all configs for the remaining ${...} placeholders. Each value is
        // single-quote-escaped because user-data-ubuntu.sh wraps every
        // placeholder as '${KEY}', so the rendered file contains KEY='value'
        // and the shell never expands the value (at write time or on source).
        for (const [key, value] of Object.entries({ 
            ...environmentOnlyConfig, 
            ...cfnandCDKUserDataConfig, 
            ...HA_CONFIG
        })) {
            let stringValue: string;
            if (typeof value === 'string') {
                stringValue = value;
            } else if (value === null || value === undefined) {
                stringValue = '';
            } else if (typeof value === 'object') {
                stringValue = JSON.stringify(value);
            } else {
                stringValue = String(value);
            }
            this.assertSafeValue(key, stringValue);
            variables[key] = this.escapeForSingleQuotes(stringValue);
        }
        
        const processedUserData = cdk.Fn.sub(userDataScript, variables);
        return processedUserData;
    }

    /**
     * Build a single safe environment-file line: `KEY='value'` (newline
     * terminated). The key must be a valid shell identifier and the value is
     * single-quote-escaped, so neither writing nor sourcing the file expands or
     * executes it.
     */
    private formatEnvLine(key: string, value: string): string {
        this.assertValidKey(key);
        this.assertSafeValue(key, value);
        return `${key}='${this.escapeForSingleQuotes(value)}'\n`;
    }

    /**
     * Ensure an environment variable name is a valid POSIX shell identifier.
     * Anything else cannot be assigned/sourced safely and is rejected at synth.
     */
    private assertValidKey(key: string): void {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
            throw new Error(
                `Invalid environment variable name '${key}': names must match ` +
                `^[A-Za-z_][A-Za-z0-9_]*$ (letters, digits and underscore; not starting with a digit).`
            );
        }
    }

    /**
     * Reject values that cannot be represented safely on a single quoted line.
     * Newlines/carriage returns would inject extra lines into /etc/cdk_environment
     * and a null byte is invalid in shell. All other characters (including
     * quotes, $, backticks, &, ;, spaces, URLs with query strings) are made safe
     * by single-quote escaping.
     */
    private assertSafeValue(key: string, value: string): void {
        if (/[\r\n\0]/.test(value)) {
            throw new Error(
                `Invalid value for environment variable '${key}': values must not contain ` +
                `newlines or null bytes.`
            );
        }
    }

    /**
     * Escape a string for safe placement inside single quotes in a POSIX shell.
     * Each single quote is replaced with the sequence '\'' (close quote, an
     * escaped literal quote, reopen quote) — the standard shell idiom.
     */
    private escapeForSingleQuotes(value: string): string {
        return value.replace(/'/g, "'\\''");
    }

    /**
     * Load the universal user data script from the assets directory.
     * 
     * The universal script is located at assets/common/user-data-ubuntu.sh and contains
     * placeholders for deployment-specific variables that will be injected at deployment time.
     * 
     * @returns The universal user data script content as a string
     * @throws Error if the script file cannot be found or read
     */
    loadUserDataScript(): string {
        if (!fs.existsSync(this.userDataScriptPath)) {
            throw new Error(`Universal user data script not found at: ${this.userDataScriptPath}`);
        }

        try {
            return fs.readFileSync(this.userDataScriptPath, 'utf-8');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to read universal user data script: ${errorMessage}`);
        }
    }

    /**
     * Get the path to the universal user data script.
     * 
     * @returns The path to the universal user data script
     */
    getuserDataScriptPath(): string {
        return this.userDataScriptPath;
    }
}
