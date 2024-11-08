import { Effect, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';

/**
 * Default policy for EC2 instances.
 */
export const EC2DefaultPolicy = {
  ecrPull: new PolicyDocument({
    statements: [
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['ecr:BatchGetImage', 'ecr:GetAuthorizationToken', 'ecr:GetDownloadUrlForLayer'],
        resources: ['*'],
      }),
    ],
  })
};
