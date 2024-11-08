import { Handler } from 'aws-lambda';
import { uploadStringAsFile } from '../clients/s3Client';
import genesis from '../genesis/genesis.json';
import { getKeySetUniqueString } from '../helper/genesis-helper';
import keccak256 from 'keccak256';
import RLP from 'rlp';

const IBFT_VANITY_FIELD = "0x0000000000000000000000000000000000000000000000000000000000000000";
const ROUND_NUMBER_ZERO = "0x00000000";

export const handler: Handler = async (event, context) => {
  console.log('Config bucket: ', process.env.CONFIG_BUCKET);
  console.log('Request payload: ', event);
  const keySet = event;
  const keyMap = new Map(Object.entries(keySet));

  let addressArray = [];
  for (const [keyNumber, publicKeyBase64] of keyMap) {
    let address = toHexAddress(publicKeyBase64 as string);
    console.log("Address Added to List:", "0x" + address);
    addressArray.push("0x" + address);
  }
  const extraData = RLP.encode([IBFT_VANITY_FIELD, addressArray, "", ROUND_NUMBER_ZERO, []]);
  const extraDataHex = '0x' + Buffer.from(extraData).toString('hex');
  console.log("Extra Data:", extraDataHex);

  const keyStringArray = Array.from(keyMap.keys());
  const fileName = 'genesis-' + getKeySetUniqueString(keyStringArray) + '.json';
  console.log('Generating file: ', fileName);
  const genesis = generateGenesis(process.env.CHAIN_ID!, extraDataHex);
  console.log("Genesis file:", genesis);
  await uploadStringAsFile(fileName, genesis, process.env.CONFIG_BUCKET as string);
  console.log('Successfully uploaded genesis file to s3');
};

function generateGenesis(chainId: string, extraData: string): string {
  const templateObj = genesis;
  templateObj.extraData = extraData;
  templateObj.config.chainId = chainId;
  return JSON.stringify(templateObj);
}

function toHexAddress(publicKeyBase64: string): string {
   const publicKeyRaw = (publicKeyBase64.length == 120) ? publicKeyBase64.slice(32) : publicKeyBase64;
   return keccak256(Buffer.from(publicKeyRaw, 'base64')).toString('hex').slice(-40);
}