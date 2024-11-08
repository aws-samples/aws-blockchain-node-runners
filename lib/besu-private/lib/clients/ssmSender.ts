import { SSMClient, SendCommandCommand, SendCommandResult } from '@aws-sdk/client-ssm';

// export for unit testing
export const ssmClient = new SSMClient({});

export class SSMSender {
  private queuedCommands: string[];
  private instanceId: string;

  constructor(instanceId: string) {
    this.queuedCommands = ['echo "starting steps"'];
    this.instanceId = instanceId;
  }

  async send(): Promise<SendCommandResult> {
    this.queuedCommands.push('echo "SSM command done."');
    const sendCommandOptions = new SendCommandCommand({
      InstanceIds: [this.instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: this.queuedCommands,
      },
      DocumentVersion: '$DEFAULT',
      CloudWatchOutputConfig: {
        CloudWatchOutputEnabled: true,
      },
    });

    try {
      const sendCommandResult = await ssmClient.send(sendCommandOptions);
      console.log('SSM Result:', sendCommandResult);
      return sendCommandResult;
    } catch (error) {
      console.log('SSM Error:', error);
      throw error;
    }
  }

  uploadFileToInstance(fileName: string, fileContents: string, filePathPrefix: string) {
    this.createDirectoryOnInstance(filePathPrefix);
    this.queuedCommands = this.queuedCommands.concat([
      `echo '${fileContents}' | sudo tee ${filePathPrefix}${fileName}`,
      `echo 'file ${fileName} was uploaded to instance.'`,
    ]);
  }

  mountVolumeToInstance(volumeName: string, mountPoint: string) {
    const mountCommand = `mount -v ${volumeName} ${mountPoint}`;
    this.queuedCommands = this.queuedCommands.concat([
      // Wait until volume is mounted.
      `while [[ -z $(lsblk | grep nvme1n1) ]]; do echo "waiting"; sleep 5; done`,
      // There's a rare case where nvme1n1 appears but ${volumeName}
      // is still not available for a few seconds.
      `sleep 10`,
      // Make file system if the drive has no filesystem.
      `lsblk -f`,
      `if [[ -z $(lsblk -f | grep nvme1n1 | grep xfs) ]]; then mkfs -V -t xfs ${volumeName} && echo "made xfs filesystem"; fi`,
      // Mount the data EBS volume. We want to fail here if mount fails, otherwise
      // blockchain data may start syncing to the root volume.
      `mkdir -p ${mountPoint}`,
      `${mountCommand} || (echo "retrying mount" && sleep 60 && ${mountCommand}) || (echo "mounting failed" && exit 1)`,
      'echo "mounting done"',
      // Add entry in fstab so EBS volume is remounted on reboot.
      `echo "$(xfs_admin -u ${volumeName} | sed 's/ //g') ${mountPoint}  xfs  defaults,nofail  0  2" | sudo tee -a /etc/fstab`,
      `cat /etc/fstab`,
      'echo "fstab done"',
      `chown ec2-user: ${mountPoint}`,
      `chmod 744 ${mountPoint}`,
      `df -h`,
      `ls -lta ${mountPoint}`,
      'echo "volume mount step complete"',
    ]);
  }

  createDirectoryOnInstance(dirPath: string) {
    this.queuedCommands = this.queuedCommands.concat([
      `mkdir -p ${dirPath}`,
      `chown ec2-user: ${dirPath}`,
      `chmod 744 ${dirPath}`,
      `ls -lta ${dirPath}`,
    ]);
  }
}
