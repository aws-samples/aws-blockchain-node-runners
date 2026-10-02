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
import { Construct } from "constructs";

/** EC2 limit on raw (pre-base64) user data. */
export const USER_DATA_MAX_BYTES = 16384;
/** Above this rendered size, synth adds a warning so growth is noticed early. */
export const USER_DATA_WARN_BYTES = 15000;
/**
 * Upper bound used for a CloudFormation token (e.g. an asset S3 URL or a
 * logical ID) when estimating the rendered user data size at synth time.
 */
const TOKEN_SIZE_ESTIMATE = 128;
/** MIME boundary of the per-boot user data wrapper. */
export const USER_DATA_MIME_BOUNDARY = '==NODE-RUNNER-BOUNDARY==';
/** File name cloud-init gives the bootstrap in /var/lib/cloud/scripts/per-boot/. */
export const USER_DATA_BOOTSTRAP_FILENAME = 'node-runner-bootstrap.sh';

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
        const { template, variables } = this.prepare(userDataScript, environment, cfnandCDKUserDataConfig);
        return cdk.Fn.sub(template, variables);
    }

    /**
     * Render the complete instance user data: the bootstrap script with
     * variables injected, full-line comments removed (to save space), wrapped
     * in a MIME part of type text/x-shellscript-per-boot so cloud-init runs it
     * on every boot (see issue #340 and assets/common/user-data-ubuntu.sh).
     *
     * Fails synthesis if the rendered user data would exceed the EC2 16 KB
     * limit (otherwise the deploy fails late, at instance launch), and adds a
     * warning to `scope` above USER_DATA_WARN_BYTES.
     */
    renderUserData(environment: EnvironmentConfig, cfnandCDKUserDataConfig: CFNandCDKUserDataConfig, scope?: Construct): string {
        const prepared = this.prepare(this.loadUserDataScript(), environment, cfnandCDKUserDataConfig);
        const template = UserDataManager.wrapPerBootMultipart(UserDataManager.stripCommentLines(prepared.template));

        const estimatedBytes = UserDataManager.estimateRenderedBytes(template, prepared.variables);
        if (estimatedBytes > USER_DATA_MAX_BYTES) {
            throw new Error(
                `Rendered user data is about ${estimatedBytes} bytes, over the EC2 limit of ` +
                `${USER_DATA_MAX_BYTES} bytes. Reduce the size or number of .env values ` +
                `(e.g. CUSTOM_VARIABLES).`
            );
        }
        if (scope && estimatedBytes > USER_DATA_WARN_BYTES) {
            cdk.Annotations.of(scope).addWarningV2('node-runners:userDataSize',
                `Rendered user data is about ${estimatedBytes} of ${USER_DATA_MAX_BYTES} bytes allowed by EC2.`);
        }
        return cdk.Fn.sub(template, prepared.variables);
    }

    /**
     * Remove full-line shell comments (keeping the shebang). Runs after the
     * ##FLATTENED_*## placeholders have been replaced, so it never removes a
     * KEY='value' line.
     */
    static stripCommentLines(script: string): string {
        return script
            .split('\n')
            .filter(line => !/^\s*#(?!!)/.test(line))
            .join('\n');
    }

    /** Wrap a script in a single-part MIME message of type text/x-shellscript-per-boot. */
    static wrapPerBootMultipart(script: string): string {
        const b = USER_DATA_MIME_BOUNDARY;
        return [
            `Content-Type: multipart/mixed; boundary="${b}"`,
            'MIME-Version: 1.0',
            '',
            `--${b}`,
            'Content-Type: text/x-shellscript-per-boot; charset="us-ascii"',
            'MIME-Version: 1.0',
            'Content-Transfer-Encoding: 7bit',
            `Content-Disposition: attachment; filename="${USER_DATA_BOOTSTRAP_FILENAME}"`,
            '',
            script.replace(/\n+$/, ''),
            `--${b}--`,
            '',
        ].join('\n');
    }

    /**
     * Estimate the byte size of an Fn::Sub template after CloudFormation
     * substitutes the variables. Unresolved tokens count as TOKEN_SIZE_ESTIMATE.
     */
    static estimateRenderedBytes(template: string, variables: { [key: string]: string }): number {
        const tokenPattern = /\$\{Token\[[^\]]+\]\}/g;
        const sizeOf = (text: string) =>
            Buffer.byteLength(text.replace(tokenPattern, 'x'.repeat(TOKEN_SIZE_ESTIMATE)), 'utf-8');
        let total = sizeOf(template);
        for (const [key, value] of Object.entries(variables)) {
            const occurrences = template.split('${' + key + '}').length - 1;
            total += occurrences * (sizeOf(value) - Buffer.byteLength('${' + key + '}'));
        }
        return total;
    }

    private prepare(userDataScript: string, environment: EnvironmentConfig, cfnandCDKUserDataConfig: CFNandCDKUserDataConfig): { template: string; variables: { [key: string]: string } } {

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
        
        return { template: userDataScript, variables };
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
