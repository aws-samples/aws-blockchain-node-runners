import { UserData } from 'aws-cdk-lib/aws-ec2';
import { EC2_CONFIG_DIR, ECS_CONFIG_PATH } from '../constants/ecs';
import { getCWAgentConfig, getOtelConfig } from '../constants/metrics';
import { NodeType } from '../constants/node-type';
import * as fs from 'fs';

const validatorHealthCheckScript = fs.readFileSync('lib/helper/validator-health-check.sh', 'utf8').replace(/\$/g, '\\$');

const readNodeHealthCheckScript = fs.readFileSync('lib/helper/read-node-health-check.sh', 'utf8').replace(/\$/g, '\\$');

export function getUserData(
  clusterName: string,
  stackName: string,
  region: string,
  asgLogicalId: string,
  nodeType: NodeType
): UserData {
  const scriptParams: Map<string, string> = new Map([
    ['__REGION__', region],
    ['__ASG_ID__', asgLogicalId],
    ['__STACK_NAME__', stackName],
  ]);

  const userData = UserData.forLinux();
  // Userdata is run as root so sudo is not required.
  userData.addCommands(
    `echo "ECS_CLUSTER=${clusterName}" >> ${ECS_CONFIG_PATH}`,
    `echo "ECS_IMAGE_CLEANUP_INTERVAL=10m" >> ${ECS_CONFIG_PATH}`,
    `echo "ECS_ENGINE_TASK_CLEANUP_WAIT_DURATION=1m" >> ${ECS_CONFIG_PATH}`,
    // Remove any lines that have 'ec2-user'. Prevents sudo for ec2-user.
    `sed --in-place '/ec2-user/d' /etc/sudoers.d/90-cloud-init-users`,
    // Remove insecure services.
    removeService('rpcbind'),
    removeService('sshd'),
    `systemctl daemon-reload && systemctl reset-failed`,
    // Remove networking tools.
    'rm -f `whereis netstat`',
    // Install CloudWatchAgent and AWS Distro for OTel
    `yum install amazon-cloudwatch-agent -y`,
    `echo "Installing AWS OTel Collector" && for i in {1..20}; do rpm -Uvh https://s3.us-east-1.amazonaws.com/aws-otel-collector/amazon_linux/arm64/latest/aws-otel-collector.rpm && break; echo "retrying $i..."; sleep 10; done && rpm -q --last aws-otel-collector`,
    //Create OpenTelemetry config file
    `touch otelConfig.yaml`,
    `chmod 644 otelConfig.yaml`,
    `echo "${getOtelConfig(clusterName)}" >> otelConfig.yaml`,
    //Create CloudWatchAgent config file
    `touch cwAgentConfig.json`,
    `chmod 644 cwAgentConfig.json`,
    `echo '${getCWAgentConfig()}' >> cwAgentConfig.json`,
    // Start CWAgent and OpenTelemetry processes - Default OpenTelemetry config requires 'aoc' user.
    `useradd aoc`,
    `/usr/bin/amazon-cloudwatch-agent-ctl -a fetch-config -c file:cwAgentConfig.json -s`,
    `/opt/aws/aws-otel-collector/bin/aws-otel-collector-ctl -c otelConfig.yaml -a start`,
    // Install CFN signal for rolling updates.
    `yum install -y aws-cfn-bootstrap`,

    // Hack to prevent multi-signalling from causing deployment success.
    `mv /opt/aws/bin/cfn-signal /opt/aws/bin/cfn-signal2`,
    ...installBesuInitCheck(nodeType, scriptParams),

    // cli install needed for cfn-init and patching.
    `yum install -y aws-cli`,
    ...setFileSystemAndKernelHardeningFlags(),
    // Wait for data volume and config to be attached before proceeding. (Happens in launch hook)
    `while [[ ! -d ${EC2_CONFIG_DIR} ]]; do sleep 1; done;`,

    // Wait for key arn file before proceeding.
    `while [[ ! -f ${EC2_CONFIG_DIR}/key.arn ]]; do sleep 1; done;`,

    // TODO : Besu plugin to get private key from secrets manager every time.
    // This will fetch the private key from secrets manager and save it on disk. 
    `aws --region ${region} secretsmanager get-secret-value --secret-id  \`cat ${EC2_CONFIG_DIR}/key.arn\` | jq -r .SecretString > ${EC2_CONFIG_DIR}/key64.priv`,
    `cat ${EC2_CONFIG_DIR}/key64.priv | cut -c 45- | base64 -d | hexdump -v -e '/1 "%02x" ' | head -c 64 > ${EC2_CONFIG_DIR}/key.priv`,
    `rm ${EC2_CONFIG_DIR}/key64.priv`,
    `chown ec2-user ${EC2_CONFIG_DIR}/key.priv`,
    `chmod 700 ${EC2_CONFIG_DIR}/key.priv`
  );
  return userData;
}

function removeService(serviceName: string): string {
  return `systemctl stop ${serviceName} && systemctl disable ${serviceName}`;
}

function parameterizedScript(shellScript: string, paramMap: Map<string, string>) {
  let updatedScript = shellScript;
  for (const [key, value] of paramMap.entries()) {
    updatedScript = updatedScript.replace(key, value as string);
  }
  return updatedScript;
}

function getNodeInitHealthCheck(nodeType: NodeType): string {
  switch (nodeType) {
    case NodeType.VALIDATOR:
      return validatorHealthCheckScript;
    case NodeType.READNODE:
      return readNodeHealthCheckScript;
    default:
      throw new Error(`NodeType: ${nodeType} not supported`);
  }
}

function installBesuInitCheck(nodeType: NodeType, scriptParams: Map<string, string>): string[] {
  return [
    // Install Besu Initialization Check Script
    `yum install -y jq`,
    `cat << EOF > /besu_init_check.sh`,
    ...parameterizedScript(getNodeInitHealthCheck(nodeType), scriptParams).split('\n'),
    `EOF`,
    `chmod +x besu_init_check.sh`,
    // Create a wrapper that runs this script in the background.
    // It's important to have a wrapper to background the init check as cfn-signal
    // will be called after user data finishes by patching constructs.
    `echo "/besu_init_check.sh &" >/besu_init_check_wrapper.sh`,
    `chmod +x /besu_init_check_wrapper.sh`,
    // Symlink the location of the cfn-signal binary to our custom init check.
    // This is a workaround so that patching constructs doesn't signal success
    // to the rolling deployment prematurely.
    `ln /besu_init_check_wrapper.sh /opt/aws/bin/cfn-signal`,
    // Run the script but don't block userdata on it.
    `/besu_init_check.sh &`,
  ];
}

function setFileSystemAndKernelHardeningFlags(): string[] {
  return [
    `cat << EOF > /etc/sysctl.conf`,
    ...kernelHardeningFlags(),
    ...fileSystemHardeningFlags(),
    `EOF`,
    `sysctl --system`,
  ];
}

function kernelHardeningFlags(): string[] {
  return [
    `kernel.unprivileged_bpf_disabled=1`,
    `net.core.bpf_jit_harden=2`,
    `kernel.kptr_restrict=2`,
    `kernel.dmesg_restrict=1`,
    `kernel.kexec_load_disabled=1`,
  ];
}

function fileSystemHardeningFlags(): string[] {
  return [
    `fs.protected_regular = 1`,
    `fs.protected_fifos = 1`,
    `fs.protected_hardlinks = 1`,
    `fs.protected_symlinks = 1`,
  ];
}
