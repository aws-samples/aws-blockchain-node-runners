import assert from 'assert';
import {
  ChangeResourceRecordSetsCommand,
  Route53Client,
  waitUntilResourceRecordSetsChanged,
} from '@aws-sdk/client-route-53';

//export for unit testing
export const route53Client = new Route53Client({});

export async function updateIPAddressMapping(hostedZoneId: string, hostName: string, newIPAddress: string) {
  const upsertCommand = new ChangeResourceRecordSetsCommand({
    HostedZoneId: hostedZoneId,
    ChangeBatch: {
      Changes: [
        {
          Action: 'UPSERT',
          ResourceRecordSet: {
            Name: hostName,
            Type: 'A',
            TTL: 60,
            ResourceRecords: [{ Value: newIPAddress }],
          },
        },
      ],
      Comment: `Asg instance launch hook changes DNS record to point to the new IP: ${newIPAddress}`,
    },
  });

  const { $metadata, ChangeInfo } = await route53Client.send(upsertCommand);
  assert(typeof ChangeInfo !== 'undefined' && $metadata.httpStatusCode === 200, 'Failed to update DNS entry');
  await waitUntilResourceRecordSetsChanged({ client: route53Client, maxWaitTime: 300 }, ChangeInfo);
}
