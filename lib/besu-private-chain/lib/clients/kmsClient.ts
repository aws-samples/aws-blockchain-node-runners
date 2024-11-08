import { KMSClient, DescribeKeyCommand, GetPublicKeyCommand } from '@aws-sdk/client-kms';

const kmsClient = new KMSClient({});

export async function getPublicKey(keyAlias: string) {
  const getPublicKeyCommand = new GetPublicKeyCommand({
    KeyId: 'alias/' + keyAlias,
  });

  return await kmsClient.send(getPublicKeyCommand);
}
