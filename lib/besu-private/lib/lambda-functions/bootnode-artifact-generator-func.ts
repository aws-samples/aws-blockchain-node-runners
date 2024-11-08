import { Handler } from 'aws-lambda';
import { uploadStringAsFile } from '../clients/s3Client';
import { getBootnodesFileName } from '../helper/genesis-helper';
import { getValidatorHostName } from '../constants/resource-names';
import { CLIENT_CONFIG } from '../constants/besu';
import { getBase64PublicKeyInHex } from '../helper/bootnode-helper';

export const handler: Handler = async (event, context) => {
  console.log('Config bucket: ', process.env.CONFIG_BUCKET);
  console.log('Request payload: ', event);
  const keySet = event.keySet;
  const keyMap = new Map(Object.entries(keySet));

  const keyStringArray = Array.from(keyMap.keys());
  const fileName = getBootnodesFileName(keyStringArray);
  console.log('Generating file: ', fileName);

  const enodes = [...keyMap.keys()].map((keyNum) =>
    getEnode(
      getBase64PublicKeyInHex(keyMap.get(keyNum) as string),
      keyNum,
      process.env.SHARD_ID as string,
      CLIENT_CONFIG.DISCOVERY_PORT.toString(),
    ),
  );
  await uploadStringAsFile(fileName, JSON.stringify(enodes), process.env.CONFIG_BUCKET as string);
  console.log('Successfully uploaded statis node file to s3');
};

function getEnode(publicKey: string, keyNum: string, shardId: string, port: string): string {
  return `enode://${publicKey}@${getValidatorHostName(shardId, Number(keyNum))}:${port}`;
}
