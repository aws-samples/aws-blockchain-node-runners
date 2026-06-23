// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { EnvironmentConfig, CFNandCDKUserDataConfig } from '../interfaces';

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
export interface IUserDataManager {

    /**
     * Inject variables into a user data script template.
     * 
     * Variables in the template are expected to be in the format ${VARIABLE_NAME}
     * and will be replaced with the corresponding values from the variables object.
     * 
     * @param script - The script template with variable placeholders
     * @param environment - An object containing EnvironmentConfig
     * @param cfnandCDKUserDataConfig - An object containing CFNandCDKUserDataConfig objects
     * @returns The script with variables injected
     */
    injectVariables(script: string, environment: EnvironmentConfig, cfnandCDKUserDataConfig: CFNandCDKUserDataConfig): string;

    /**
     * Load the universal user data script from the assets directory.
     * 
     * The universal script is located at assets/common/user-data-ubuntu.sh and contains
     * placeholders for deployment-specific variables that will be injected at deployment time.
     * 
     * @returns The universal user data script content as a string
     * @throws Error if the script file cannot be found or read
     */
    loadUserDataScript(): string;

    /**
     * Get the path to the universal user data script.
     * 
     * @returns The path to the universal user data script
     */
    getuserDataScriptPath(): string;
}
