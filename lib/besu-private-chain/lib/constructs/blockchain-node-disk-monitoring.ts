import { Construct } from 'constructs';
import { ComparisonOperator, MathExpression, Metric, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { MonitoringFacade, AlarmFactory, CustomMetricGroup, MetricStatistic } from 'cdk-monitoring-constructs';
import { Duration } from 'aws-cdk-lib';

const defaultBlockchainDiskAlarmThresholds = {
  INODE_UTILIZATION_THRESHOLD: 80,
  DISK_UTILIZATION_THRESHOLD: 80,
};

export interface BlockchainNodeDiskInfo {
  readonly diskName: string; //will appear in alarm name and description
  readonly diskMountPoint: string;
  alarmThresholdInPercentForDiskSpaceUtilization?: number;
  alarmThresholdInPercentForInodeUtilization?: number;
}

export interface BlockchainNodeDiskMonitoringProps {
  readonly stage?: string;
  readonly alarmNamePrefix: string;
  readonly region: string;
  blockchainNodeDisks: BlockchainNodeDiskInfo[];
  blockchainASGName: string;
  diskMetricsNamespace: string;
  monitoringFacade: MonitoringFacade;
}

export class BlockchainNodeDiskMonitoring extends Construct {
  constructor(scope: Construct, id: string, props: BlockchainNodeDiskMonitoringProps) {
    super(scope, id);

    const alarmFactory = props.monitoringFacade.createAlarmFactory(props.alarmNamePrefix);

    this.createDiskMonitoring(props, alarmFactory);
    this.createBlockchainNodeDiskMonitoringDashboard(props);
  }

  private createDiskMonitoring(
    diskMonitoringProps: BlockchainNodeDiskMonitoringProps,
    alarmFactory: AlarmFactory,
  ): void {
    for (const diskInfo of diskMonitoringProps.blockchainNodeDisks) {
      // Alarm will fire if disk usage is greater than 80% every 5 mins for 15 mins.
      alarmFactory.addAlarm(
        this.getDiskUsageInPercentMetric(
          diskInfo.diskMountPoint,
          MetricStatistic.MAX,
          diskMonitoringProps.diskMetricsNamespace,
          diskMonitoringProps.blockchainASGName,
        ),
        {
          alarmDescription: `Alarm indicates disk usage for a disk mounted at: ${diskInfo.diskMountPoint} on a validator has grown beyond an acceptable threshold.`,
          alarmNameSuffix: `DiskUsageAlarm-${diskInfo.diskName}`,
          comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
          datapointsToAlarm: 3,
          evaluationPeriods: 3,
          threshold:
            diskInfo.alarmThresholdInPercentForDiskSpaceUtilization ||
            defaultBlockchainDiskAlarmThresholds.DISK_UTILIZATION_THRESHOLD,
          treatMissingData: TreatMissingData.BREACHING,
        },
      );

      // Alarm will fire if disk inode usage is greater than 80% every 5 mins for 15 mins.
      alarmFactory.addAlarm(
        this.getMaxInodeUsageInPercentMetric(
          diskInfo.diskMountPoint,
          diskMonitoringProps.diskMetricsNamespace,
          diskMonitoringProps.blockchainASGName,
        ),
        {
          alarmDescription: `Alarm indicates inode usage for a disk mounted at: ${diskInfo.diskMountPoint} on a validator has grown beyond an acceptable threshold.`,
          alarmNameSuffix: `DiskInodeUsageAlarm-${diskInfo.diskName}`,
          comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
          datapointsToAlarm: 3,
          evaluationPeriods: 3,
          threshold:
            diskInfo.alarmThresholdInPercentForInodeUtilization ||
            defaultBlockchainDiskAlarmThresholds.INODE_UTILIZATION_THRESHOLD,
          treatMissingData: TreatMissingData.BREACHING,
        },
      );
    }
  }

  private createBlockchainNodeDiskMonitoringDashboard(diskMonitoringProps: BlockchainNodeDiskMonitoringProps): void {
    const diskUtilizationMetricGroups: Array<CustomMetricGroup> = new Array<CustomMetricGroup>();

    for (const diskInfo of diskMonitoringProps.blockchainNodeDisks) {
      diskUtilizationMetricGroups.push({
        title: `${diskInfo.diskName}Utilization`,
        metrics: [
          this.getDiskUsageInPercentMetric(
            diskInfo.diskMountPoint,
            MetricStatistic.AVERAGE,
            diskMonitoringProps.diskMetricsNamespace,
            diskMonitoringProps.blockchainASGName,
          ),
          this.getDiskUsageInPercentMetric(
            diskInfo.diskMountPoint,
            MetricStatistic.MAX,
            diskMonitoringProps.diskMetricsNamespace,
            diskMonitoringProps.blockchainASGName,
          ),
          this.getDiskUsageInPercentMetric(
            diskInfo.diskMountPoint,
            MetricStatistic.MIN,
            diskMonitoringProps.diskMetricsNamespace,
            diskMonitoringProps.blockchainASGName,
          ),
        ],
        horizontalAnnotations: [
          {
            value:
              diskInfo.alarmThresholdInPercentForDiskSpaceUtilization ||
              defaultBlockchainDiskAlarmThresholds.DISK_UTILIZATION_THRESHOLD,
            label: 'DiskUtilizationThreshold',
          },
        ],
        important: true,
      });
    }

    diskMonitoringProps.monitoringFacade.monitorCustom({
      alarmFriendlyName: `DiskMonitoring`,
      metricGroups: diskUtilizationMetricGroups,
    });

    diskMonitoringProps.monitoringFacade.monitorCustom({
      alarmFriendlyName: 'MemoryMonitoring',
      metricGroups: [
        {
          title: 'MemoryUtilization',
          metrics: [
            this.getMemoryUsageInPercentMetric(
              MetricStatistic.MAX,
              diskMonitoringProps.diskMetricsNamespace,
              diskMonitoringProps.blockchainASGName,
            ),
            this.getMemoryUsageInPercentMetric(
              MetricStatistic.AVERAGE,
              diskMonitoringProps.diskMetricsNamespace,
              diskMonitoringProps.blockchainASGName,
            ),
          ],
          important: true,
        },
      ],
    });
  }

  private getDiskUsageInPercentMetric(
    diskMountPath: string,
    statistic: MetricStatistic,
    metricNamespace: string,
    blockchainASGName: string,
  ): Metric {
    return new Metric({
      metricName: 'disk_used_percent',
      statistic: statistic as string,
      label: `${statistic}_disk_usage_${diskMountPath}`,
      dimensionsMap: {
        AutoScalingGroupName: blockchainASGName,
        path: diskMountPath,
      },
      namespace: metricNamespace,
      period: Duration.minutes(5),
    });
  }

  private getMemoryUsageInPercentMetric(
    statistic: MetricStatistic,
    metricNamespace: string,
    blockchainASGName: string,
  ): Metric {
    return new Metric({
      metricName: 'mem_used_percent',
      statistic: statistic as string,
      label: `${statistic}_memory_usage`,
      dimensionsMap: {
        AutoScalingGroupName: blockchainASGName,
      },
      namespace: metricNamespace,
      period: Duration.minutes(5),
    });
  }

  private getMaxInodeUsageInPercentMetric(
    diskMountPath: string,
    metricNamespace: string,
    blockchainASGName: string,
  ): MathExpression {
    return new MathExpression({
      expression: '(m1/m2)*100',
      usingMetrics: {
        m1: this.getMaxUsedInodesMetric(diskMountPath, metricNamespace, blockchainASGName),
        m2: this.getMaxTotalInodesMetric(diskMountPath, metricNamespace, blockchainASGName),
      },
      label: `max_inode_usage_${diskMountPath}`,
      period: Duration.minutes(5),
    });
  }

  private getMaxTotalInodesMetric(diskMountPath: string, metricNamespace: string, blockchainASGName: string): Metric {
    return new Metric({
      metricName: 'disk_inodes_total',
      statistic: MetricStatistic.MAX as string,
      label: `max_disk_inodes_total_${diskMountPath}`,
      dimensionsMap: {
        AutoScalingGroupName: blockchainASGName,
        path: diskMountPath,
      },
      namespace: metricNamespace,
      period: Duration.minutes(5),
    });
  }

  private getMaxUsedInodesMetric(diskMountPath: string, metricNamespace: string, blockchainASGName: string): Metric {
    return new Metric({
      metricName: 'disk_inodes_used',
      statistic: MetricStatistic.MAX as string,
      label: `max_disk_inodes_used_${diskMountPath}`,
      dimensionsMap: {
        AutoScalingGroupName: blockchainASGName,
        path: diskMountPath,
      },
      namespace: metricNamespace,
      period: Duration.minutes(5),
    });
  }
}
