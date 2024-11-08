import { CLIENT_CONFIG } from './besu';
import * as cwConfigTemplate from '../config/cwAgentConfig.json';

export const PrivateChainMetricsNameSpace = 'BesuPrivateChain';

export function getCWAgentConfig(): string {
  const cwConfig = cwConfigTemplate;
  cwConfig.metrics.namespace = PrivateChainMetricsNameSpace;
  return JSON.stringify(cwConfig);
}

export function getOtelConfig(clusterName: string) {
  return (
    '' +
    'receivers:\n' +
    '  otlp:\n' +
    '    protocols:\n' +
    '      grpc:\n' +
    `        endpoint: 0.0.0.0:${CLIENT_CONFIG.OTEL_PORT}\n` + //not sure why we need this, but removing it breaks the whole thing.
    '      http:\n' +
    `        endpoint: 0.0.0.0:4318\n` +
    '\n' +
    'processors:\n' +
    '  batch/metrics:\n' +
    '    timeout: 60s\n' +
    '  resourcedetection:\n' +
    '    detectors:\n' +
    '      - ec2\n' +
    '  filter/1:\n' +
    '    metrics:\n' +
    '      include:\n' +
    '        match_type: strict\n' +
    '        metric_names:\n' +
    '          - chain_head_gas_limit\n' +
    '          - chain_head_gas_used\n' +
    '          - chain_head_timestamp\n' +
    '          - chain_head_transaction_count\n' +
    '          - difficulty_total\n' +
    '          - transactions\n' +
    '          - jvm.gc.collection\n' +
    '          - best_known_block_number\n' +
    '          - blockchain_height\n' +
    '          - peer_count\n' +
    '          - active_http_connection_count\n' +
    '  resource:\n' +
    '    attributes:\n' +
    '      - key: telemetry.sdk.name\n' +
    '        action: delete\n' +
    '      - key: telemetry.sdk.version\n' +
    '        action: delete\n' +
    '      - key: telemetry.sdk.language\n' +
    '        action: delete\n' +
    '      - key: cloud.platform\n' +
    '        action: delete\n' +
    '      - key: cloud.provider\n' +
    '        action: delete\n' +
    '      - key: host.name\n' +
    '        action: delete\n' +
    '      - key: host.type\n' +
    '        action: delete\n' +
    '      - key: host.image.id\n' +
    '        action: delete\n' +
    '      - key: service.name\n' +
    '        action: delete\n' +
    '      - key: clusterName\n' +
    `        value: "${clusterName}"\n` +
    '        action: insert\n' +
    '\n' +
    'exporters:\n' +
    '  awsemf:\n' +
    `    log_group_name: "/BesuPrivateChain/emfmetrics/${clusterName}"\n` +
    `    namespace: "${PrivateChainMetricsNameSpace}"\n` +
    '    resource_to_telemetry_conversion:\n' +
    '      enabled: true\n' +
    '  awsxray:\n' +
    'service:\n' +
    '  pipelines:\n' +
    '    metrics:\n' +
    '      receivers: [otlp]\n' +
    '      processors: [batch/metrics, resourcedetection, resource, filter/1]\n' +
    '      exporters: [awsemf]\n' +
    '    traces:\n' +
    '      receivers: [otlp]\n' +
    '      exporters: [awsxray]\n'
  );
}
