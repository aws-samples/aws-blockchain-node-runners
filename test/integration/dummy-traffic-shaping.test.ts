// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Integration tests for Dummy protocol with traffic shaping
 */

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as path from 'path';
import { ConfigurationLoader } from '../../lib/core/configuration-loader';
import { SingleNodeStack } from '../../lib/stacks/single-node-stack';
import { HANodesStack } from '../../lib/stacks/ha-nodes-stack';
import * as fs from 'fs';

describe('Dummy Protocol Traffic Shaping Integration', () => {
  let app: cdk.App;
  let configLoader: ConfigurationLoader;

  beforeEach(() => {
    app = new cdk.App();
    configLoader = new ConfigurationLoader('blueprints');
  });

  describe('Protocol Configuration', () => {
    it('should have syncchecker.sh script in protocol user-data', () => {
      const syncCheckerPath = path.join('blueprints', 'dummy', 'user-data', 'syncchecker.sh');
      expect(fs.existsSync(syncCheckerPath)).toBe(true);
      
      const content = fs.readFileSync(syncCheckerPath, 'utf-8');
      expect(content).toContain('TRAFFIC_SHAPING_ENABLED');
      expect(content).toContain('TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND');
      expect(content).toContain('systemctl start net-rules.service');
      expect(content).toContain('systemctl stop net-rules.service');
      expect(content).toContain('c1_block_height');
      expect(content).toContain('c1_blocks_behind');
    });
  });

  describe('Environment Configuration', () => {
    it('should parse traffic shaping configuration from .env file', () => {
      const testEnvPath = path.join(__dirname, '../../blueprints/dummy/samples/.env-testnet-ha-nodes');
      const environmentConfig = configLoader.loadEnvironmentConfig(testEnvPath);
      
      expect(environmentConfig.TRAFFIC_SHAPING_ENABLED).toBe(true);
      expect(environmentConfig.TRAFFIC_SHAPING_RATE_MBIT).toBe(40);
      expect(environmentConfig.TRAFFIC_SHAPING_CHECK_INTERVAL_SEC).toBe(60);
      expect(environmentConfig.TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND).toBe(10);
    });

    it('should handle traffic shaping disabled configuration', () => {
      const testEnvPath = path.join(__dirname, '../../blueprints/dummy/samples/.env-mainnet-single-node');
      const environmentConfig = configLoader.loadEnvironmentConfig(testEnvPath);
      
      expect(environmentConfig.TRAFFIC_SHAPING_ENABLED).toBe(false);
      expect(environmentConfig.TRAFFIC_SHAPING_RATE_MBIT).toBe(40);
      expect(environmentConfig.TRAFFIC_SHAPING_CHECK_INTERVAL_SEC).toBe(60);
      expect(environmentConfig.TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND).toBe(10);
    });
  });

  describe('Single Node Stack with Traffic Shaping', () => {
    it('should deploy single-node stack with traffic shaping enabled', () => {
      const protocolConfig = configLoader.loadProtocolConfig('dummy');
      const testEnvPath = path.join(__dirname, '../../blueprints/dummy/samples/.env-mainnet-single-node');
      const environmentConfig = configLoader.loadEnvironmentConfig(testEnvPath);
      
      const deploymentConfig = {
        protocol: protocolConfig,
        environment: environmentConfig
      };

      const userDataScriptPath = path.join(__dirname, '../../assets/common/user-data-ubuntu.sh');

      const stack = new SingleNodeStack(app, 'DummyTrafficShapingSingleNodeStack', {
        env: {
          account: '123456789012',
          region: 'us-east-1'
        },
        deploymentConfig,
        userDataScriptPath
      });

      const template = Template.fromStack(stack);

      // Verify stack synthesizes successfully
      expect(template).toBeDefined();
      
      // Verify EC2 instance is created
      template.resourceCountIs('AWS::EC2::Instance', 1);
    });
  });

  describe('HA Stack with Traffic Shaping', () => {
    it('should deploy HA stack with traffic shaping enabled', () => {
      const protocolConfig = configLoader.loadProtocolConfig('dummy');
      const testEnvPath = path.join(__dirname, '../../blueprints/dummy/samples/.env-testnet-ha-nodes');
      const environmentConfig = configLoader.loadEnvironmentConfig(testEnvPath);
      
      const deploymentConfig = {
        protocol: protocolConfig,
        environment: environmentConfig
      };

      const userDataScriptPath = path.join(__dirname, '../../assets/common/user-data-ubuntu.sh');

      const stack = new HANodesStack(app, 'DummyTrafficShapingHAStack', {
        env: {
          account: '123456789012',
          region: 'us-east-1'
        },
        deploymentConfig,
        userDataScriptPath
      });

      const template = Template.fromStack(stack);

      // Verify stack synthesizes successfully
      expect(template).toBeDefined();
      
      // Verify Auto Scaling Group is created
      template.resourceCountIs('AWS::AutoScaling::AutoScalingGroup', 1);
      
      // Verify ALB is created
      template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
      
      // Verify ASG has correct desired capacity from config
      template.hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
        DesiredCapacity: '3'
      });
    });
  });

  describe('Configuration Script Updates', () => {
    it('should have init-completed file creation in base configuration', () => {
      const baseConfigPath = path.join('blueprints', 'dummy', 'configurations', 'dummy-1.0.0-rpc-base.sh');
      const content = fs.readFileSync(baseConfigPath, 'utf-8');
      
      expect(content).toContain('INIT_COMPLETED_FILE');
      expect(content).toContain('$DATA_DIR/data/init-completed');
      expect(content).toContain('touch "$INIT_COMPLETED_FILE"');
    });

    it('should have init-completed file creation in extended configuration', () => {
      const extendedConfigPath = path.join('blueprints', 'dummy', 'configurations', 'dummy-1.0.0-rpc-extended.sh');
      const content = fs.readFileSync(extendedConfigPath, 'utf-8');
      
      expect(content).toContain('INIT_COMPLETED_FILE');
      expect(content).toContain('$DATA_DIR/data/init-completed');
      expect(content).toContain('touch "$INIT_COMPLETED_FILE"');
    });

    it('should simulate realistic sync behavior in base configuration', () => {
      const baseConfigPath = path.join('blueprints', 'dummy', 'configurations', 'dummy-1.0.0-rpc-base.sh');
      const content = fs.readFileSync(baseConfigPath, 'utf-8');
      
      // Should start with node behind
      expect(content).toContain('c1_blocks_behind=50');
      
      // Should have logic to decrease blocks behind over time
      expect(content).toContain('c1_blocks_behind=$((c1_blocks_behind - RANDOM % 5))');
      
      // Should have state file with sync metrics
      expect(content).toContain('"c1_block_height": $c1_block_height');
      expect(content).toContain('"c1_blocks_behind": $c1_blocks_behind');
    });

    it('should simulate realistic sync behavior in extended configuration', () => {
      const extendedConfigPath = path.join('blueprints', 'dummy', 'configurations', 'dummy-1.0.0-rpc-extended.sh');
      const content = fs.readFileSync(extendedConfigPath, 'utf-8');
      
      // Should start with node behind
      expect(content).toContain('c1_blocks_behind=30');
      
      // Should have logic to decrease blocks behind over time (faster in extended)
      expect(content).toContain('c1_blocks_behind=$((c1_blocks_behind - RANDOM % 8))');
      
      // Should have state file with sync metrics
      expect(content).toContain('"c1_block_height": $c1_block_height');
      expect(content).toContain('"c1_blocks_behind": $c1_blocks_behind');
    });
  });

  describe('Sync Checker Script Validation', () => {
    it('should check for init-completed file before running', () => {
      const syncCheckerPath = path.join('blueprints', 'dummy', 'user-data', 'syncchecker.sh');
      const content = fs.readFileSync(syncCheckerPath, 'utf-8');
      
      expect(content).toContain('INIT_COMPLETED_FILE');
      expect(content).toContain('if [ ! -f "$INIT_COMPLETED_FILE" ]');
      expect(content).toContain('Initial sync not yet complete');
    });

    it('should report metrics to CloudWatch', () => {
      const syncCheckerPath = path.join('blueprints', 'dummy', 'user-data', 'syncchecker.sh');
      const content = fs.readFileSync(syncCheckerPath, 'utf-8');
      
      expect(content).toContain('aws cloudwatch put-metric-data');
      expect(content).toContain('--namespace "CWAgent"');
      expect(content).toContain('--metric-name "c1_block_height"');
      expect(content).toContain('--metric-name "c1_blocks_behind"');
    });

    it('should control traffic shaping based on sync status', () => {
      const syncCheckerPath = path.join('blueprints', 'dummy', 'user-data', 'syncchecker.sh');
      const content = fs.readFileSync(syncCheckerPath, 'utf-8');
      
      // Should enable traffic shaping when synced
      expect(content).toContain('if [ "$c1_blocks_behind" -le 0 ]');
      expect(content).toContain('systemctl start net-rules.service');
      
      // Should disable traffic shaping when behind
      expect(content).toContain('if [ "$c1_blocks_behind" -gt "$TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND" ]');
      expect(content).toContain('systemctl stop net-rules.service');
    });
  });

  describe('Sample Environment Files', () => {
    it('should have traffic shaping configuration in mainnet single-node sample', () => {
      const samplePath = path.join('blueprints', 'dummy', 'samples', '.env-mainnet-single-node');
      const content = fs.readFileSync(samplePath, 'utf-8');
      
      expect(content).toContain('TRAFFIC_SHAPING_ENABLED="false"');
      expect(content).toContain('TRAFFIC_SHAPING_RATE_MBIT="40"');
      expect(content).toContain('TRAFFIC_SHAPING_CHECK_INTERVAL_SEC="60"');
      expect(content).toContain('TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND="10"');
    });

    it('should have traffic shaping enabled in testnet HA sample', () => {
      const samplePath = path.join('blueprints', 'dummy', 'samples', '.env-testnet-ha-nodes');
      const content = fs.readFileSync(samplePath, 'utf-8');
      
      expect(content).toContain('TRAFFIC_SHAPING_ENABLED="true"');
      expect(content).toContain('TRAFFIC_SHAPING_RATE_MBIT="40"');
      expect(content).toContain('TRAFFIC_SHAPING_CHECK_INTERVAL_SEC="60"');
      expect(content).toContain('TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND="10"');
    });
  });
});
