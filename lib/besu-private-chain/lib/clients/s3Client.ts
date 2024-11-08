import { S3 } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const s3 = new S3({});

export async function uploadStringAsFile(fileName: string, content: string, bucket: string) {
  await s3.putObject({
    Bucket: bucket,
    Key: fileName,
    ContentType: 'application/json',
    Body: Buffer.from(content),
  });
}

export async function getFileAsString(fileName: string, bucket: string) {
  try {
    const s3Return = await s3.getObject({
      Bucket: bucket,
      Key: fileName,
    });
    console.log(`Successfully fetched from ${bucket}/${fileName}`);
    const stream = s3Return.Body!;
    const fileContents = await streamToString(stream as Readable);
    console.log('File: ', fileContents);
    return fileContents;
  } catch (error) {
    console.error(`Failed to fetch from ${bucket}/${fileName}`);
    console.error(error);
    throw error;
  }
}

function streamToString(stream: Readable) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Array<any> = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}
