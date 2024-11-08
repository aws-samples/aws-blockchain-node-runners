import { Construct } from 'constructs';
import { AlarmFactory, IAlarmActionStrategy, MetricStatistic, MonitoringFacade } from 'cdk-monitoring-constructs';
import { PrivateChainMetricsNameSpace } from '../constants/metrics';
import { Duration } from 'aws-cdk-lib';
import { ComparisonOperator, MathExpression, Metric, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { CLIENT_CONFIG } from '../constants/besu';
import { Disambiguator } from '../constants/monitoring';

export interface BesuMonitoringProps {
  readonly monitoringFacade: MonitoringFacade;
  readonly stage: string;
  readonly alarmNamePrefix: string;
  readonly region: string;
  readonly clusterName: string;
}

const BesuAlarmThresholds = {
  GAS_UTILIZATION_THRESHOLD: 60,
  BLOCK_RATE_SLOWDOWN_THRESHOLD: 10,
  BLOCKCHAIN_HALT_THRESHOLD: 0,
  MIN_VALIDATOR_PEER_COUNT_THRESHOLD: 5,
  VALIDATOR_LAG_THRESHOLD: 1000,
  TRANSACTION_POOL_SIZE_THRESHOLD: CLIENT_CONFIG.MAX_SIZE_OF_TX_POOL * 0.15,
};

export class BesuMonitoring extends Construct {
  constructor(scope: Construct, id: string, props: BesuMonitoringProps) {
    super(scope, id);
    const alarmFactory = props.monitoringFacade.createAlarmFactory(props.alarmNamePrefix);
    this.createBesuMonitoring(
      props.clusterName,
      alarmFactory,
      true,
      undefined
    );
    this.createBesuDashboard(props.monitoringFacade, props.clusterName);
  }

  private createBesuMonitoring(
    clusterName: string,
    alarmFactory: AlarmFactory,
    isAlarmActionEnabled: boolean,
    alarmAction: IAlarmActionStrategy | undefined,
  ): void {
    // Alarm will fire if the block rate drops below 10 blocks per minute 3 times in a 5 minute period.

    alarmFactory.addAlarm(this.getBlockchainBlockRateMetric(clusterName), {
      alarmDescription: 'Alarm indicates a slowdown in the rate at which blocks are being added to the chain.',
      alarmNameSuffix: 'BlockRateSlowdownAlarm',
      comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
      datapointsToAlarm: 3,
      evaluationPeriods: 5,
      threshold: BesuAlarmThresholds.BLOCK_RATE_SLOWDOWN_THRESHOLD,
      treatMissingData: TreatMissingData.BREACHING,
      actionsEnabled: isAlarmActionEnabled,
      actionOverride: alarmAction,
    });

    //Alarm will fire if the block rate drops to 0 for a single datapoint.
    alarmFactory.addAlarm(this.getBlockchainBlockRateMetric(clusterName), {
      alarmDescription: 'Alarm indicates that blocks are no longer being produced in the blockchain.',
      alarmNameSuffix: 'BlockchainHaltAlarm',
      comparisonOperator: ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
      datapointsToAlarm: 1,
      evaluationPeriods: 1,
      threshold: BesuAlarmThresholds.BLOCKCHAIN_HALT_THRESHOLD,
      treatMissingData: TreatMissingData.BREACHING,
      actionsEnabled: isAlarmActionEnabled,
      actionOverride: alarmAction,
    });

    //Alarm will fire if the median peer count drops below 5 for 5 mins.
    alarmFactory.addAlarm(this.getP50PeerCountMetric(clusterName), {
      alarmDescription: 'Alarm indicates that a validator has less peers than expected.',
      alarmNameSuffix: 'peerCountLow',
      comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
      datapointsToAlarm: 5,
      evaluationPeriods: 5,
      threshold: BesuAlarmThresholds.MIN_VALIDATOR_PEER_COUNT_THRESHOLD,
      treatMissingData: TreatMissingData.BREACHING,
      actionsEnabled: isAlarmActionEnabled,
      actionOverride: alarmAction,
    });

    //Alarm will fire if 1 or more validators are more than 1000 blocks behind the top block for 3 mins.
    alarmFactory.addAlarm(this.getBlockchainHeightDifferenceMetric(clusterName), {
      alarmDescription: 'Alarm indicates that 1 or more validators have fallen behind the chain',
      alarmNameSuffix: 'validatorsLaggingAlarm',
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      datapointsToAlarm: 3,
      evaluationPeriods: 3,
      threshold: BesuAlarmThresholds.VALIDATOR_LAG_THRESHOLD,
      treatMissingData: TreatMissingData.BREACHING,
      actionsEnabled: isAlarmActionEnabled,
      actionOverride: alarmAction,
    });

    //Alarm will fire if the avg transaction pool across the shard grows beyond 15000 transactions for 5 mins.
    alarmFactory.addAlarm(this.getAvgTransactionPoolSizeMetric(clusterName), {
      alarmDescription:
        'Alarm indicates that the avg transaction pool size across the cluster has grown beyond the allowed limit.',
      alarmNameSuffix: 'validatorTransactionPoolSizeAlarm',
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      datapointsToAlarm: 5,
      evaluationPeriods: 5,
      threshold: BesuAlarmThresholds.TRANSACTION_POOL_SIZE_THRESHOLD,
      treatMissingData: TreatMissingData.BREACHING,
      actionsEnabled: isAlarmActionEnabled,
      disambiguator: Disambiguator.CRUCIAL,
    });

    //Alarm will fire if the gas utilization in the top block increases beyond 60% for 5 mins.
    alarmFactory.addAlarm(this.getGasUtilizationInTopBlock(clusterName), {
      alarmDescription: 'Alarm indicates that the gas utilization in the top block is high',
      alarmNameSuffix: 'gasUtilizationHighAlarm',
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      datapointsToAlarm: 5,
      evaluationPeriods: 5,
      threshold: BesuAlarmThresholds.GAS_UTILIZATION_THRESHOLD,
      treatMissingData: TreatMissingData.BREACHING,
      actionsEnabled: isAlarmActionEnabled,
      disambiguator: Disambiguator.CRUCIAL,
    });

    //Alarm will fire if read usage is at 60% of capacity.
    alarmFactory.addAlarm(this.getOpenHttpConnections(clusterName), {
      alarmDescription: 'Alarm indicates that read volume for private chain is high.',
      alarmNameSuffix: 'readVolumeHighAlarm',
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      datapointsToAlarm: 1,
      evaluationPeriods: 1,
      // The connections from clients are gated by the number of maximum allowed connections on besu.
      threshold: CLIENT_CONFIG.MAX_CONNECTIONS * 0.6,
      treatMissingData: TreatMissingData.BREACHING,
      actionsEnabled: isAlarmActionEnabled,
      disambiguator: Disambiguator.CRUCIAL,
    });
  }

  private createBesuDashboard(monitoringFacade: MonitoringFacade, clusterName: string): void {
    monitoringFacade.monitorCustom({
      alarmFriendlyName: 'BesuBlockchainMonitoring',
      metricGroups: [
        {
          title: 'BesuBlockchainHeight',
          metrics: [
            this.getMaxBlockchainHeightMetric(clusterName),
            this.getMinBlockchainHeightMetric(clusterName),
            this.getPercentileBlockchainHeightMetric(clusterName, 25),
            this.getPercentileBlockchainHeightMetric(clusterName, 33),
          ],
          important: true,
        },
        {
          title: 'BesuBlockRate',
          metrics: [this.getBlockchainBlockRateMetric(clusterName)],
          horizontalAnnotations: [
            {
              value: BesuAlarmThresholds.BLOCKCHAIN_HALT_THRESHOLD,
              label: 'BlockChainHaltAlarmThreshold',
            },
            {
              value: BesuAlarmThresholds.BLOCK_RATE_SLOWDOWN_THRESHOLD,
              label: 'BlockRateSlowdownAlarmThreshold',
            },
          ],
          important: true,
        },
        {
          title: 'BesuMinPeers',
          metrics: [this.getMinPeerCountMetric(clusterName), this.getP50PeerCountMetric(clusterName)],
          horizontalAnnotations: [
            {
              value: BesuAlarmThresholds.MIN_VALIDATOR_PEER_COUNT_THRESHOLD,
              label: 'MinPeerCountAlarmThreshold',
            },
          ],
          important: true,
        },
        {
          title: 'BesuMaxTransactionPoolSize',
          metrics: [
            this.getMaxTransactionPoolSizeMetric(clusterName),
            this.getAvgTransactionPoolSizeMetric(clusterName),
          ],
          horizontalAnnotations: [
            {
              value: BesuAlarmThresholds.TRANSACTION_POOL_SIZE_THRESHOLD,
              label: 'TransactionPoolSizeAlarmThreshold',
            },
          ],
          important: true,
        },
        {
          title: 'BesuGasUsedInTopBlock',
          metrics: [this.getMaxGasUsedInTopBlockMetric(clusterName), this.getMaxGasLimitPerBlockMetric(clusterName)],
        },
        {
          title: 'MaxTopBlockGasUtilization',
          metrics: [this.getGasUtilizationInTopBlock(clusterName)],
          horizontalAnnotations: [
            {
              value: BesuAlarmThresholds.GAS_UTILIZATION_THRESHOLD,
              label: 'GasUtilizationAlarmThreshold',
            },
          ],
          important: true,
        },
        {
          title: 'OpenHttpConnections',
          metrics: [this.getOpenHttpConnections(clusterName)],
          important: true,
        },
      ],
    });
  }

  private getOpenHttpConnections(clusterName: string): Metric {
    return new Metric({
      metricName: 'active_http_connection_count',
      statistic: MetricStatistic.MAX as string,
      label: 'active_http_connection_count',
      dimensionsMap: {
        OTelLib: 'rpc',
        clusterName: clusterName,
      },
      namespace: PrivateChainMetricsNameSpace,
      period: Duration.minutes(1),
    });
  }

  private getMaxBlockchainHeightMetric(clusterName: string): Metric {
    return new Metric({
      metricName: 'blockchain_height',
      statistic: MetricStatistic.MAX as string,
      label: 'max_blockchain_height',
      dimensionsMap: {
        OTelLib: 'ethereum',
        clusterName: clusterName,
      },
      namespace: PrivateChainMetricsNameSpace,
      period: Duration.minutes(1),
    });
  }

  private getMinBlockchainHeightMetric(clusterName: string): Metric {
    return new Metric({
      metricName: 'blockchain_height',
      statistic: MetricStatistic.MIN as string,
      label: 'min_blockchain_height',
      dimensionsMap: {
        OTelLib: 'ethereum',
        clusterName: clusterName,
      },
      namespace: PrivateChainMetricsNameSpace,
      period: Duration.minutes(1),
    });
  }

  private getBlockchainBlockRateMetric(clusterName: string): MathExpression {
    return new MathExpression({
      expression: 'DIFF(m1)',
      usingMetrics: { m1: this.getMaxBlockchainHeightMetric(clusterName) },
      label: 'block_rate',
      period: Duration.minutes(1),
    });
  }

  private getP50PeerCountMetric(clusterName: string): Metric {
    return new Metric({
      metricName: 'peer_count',
      statistic: 'P50',
      label: 'p50_peer_count',
      dimensionsMap: {
        OTelLib: 'ethereum',
        clusterName: clusterName,
      },
      namespace: PrivateChainMetricsNameSpace,
      period: Duration.minutes(1),
    });
  }

  private getMinPeerCountMetric(clusterName: string): Metric {
    return new Metric({
      metricName: 'peer_count',
      statistic: MetricStatistic.MIN as string,
      label: 'min_peer_count',
      dimensionsMap: {
        OTelLib: 'ethereum',
        clusterName: clusterName,
      },
      namespace: PrivateChainMetricsNameSpace,
      period: Duration.minutes(1),
    });
  }

  private getBlockchainHeightDifferenceMetric(clusterName: string): MathExpression {
    return new MathExpression({
      expression: 'm1 - m2',
      usingMetrics: {
        m1: this.getMaxBlockchainHeightMetric(clusterName),
        m2: this.getMinBlockchainHeightMetric(clusterName),
      },
      label: 'blockchain_height_diff',
      period: Duration.minutes(1),
    });
  }

  private getGasUtilizationInTopBlock(clusterName: string): MathExpression {
    return new MathExpression({
      expression: '(m1/m2)*100',
      usingMetrics: {
        m1: this.getMaxGasUsedInTopBlockMetric(clusterName),
        m2: this.getMaxGasLimitPerBlockMetric(clusterName),
      },
      label: 'top_block_gas_utilization',
      period: Duration.minutes(1),
    });
  }

  private getMaxTransactionPoolSizeMetric(clusterName: string): Metric {
    return new Metric({
      metricName: 'transactions',
      statistic: MetricStatistic.MAX as string,
      label: 'max_transaction_pool_size',
      dimensionsMap: {
        OTelLib: 'transaction_pool',
        clusterName: clusterName,
      },
      namespace: PrivateChainMetricsNameSpace,
      period: Duration.minutes(1),
    });
  }

  private getMaxGasUsedInTopBlockMetric(clusterName: string): Metric {
    return new Metric({
      metricName: 'chain_head_gas_used',
      statistic: MetricStatistic.MAX as string,
      label: 'max_chain_head_gas_used',
      dimensionsMap: {
        OTelLib: 'blockchain',
        clusterName: clusterName,
      },
      namespace: PrivateChainMetricsNameSpace,
      period: Duration.minutes(1),
    });
  }

  private getMaxGasLimitPerBlockMetric(clusterName: string): Metric {
    return new Metric({
      metricName: 'chain_head_gas_limit',
      statistic: MetricStatistic.MAX as string,
      label: 'max_chain_head_gas_limit',
      dimensionsMap: {
        OTelLib: 'blockchain',
        clusterName: clusterName,
      },
      namespace: PrivateChainMetricsNameSpace,
      period: Duration.minutes(1),
    });
  }

  private getAvgTransactionPoolSizeMetric(clusterName: string): Metric {
    return new Metric({
      metricName: 'transactions',
      statistic: MetricStatistic.AVERAGE as string,
      label: 'avg_transaction_pool_size',
      dimensionsMap: {
        OTelLib: 'transaction_pool',
        clusterName: clusterName,
      },
      namespace: PrivateChainMetricsNameSpace,
      period: Duration.minutes(1),
    });
  }

  private getPercentileBlockchainHeightMetric(clusterName: string, percentile: number): Metric {
    return new Metric({
      metricName: 'blockchain_height',
      statistic: `P${percentile}`,
      label: `p${percentile}_blockchain_height`,
      dimensionsMap: {
        OTelLib: 'ethereum',
        clusterName: clusterName,
      },
      namespace: PrivateChainMetricsNameSpace,
      period: Duration.minutes(1),
    });
  }
}
